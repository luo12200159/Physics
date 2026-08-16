import { createHmac, randomBytes, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { ApiError } from "../../common/errors.js";
import type { AuthenticatedSession } from "../auth/service.js";
import type { AuthUser } from "../auth/contracts.js";

const TOKEN_PATTERN = /^oc1\.([A-Za-z0-9_-]{43})$/u;
const OWNER_TOKEN_DOMAIN = "physics-studio-class-owner-v1\u0000";
const DEVICE_ID_DOMAIN = "physics-studio-class-owner-device-v1\u0000";
const OWNER_CAPABILITY_TTL_SECONDS = 365 * 24 * 60 * 60;

export interface OwnerCapabilityMaterial {
  id: string;
  ownerUserId: string;
  token: string;
  tokenHash: Buffer;
  expiresAt: Date;
}

export type PersistableOwnerCapabilityMaterial = OwnerCapabilityMaterial & { classId: string };

export interface OwnerCapabilityServiceOptions {
  pool: Pool;
  secret: string | Buffer;
  now?: () => Date;
}

interface OwnerCapabilityRow {
  id: string;
  owner_user_id: string;
  class_id: string;
  expires_at: Date;
  created_at: Date;
  user_display_name: string;
  user_status: "active" | "disabled";
}

function secretBytes(secret: string | Buffer): Buffer {
  const bytes = typeof secret === "string" ? Buffer.from(secret, "utf8") : secret;
  if (bytes.length < 32) throw new TypeError("Owner capability secret must contain at least 32 bytes");
  return bytes;
}

export function hashOwnerCapability(token: string, secret: string | Buffer): Buffer {
  if (!TOKEN_PATTERN.test(token)) throw new TypeError("Owner capability is malformed");
  return createHmac("sha256", secretBytes(secret))
    .update(OWNER_TOKEN_DOMAIN, "utf8")
    .update(token, "utf8")
    .digest();
}

export function createOwnerCapability(
  ownerUserId: string,
  secret: string | Buffer,
  now: Date = new Date(),
): OwnerCapabilityMaterial {
  const id = randomUUID();
  const token = `oc1.${randomBytes(32).toString("base64url")}`;
  return {
    id,
    ownerUserId,
    token,
    tokenHash: hashOwnerCapability(token, secret),
    expiresAt: new Date(now.getTime() + OWNER_CAPABILITY_TTL_SECONDS * 1_000),
  };
}

export async function insertOwnerUser(
  tx: PoolClient,
  userId: string,
  displayName: string,
  now: Date,
): Promise<void> {
  await tx.query(
    `insert into users(id, role, display_name, status, created_at, updated_at)
       values ($1, 'teacher', $2, 'active', $3, $3)`,
    [userId, displayName, now],
  );
}

export async function insertOwnerCapability(
  tx: PoolClient,
  material: PersistableOwnerCapabilityMaterial,
  now: Date,
): Promise<void> {
  await tx.query(
    `insert into class_owner_capabilities(
       id, class_id, owner_user_id, token_hash, expires_at, created_at
     ) values ($1, $2, $3, $4, $5, $6)`,
    [material.id, material.classId, material.ownerUserId, material.tokenHash, material.expiresAt, now],
  );
}

// Kept separate from the auth bearer-token parser: the `Owner` scheme is
// accepted only by class-management routes and never by student join routes.
export class OwnerCapabilityService {
  private readonly secret: Buffer;
  private readonly now: () => Date;

  constructor(private readonly options: OwnerCapabilityServiceOptions) {
    this.secret = secretBytes(options.secret);
    this.now = options.now ?? (() => new Date());
  }

  async authenticate(token: string): Promise<AuthenticatedSession> {
    const tokenHash = hashOwnerCapability(token, this.secret);
    const result = await this.options.pool.query<OwnerCapabilityRow>(
      `select capabilities.id, capabilities.owner_user_id, capabilities.class_id,
              capabilities.expires_at, capabilities.created_at,
              users.display_name as user_display_name, users.status as user_status
         from class_owner_capabilities capabilities
         join users on users.id = capabilities.owner_user_id
        where capabilities.token_hash = $1
          and capabilities.revoked_at is null
          and capabilities.expires_at > $2
          and users.role = 'teacher'`,
      [tokenHash, this.now()],
    );
    const row = result.rows[0];
    if (!row || row.user_status !== "active") {
      throw new ApiError(401, "invalid_owner_capability", "Owner capability is invalid or expired");
    }
    const nowSeconds = Math.floor(this.now().getTime() / 1_000);
    const user: AuthUser = {
      id: row.owner_user_id,
      role: "teacher",
      displayName: row.user_display_name,
      status: "active",
      mustChangePassword: false,
      deletionPending: false,
    };
    const deviceId = createHmac("sha256", this.secret)
      .update(DEVICE_ID_DOMAIN, "utf8")
      .update(row.owner_user_id, "utf8")
      .digest("hex");
    return {
      userId: row.owner_user_id,
      role: "teacher",
      familyId: row.id,
      deviceId,
      sessionStrength: "reauthenticated",
      jti: row.id,
      issuedAt: Math.floor(row.created_at.getTime() / 1_000),
      expiresAt: Math.floor(row.expires_at.getTime() / 1_000),
      reauthenticatedUntil: Math.max(nowSeconds, Math.floor(row.expires_at.getTime() / 1_000)),
      user,
      positiveSessionStatus: "active",
      replayOnly: false,
    };
  }
}
