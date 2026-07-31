import { createHmac, randomUUID } from "node:crypto";

import type { Pool } from "pg";

import { ApiError } from "../../common/errors.js";
import { hashAuditIp } from "../audit/repository.js";
import type { AuthResponse, AuthUser, LoginRequest } from "./contracts.js";
import { verifyPassword } from "./password.js";
import { AuthRepository, normalizeLogin, type UserLifecycleRecord } from "./repository.js";
import {
  createRefreshToken,
  issueAccessToken,
  normalizeDeviceId,
  verifyAccessToken,
  type AccessClaims,
} from "./tokens.js";

const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,p=1,t=3$AAECAwQFBgcICQoLDA0ODw$g+cyBgEd91RhaGj522HX0zaMuGIVFhZOtD/id/PK358";
const LOGIN_RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 or redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export type PositiveSessionStatus = "active";
type LifecycleGateStatus = "active" | "passwordChangeRequired" | "deletionPending";

export interface PositiveSession {
  userId: string;
  deviceId: string;
  status: PositiveSessionStatus;
}

export interface AuthRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

export interface AuthServiceOptions {
  pool: Pool;
  redis: AuthRedis;
  jwtSecret: string | Uint8Array;
  auditIpKey: string | Buffer;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  now?: () => Date;
}

export interface LoginContext {
  ip: string;
}

export interface AuthenticatedSession extends AccessClaims {
  user: AuthUser;
  positiveSessionStatus: PositiveSessionStatus;
}

function invalidCredentials(): ApiError {
  return new ApiError(401, "invalid_credentials", "Login or password is incorrect");
}

function invalidAccessToken(): ApiError {
  return new ApiError(401, "invalid_access_token", "Access token is invalid or expired");
}

function toAuthUser(record: UserLifecycleRecord): AuthUser {
  return {
    id: record.id,
    role: record.role,
    displayName: record.displayName,
    status: record.status,
    mustChangePassword: record.mustChangePassword,
    deletionPending: record.deletionPending,
  };
}

function lifecycleStatus(record: Pick<UserLifecycleRecord, "mustChangePassword" | "deletionPending">): LifecycleGateStatus {
  if (record.deletionPending) return "deletionPending";
  if (record.mustChangePassword) return "passwordChangeRequired";
  return "active";
}

function parsePositiveSession(value: string): PositiveSession {
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("Positive session is invalid");
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "deviceId,status,userId") {
    throw new TypeError("Positive session has unknown fields");
  }
  if (typeof record.userId !== "string" || typeof record.deviceId !== "string") {
    throw new TypeError("Positive session identity is invalid");
  }
  if (record.status !== "active") {
    throw new TypeError("Positive session status is invalid");
  }
  return {
    userId: record.userId,
    deviceId: normalizeDeviceId(record.deviceId),
    status: record.status,
  };
}

function encodeSecret(secret: string | Uint8Array): Uint8Array {
  return typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
}

export class AuthService {
  private readonly repository: AuthRepository;
  private readonly jwtSecret: Uint8Array;
  private readonly now: () => Date;

  constructor(private readonly options: AuthServiceOptions) {
    if (options.accessTokenTtlSeconds !== 900 || options.refreshTokenTtlSeconds !== 2_592_000) {
      throw new TypeError("Authentication TTLs must match protocol v1");
    }
    this.repository = new AuthRepository(options.pool);
    this.jwtSecret = encodeSecret(options.jwtSecret);
    if (this.jwtSecret.byteLength < 32) throw new TypeError("JWT secret must contain at least 32 bytes");
    this.now = options.now ?? (() => new Date());
  }

  private async enforceLoginRateLimit(loginNormalized: string, ip: string): Promise<void> {
    const ipHash = hashAuditIp(this.options.auditIpKey, ip).toString("hex");
    const loginHash = createHmac("sha256", this.options.auditIpKey)
      .update("login\u0000", "utf8")
      .update(loginNormalized, "utf8")
      .digest("hex");
    let result: unknown;
    try {
      result = await this.options.redis.eval(
        LOGIN_RATE_LIMIT_SCRIPT,
        1,
        `rate:login:${ipHash}:${loginHash}`,
        900,
      );
    } catch {
      throw new ApiError(503, "rate_limit_unavailable", "Login rate limit is temporarily unavailable");
    }
    const attempts = Number(result);
    if (!Number.isSafeInteger(attempts) || attempts < 1) {
      throw new ApiError(503, "rate_limit_unavailable", "Login rate limit is temporarily unavailable");
    }
    if (attempts > 5) throw new ApiError(429, "rate_limit_exceeded", "Too many login attempts");
  }

