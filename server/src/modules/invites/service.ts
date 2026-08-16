import { createHash, createHmac, randomUUID } from "node:crypto";

import type { Pool } from "pg";

import { ApiError } from "../../common/errors.js";
import { executeIdempotently, type MutationIdempotency } from "../../common/idempotency.js";
import { withTransaction } from "../../infrastructure/db.js";
import { appendAudit, hashAuditIp } from "../audit/repository.js";
import { authorize, type Actor, type ResourceContext } from "../authorization/policy.js";
import { appendMembershipOutbox } from "../classes/outbox.js";
import { ClassesRepository } from "../classes/repository.js";
import { DUMMY_PASSWORD_HASH } from "../auth/service.js";
import {
  createRefreshToken,
  issueAccessToken,
  normalizeDeviceId,
} from "../auth/tokens.js";
import type {
  CreateInviteRequest,
  InviteCreated,
  InviteListResponse,
  JoinInviteAnonymousRequest,
  JoinInviteAnonymousResponse,
  JoinInviteRequest,
  JoinInviteResponse,
  RevokeInviteResponse,
} from "./contracts.js";
import { InvitesRepository } from "./repository.js";

const JOIN_RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 or redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export interface InviteRedis {
  eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;
  set?(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  del?(key: string): Promise<unknown>;
}

export interface InviteServiceOptions {
  pool: Pool;
  redis: InviteRedis;
  inviteCodeKey: string | Buffer;
  auditIpKey: string | Buffer;
  syncOutboxRetentionDays: number;
  jwtSecret?: string | Uint8Array;
  refreshTokenTtlSeconds?: number;
  now?: () => Date;
}

export interface InviteMutationContext {
  ip: string;
  requestId: string;
  idempotency: MutationIdempotency;
}

function encodeKey(key: string | Buffer): Buffer {
  const encoded = typeof key === "string" ? Buffer.from(key, "utf8") : key;
  if (encoded.length < 32) throw new TypeError("inviteCodeKey must contain at least 32 bytes");
  return encoded;
}

export function deriveInviteCode(inviteId: string, key: string | Buffer): string {
  if (!UUID_PATTERN.test(inviteId)) throw new TypeError("inviteId must be a lowercase UUID");
  return createHmac("sha256", encodeKey(key))
    .update("physics-studio-invite-v1\u0000", "utf8")
    .update(inviteId, "utf8")
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

export function hashInviteCode(code: string): Buffer {
  if (!INVITE_CODE_PATTERN.test(code)) throw new TypeError("Invite code is malformed");
  return createHash("sha256").update(code, "utf8").digest();
}

function isInviteCodeCollision(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)
    || (error as { code?: unknown }).code !== "23505") return false;
  const constraint = "constraint" in error
    ? String((error as { constraint?: unknown }).constraint || "")
    : "";
  // PostgreSQL names the inline UNIQUE constraint invites_code_hash_key.
  // Do not retry idempotency or unrelated uniqueness failures.
  return constraint === "invites_code_hash_key" || constraint.endsWith("_code_hash_key");
}

function apiExpiry(now: Date): Date {
  return new Date(Math.max(now.getTime(), Date.now()) + 24 * 60 * 60 * 1_000);
}

function resourceForClass(
  classId: string,
  ownerTeacherId: string,
  activeMember: boolean,
): ResourceContext {
  return {
    classId,
    ownerTeacherId,
    ownerUserId: null,
    activeMember,
    guardianLinked: false,
  };
}

function guestUserId(deviceId: string): string {
  const bytes = createHash("sha256")
    .update("physics-studio-guest-student-v1\u0000", "utf8")
    .update(deviceId, "utf8")
    .digest();
  // SHA-256 always yields 32 bytes; set RFC 4122 version/variant bits on the
  // deterministic guest identifier without trusting a client-supplied ID.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function guestDisplayName(value: string): string {
  const name = value.normalize("NFKC").trim();
  if (name.length < 1 || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new ApiError(400, "validation_error", "Student remark name is invalid");
  }
  return name;
}

export class InvitesService {
  private readonly repository: InvitesRepository;
  private readonly classes: ClassesRepository;
  private readonly inviteCodeKey: Buffer;
  private readonly now: () => Date;

  constructor(private readonly options: InviteServiceOptions) {
    if (!Number.isInteger(options.syncOutboxRetentionDays)
      || options.syncOutboxRetentionDays < 1
      || options.syncOutboxRetentionDays > 3_650) {
      throw new TypeError("syncOutboxRetentionDays must be between 1 and 3650");
    }
    this.repository = new InvitesRepository(options.pool);
    this.classes = new ClassesRepository(options.pool);
    this.inviteCodeKey = encodeKey(options.inviteCodeKey);
    this.now = options.now ?? (() => new Date());
  }

  private async enforceJoinRateLimit(codeHash: Buffer, ip: string): Promise<void> {
    const ipHash = hashAuditIp(this.options.auditIpKey, ip).toString("hex");
    let result: unknown;
    try {
      result = await this.options.redis.eval(
        JOIN_RATE_LIMIT_SCRIPT,
        1,
        `rate:inviteJoin:${ipHash}:${codeHash.toString("hex")}`,
        900,
      );
    } catch {
      throw new ApiError(503, "rate_limit_unavailable", "Invite rate limit is temporarily unavailable");
    }
    const attempts = Number(result);
    if (!Number.isSafeInteger(attempts) || attempts < 1) {
      throw new ApiError(503, "rate_limit_unavailable", "Invite rate limit is temporarily unavailable");
    }
    if (attempts > 10) {
      throw new ApiError(429, "rate_limit_exceeded", "Too many invite attempts");
    }
  }