  async login(input: LoginRequest, context: LoginContext): Promise<AuthResponse> {
    let loginNormalized: string;
    let loginIsValid = true;
    try {
      loginNormalized = normalizeLogin(input.login);
    } catch {
      loginIsValid = false;
      loginNormalized = `invalid-${createHmac("sha256", this.options.auditIpKey).update(input.login).digest("hex")}`;
    }
    await this.enforceLoginRateLimit(loginNormalized, context.ip);

    const deviceId = normalizeDeviceId(input.deviceId);
    const deviceName = input.deviceName.trim();
    if (deviceName.length < 1 || deviceName.length > 80 || input.password.length > 1_024) {
      await verifyPassword(DUMMY_PASSWORD_HASH, input.password);
      throw invalidCredentials();
    }
    const credential = loginIsValid ? await this.repository.findCredentialByLogin(loginNormalized) : null;
    const passwordMatches = await verifyPassword(credential?.passwordHash ?? DUMMY_PASSWORD_HASH, input.password);
    const now = this.now();
    const temporaryExpired = credential?.temporaryExpiresAt !== null
      && credential?.temporaryExpiresAt !== undefined
      && credential.temporaryExpiresAt.getTime() <= now.getTime();
    if (!credential || !passwordMatches || credential.status !== "active" || temporaryExpired) {
      throw invalidCredentials();
    }

    const refresh = createRefreshToken();
    const familyId = randomUUID();
    const expiresAt = new Date(now.getTime() + this.options.refreshTokenTtlSeconds * 1000);
    const inserted = await this.repository.insertInitialRefreshSession({
      id: refresh.tokenId,
      familyId,
      userId: credential.id,
      deviceId,
      deviceName,
      tokenHash: refresh.secretHash,
      sessionStrength: "password",
      expiresAt,
      createdAt: now,
    });
    if (!inserted) throw invalidCredentials();

    const session: PositiveSession = { userId: credential.id, deviceId, status: "active" };
    try {
      const setResult = await this.options.redis.set(
        `auth:session:${familyId}`,
        JSON.stringify(session),
        "EX",
        this.options.refreshTokenTtlSeconds,
      );
      if (setResult !== "OK") throw new Error("Redis did not acknowledge the session");
      const accessToken = await issueAccessToken({
        userId: credential.id,
        role: credential.role,
        familyId,
        deviceId,
        sessionStrength: "password",
        jti: randomUUID(),
        nowSeconds: Math.floor(now.getTime() / 1000),
      }, this.jwtSecret);
      return {
        accessToken,
        refreshToken: refresh.token,
        user: toAuthUser(credential),
      };
    } catch {
      await Promise.allSettled([
        this.repository.revokeFamily(familyId, "session_store_unavailable", now),
        this.options.redis.del(`auth:session:${familyId}`),
      ]);
      throw new ApiError(503, "session_store_unavailable", "Authentication session is temporarily unavailable");
    }
  }

  async authenticateAccessToken(token: string, routeIdentity?: string): Promise<AuthenticatedSession> {
    let claims: AccessClaims;
    try {
      claims = await verifyAccessToken(token, this.jwtSecret, this.now());
    } catch {
      throw invalidAccessToken();
    }
    let serialized: string | null;
    try {
      serialized = await this.options.redis.get(`auth:session:${claims.familyId}`);
    } catch {
      throw new ApiError(503, "session_store_unavailable", "Authentication session is temporarily unavailable");
    }
    if (!serialized) throw invalidAccessToken();
    let session: PositiveSession;
    try {
      session = parsePositiveSession(serialized);
    } catch {
      throw new ApiError(503, "session_store_unavailable", "Authentication session is temporarily unavailable");
    }
    if (session.userId !== claims.userId || session.deviceId !== claims.deviceId) throw invalidAccessToken();

    let lifecycle: UserLifecycleRecord | null;
    try {
      lifecycle = await this.repository.findLifecycleByUserId(claims.userId);
    } catch {
      throw new ApiError(503, "identity_store_unavailable", "Account state is temporarily unavailable");
    }
    if (!lifecycle || lifecycle.status !== "active" || lifecycle.role !== claims.role) throw invalidAccessToken();
    const currentStatus = lifecycleStatus(lifecycle);
    if (routeIdentity && currentStatus === "passwordChangeRequired") {
      const allowed = new Set([
        "POST /v1/auth/change-password",
        "POST /v1/auth/logout",
        "GET /v1/account/self",
      ]);
      if (!allowed.has(routeIdentity)) {
        throw new ApiError(403, "password_change_required", "Password change is required");
      }
    }
    if (routeIdentity && currentStatus === "deletionPending") {
      const allowed = new Set([
        "POST /v1/auth/logout",
        "POST /v1/auth/reauthenticate",
        "POST /v1/privacy/deletion-requests/:id/cancel",
        "GET /v1/account/self",
      ]);
      if (!allowed.has(routeIdentity)) {
        throw new ApiError(403, "deletion_pending", "Account deletion is pending");
      }
    }
    return {
      ...claims,
      user: toAuthUser(lifecycle),
      positiveSessionStatus: session.status,
    };
  }
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  return new AuthService(options);
}

export function extractBearerToken(header: string | string[] | undefined): string {
  if (typeof header !== "string") throw invalidAccessToken();
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
  if (!match?.[1]) throw invalidAccessToken();
  return match[1];
}