  async createInvite(
    actor: Actor,
    classId: string,
    input: CreateInviteRequest,
    context: InviteMutationContext,
  ): Promise<InviteCreated> {
    const now = this.now();
    const expiresAt = new Date(input.expiresAt);
    if (!Number.isFinite(expiresAt.getTime())) {
      throw new ApiError(400, "invalid_invite_expiry", "Invite expiry is invalid");
    }
    const normalizedExpiry = expiresAt.toISOString();
    let result: {
      statusCode: number;
      body: { id: string; expiresAt: string; maxUses: number } | null;
    } | null = null;
    for (let collisionAttempt = 0; collisionAttempt < 3 && !result; collisionAttempt += 1) {
      try {
        result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
      ...context.idempotency,
      actorId: actor.userId,
      expiresAt: new Date(Math.max(apiExpiry(now).getTime(), expiresAt.getTime() + 24 * 60 * 60 * 1_000)),
    }, async () => {
      const access = await this.classes.lockClassAccess(tx, actor.userId, classId);
      if (!access) throw new ApiError(404, "class_not_found", "Class was not found");
      const decision = authorize(
        actor,
        "class.manage",
        resourceForClass(classId, access.ownerTeacherId, access.activeMember),
      );
      if (!decision.allowed) {
        if (decision.code === "reauthentication_required") {
          throw new ApiError(403, decision.code, "Recent password verification is required");
        }
        throw new ApiError(403, decision.code, "Resource access is forbidden");
      }
      if (access.classView.status !== "active") {
        throw new ApiError(409, "class_archived", "Archived classes cannot create invites");
      }
      const minimum = now.getTime() + 5 * 60 * 1_000;
      const maximum = now.getTime() + 30 * 24 * 60 * 60 * 1_000;
      if (expiresAt.getTime() < minimum || expiresAt.getTime() > maximum) {
        throw new ApiError(
          400,
          "invalid_invite_expiry",
          "Invite expiry must be between 5 minutes and 30 days from now",
        );
      }
      const inviteId = randomUUID();
      const code = deriveInviteCode(inviteId, this.inviteCodeKey);
      // A class exposes one current student invite. Generating a replacement
      // immediately invalidates older active codes without touching existing
      // memberships or independent learning records.
      await this.repository.revokeActiveClassInvites(tx, classId);
      await this.repository.insertInvite(tx, {
        id: inviteId,
        classId,
        codeHash: hashInviteCode(code),
        expiresAt,
        maxUses: input.maxUses,
        createdBy: actor.userId,
        createdAt: now,
      });
      await appendAudit(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        action: "invite.create",
        resourceType: "invite",
        resourceId: inviteId,
        classId,
        result: "succeeded",
        beforeState: null,
        afterState: {
          id: inviteId,
          classId,
          expiresAt: normalizedExpiry,
          maxUses: input.maxUses,
        },
        reason: null,
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return {
        statusCode: 201,
        body: { id: inviteId, expiresAt: normalizedExpiry, maxUses: input.maxUses },
      };
        }));
      } catch (error) {
        if (!isInviteCodeCollision(error) || collisionAttempt >= 2) throw error;
        // A new transaction generates a new random invite id and therefore a
        // new code. The retry is bounded to avoid hiding persistent failures.
      }
    }
    if (!result) throw new Error("Invite creation did not return a response");
    if (result.body === null) throw new Error("Invite response is missing");
    return {
      id: result.body.id,
      code: deriveInviteCode(result.body.id, this.inviteCodeKey),
      expiresAt: result.body.expiresAt,
      maxUses: result.body.maxUses,
    };
  }

  async listInvites(
    actor: Actor,
    classId: string,
    cursor: string | null,
  ): Promise<InviteListResponse> {
    const access = await this.classes.findClassAccess(actor.userId, classId);
    if (!access) throw new ApiError(404, "class_not_found", "Class was not found");
    if (actor.role !== "administrator" && access.ownerTeacherId !== actor.userId) {
      throw new ApiError(403, "resource_forbidden", "Invite list access is forbidden");
    }
    return this.repository.listInvites(classId, cursor);
  }

  async revokeInvite(
    actor: Actor,
    inviteId: string,
    context: InviteMutationContext,
  ): Promise<RevokeInviteResponse> {
    const now = this.now();
    const result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
      ...context.idempotency,
      actorId: actor.userId,
      expiresAt: apiExpiry(now),
    }, async () => {
      const invite = await this.repository.lockById(tx, inviteId);
      if (!invite) throw new ApiError(404, "invite_not_found", "Invite was not found");
      const decision = authorize(
        actor,
        "class.manage",
        resourceForClass(invite.classId, invite.ownerTeacherId, false),
      );
      if (!decision.allowed) {
        if (decision.code === "reauthentication_required") {
          throw new ApiError(403, decision.code, "Recent password verification is required");
        }
        throw new ApiError(403, decision.code, "Resource access is forbidden");
      }
      if (invite.status !== "revoked") await this.repository.revokeInvite(tx, invite.id);
      await appendAudit(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        action: "invite.revoke",
        resourceType: "invite",
        resourceId: invite.id,
        classId: invite.classId,
        result: "succeeded",
        beforeState: { status: invite.status },
        afterState: { status: "revoked" },
        reason: invite.status === "revoked" ? "already_revoked" : null,
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return { statusCode: 200, body: { id: invite.id, status: "revoked" as const } };
    }));
    if (result.body === null) throw new Error("Revoke invite response is missing");
    return result.body;
  }

  async joinInvite(
    actor: Actor,
    input: JoinInviteRequest,
    context: InviteMutationContext,
  ): Promise<JoinInviteResponse> {
    if (actor.role !== "student") {
      throw new ApiError(403, "student_role_required", "Only students can join with an invite");
    }
    let codeHash: Buffer;
    try {
      codeHash = hashInviteCode(input.code);
    } catch {
      throw new ApiError(400, "validation_error", "Invite code is malformed");
    }
    const now = this.now();
    const result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
      ...context.idempotency,
      actorId: actor.userId,
      expiresAt: apiExpiry(now),
    }, async () => {
      await this.enforceJoinRateLimit(codeHash, context.ip);
      const invite = await this.repository.lockByCodeHash(tx, codeHash);
      if (!invite) throw new ApiError(404, "invite_not_found", "Invite was not found");
      if (invite.classStatus !== "active" || invite.status === "revoked"
        || invite.status === "expired" || invite.expiresAt.getTime() <= now.getTime()) {
        throw new ApiError(409, "invite_unavailable", "Invite is unavailable");
      }
      if (invite.status === "exhausted" || invite.usedCount >= invite.maxUses) {
        throw new ApiError(409, "invite_exhausted", "Invite has reached its use limit");
      }
      await this.repository.lockMembershipIdentity(tx, invite.classId, actor.userId);
      const existing = await this.repository.findLiveMembership(tx, invite.classId, actor.userId);
      if (existing) {
        await appendAudit(tx, {
          actorId: actor.userId,
          actorRole: actor.role,
          action: "invite.join",
          resourceType: "invite",
          resourceId: invite.id,
          classId: invite.classId,
          result: "succeeded",
          beforeState: { membershipId: existing.id, status: existing.status },
          afterState: { membershipId: existing.id, status: existing.status, reused: true },
          reason: "existing_membership",
          requestId: context.requestId,
          ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
        });
        return {
          statusCode: 201,
          body: {
            membershipId: existing.id,
            status: existing.status === "active" ? "active" as const : "pending" as const,
          },
        };
      }
      const membership = await this.repository.insertPendingMembership(
        tx,
        randomUUID(),
        invite.classId,
        actor.userId,
        now,
      );
      await this.repository.consumeInvite(
        tx,
        invite.id,
        invite.usedCount,
        invite.usedCount + 1 === invite.maxUses,
      );
      await appendMembershipOutbox(tx, {
        membership,
        ownerTeacherId: invite.ownerTeacherId,
        operation: "create",
        occurredAt: now,
        retentionDays: this.options.syncOutboxRetentionDays,
      });
      await appendAudit(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        action: "invite.join",
        resourceType: "invite",
        resourceId: invite.id,
        classId: invite.classId,
        result: "succeeded",
        beforeState: { usedCount: invite.usedCount },
        afterState: {
          usedCount: invite.usedCount + 1,
          membershipId: membership.id,
          status: membership.status,
        },
        reason: null,
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return {
        statusCode: 201,
        body: { membershipId: membership.id, status: "pending" as const },
      };
    }));
    if (result.body === null) throw new Error("Join response is missing");
    return result.body;
  }

  /**
   * Join a class without a pre-existing account. The invite code is still
   * checked and consumed server-side; the only identity material accepted is
   * a device-bound id and a student-facing remark name. A synthetic student
   * account is persisted so the normal class isolation, roster and sync
   * policies continue to apply.
   */
  async joinInviteAnonymous(
    input: JoinInviteAnonymousRequest,
    context: InviteMutationContext,
  ): Promise<JoinInviteAnonymousResponse> {
    const codeHash = (() => {
      try { return hashInviteCode(input.code); } catch {
        throw new ApiError(400, "validation_error", "Invite code is malformed");
      }
    })();
    const deviceId = (() => {
      try { return normalizeDeviceId(input.deviceId); } catch {
        throw new ApiError(400, "validation_error", "Device identifier is invalid");
      }
    })();
    const displayName = guestDisplayName(input.displayName);
    const userId = guestUserId(deviceId);
    const now = this.now();
    const refreshTtl = this.options.refreshTokenTtlSeconds ?? 2_592_000;
    if (!this.options.jwtSecret || refreshTtl !== 2_592_000) {
      throw new ApiError(503, "guest_session_unavailable", "Student guest sessions are not configured");
    }
    const refresh = createRefreshToken();
    const familyId = randomUUID();
    const expiresAt = new Date(now.getTime() + refreshTtl * 1_000);

    const result = await withTransaction(this.options.pool, async (tx) => {
      await this.enforceJoinRateLimit(codeHash, context.ip);
      const invite = await this.repository.lockByCodeHash(tx, codeHash);
      if (!invite) throw new ApiError(404, "invite_not_found", "Invite was not found");
      if (invite.classStatus !== "active" || invite.status === "revoked"
        || invite.status === "expired" || invite.expiresAt.getTime() <= now.getTime()) {
        throw new ApiError(409, "invite_unavailable", "Invite is unavailable");
      }
      if (invite.status === "exhausted" || invite.usedCount >= invite.maxUses) {
        throw new ApiError(409, "invite_exhausted", "Invite has reached its use limit");
      }

      await tx.query(
        `insert into users(id, role, display_name, status, must_change_password, created_at, updated_at)
           values ($1, 'student', $2, 'active', false, $3, $3)
         on conflict (id) do update
           set display_name = excluded.display_name, updated_at = excluded.updated_at
         where users.role = 'student'`,
        [userId, displayName, now],
      );
      // Keep the existing auth schema happy without exposing a login or
      // password to the student UI. The dummy hash is not a usable credential.
      await tx.query(
        `insert into password_credentials(user_id, login_normalized, password_hash, credential_version, changed_at)
           values ($1, $2, $3, 1, $4)
         on conflict (user_id) do nothing`,
        [userId, `guest-${userId}`, DUMMY_PASSWORD_HASH, now],
      );

      await this.repository.lockMembershipIdentity(tx, invite.classId, userId);
      const existing = await this.repository.findLiveMembership(tx, invite.classId, userId);
      let membershipId: string;
      let membershipStatus: "pending" | "active";
      if (existing) {
        membershipId = existing.id;
        if (existing.status === "pending") {
          await this.repository.activateMembership(tx, existing.id, now);
          membershipStatus = "active";
        } else {
          membershipStatus = "active";
        }
      } else {
        const membership = await this.repository.insertActiveMembership(
          tx,
          randomUUID(),
          invite.classId,
          userId,
          now,
        );
        membershipId = membership.id;
        membershipStatus = "active";
        await this.repository.consumeInvite(tx, invite.id, invite.usedCount, invite.usedCount + 1 === invite.maxUses);
        await appendMembershipOutbox(tx, {
          membership,
          ownerTeacherId: invite.ownerTeacherId,
          operation: "create",
          occurredAt: now,
          retentionDays: this.options.syncOutboxRetentionDays,
        });
      }
      await tx.query(
        `insert into refresh_sessions(
           id, family_id, parent_id, user_id, device_id, device_name,
           token_hash, session_strength, expires_at, created_at
         ) values ($1, $2, null, $3, $4, $5, $6, 'password', $7, $8)`,
        [refresh.tokenId, familyId, userId, deviceId, "Student device", refresh.secretHash, expiresAt, now],
      );
      await appendAudit(tx, {
        actorId: userId,
        actorRole: "student",
        action: "invite.join.anonymous",
        resourceType: "invite",
        resourceId: invite.id,
        classId: invite.classId,
        result: "succeeded",
        beforeState: null,
        afterState: { membershipId, status: membershipStatus },
        reason: null,
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return { membershipId, classId: invite.classId, status: membershipStatus };
    });

    if (!this.options.redis.set) throw new ApiError(503, "guest_session_unavailable", "Student guest sessions are not configured");
    try {
      const stored = await this.options.redis.set(
        `auth:session:${familyId}`,
        JSON.stringify({ userId, deviceId, status: "active" }),
        "EX",
        refreshTtl,
      );
      if (stored !== "OK") throw new Error("session store rejected guest session");
      const accessToken = await issueAccessToken({
        userId,
        role: "student",
        familyId,
        deviceId,
        sessionStrength: "password",
        jti: randomUUID(),
        nowSeconds: Math.floor(now.getTime() / 1_000),
      }, typeof this.options.jwtSecret === "string"
        ? Buffer.from(this.options.jwtSecret, "utf8")
        : this.options.jwtSecret);
      return {
        accessToken,
        refreshToken: refresh.token,
        user: {
          id: userId,
          role: "student",
          displayName,
          status: "active",
          mustChangePassword: false,
          deletionPending: false,
        },
        membershipId: result.membershipId,
        classId: result.classId,
        status: result.status,
      };
    } catch {
      await this.options.redis.del?.(`auth:session:${familyId}`);
      throw new ApiError(503, "guest_session_unavailable", "Student guest sessions are temporarily unavailable");
    }
  }
}

export function createInvitesService(options: InviteServiceOptions): InvitesService {
  return new InvitesService(options);
}
