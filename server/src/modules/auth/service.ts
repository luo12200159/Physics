import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { Pool } from "pg";

import { ApiError } from "../../common/errors.js";
import {
  executeIdempotently,
  type MutationIdempotency,
} from "../../common/idempotency.js";
import { withTransaction } from "../../infrastructure/db.js";
import { appendAudit, hashAuditIp } from "../audit/repository.js";
import type {
  AuthResponse,
  AuthUser,
  ChangePasswordRequest,
  ChangePasswordResponse,
  LoginRequest,
  RegisterRequest,
  ReauthenticateRequest,
  ReauthenticateResponse,
  RefreshRequest,
  UpdateDisplayNameRequest,
  UpdateDisplayNameResponse,
} from "./contracts.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  AuthRepository,
  normalizeLogin,
  type LockedRefreshSessionRecord,
  type UserLifecycleRecord,
} from "./repository.js";
import {
  createRefreshToken,
  hashRefreshSecret,
  issueAccessToken,
  normalizeDeviceId,
  parseRefreshToken,
  verifyAccessToken,
  type AccessClaims,
} from "./tokens.js";

// Shared with the invite guest-session bootstrap. It is never used as a
// usable password; it only keeps the credential row compatible with the
// existing refresh-session schema.
export const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,p=1,t=3$AAECAwQFBgcICQoLDA0ODw$g+cyBgEd91RhaGj522HX0zaMuGIVFhZOtD/id/PK358";
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

export interface AuthRequestContext {
  ip: string;
}

export interface AuthMutationContext extends AuthRequestContext {
  requestId: string;
  idempotency: MutationIdempotency;
}

export interface AuthenticatedSession extends AccessClaims {
  user: AuthUser;
  positiveSessionStatus: PositiveSessionStatus;
  replayOnly: boolean;
}

function invalidCredentials(): ApiError {
  return new ApiError(401, "invalid_credentials", "Login or password is incorrect");
}

function invalidAccessToken(): ApiError {
  return new ApiError(401, "invalid_access_token", "Access token is invalid or expired");
}

function invalidRefreshToken(): ApiError {
  return new ApiError(401, "invalid_refresh_token", "Refresh token is invalid or expired");
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

function refreshRecordToUser(record: LockedRefreshSessionRecord): AuthUser {
  return {
    id: record.userId,
    role: record.role,
    displayName: record.displayName,
    status: record.userStatus,
    mustChangePassword: record.mustChangePassword,
    deletionPending: record.deletionPending,
  };
}

function matchesHash(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

const COMMON_COMPROMISED_PASSWORDS = new Set([
  "123456789012",
  "111111111111",
  "password1234",
  "password123456",
  "qwerty123456",
  "qwertyuiop123",
  "admin12345678",
  "letmein123456",
]);

function validateReplacementPassword(password: string): void {
  if (password.length < 12 || password.length > 128 || /[\u0000\r\n]/u.test(password)) {
    throw new ApiError(400, "weak_password", "New password does not meet the password policy");
  }
  const normalized = password.normalize("NFKC").toLocaleLowerCase("en-US").trim();
  if (normalized.length < 12 || COMMON_COMPROMISED_PASSWORDS.has(normalized) || /^\d+$/u.test(normalized)) {
    throw new ApiError(400, "weak_password", "New password does not meet the password policy");
  }
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

  private async enforceRateLimit(
    kind: "login" | "refresh" | "reauthenticate" | "register",
    identity: string,
    ip: string,
    maximum: number,
  ): Promise<void> {
    const ipHash = hashAuditIp(this.options.auditIpKey, ip).toString("hex");
    const identityHash = createHmac("sha256", this.options.auditIpKey)
      .update(`${kind}\u0000`, "utf8")
      .update(identity, "utf8")
      .digest("hex");
    let result: unknown;
    try {
      result = await this.options.redis.eval(
        LOGIN_RATE_LIMIT_SCRIPT,
        1,
        `rate:${kind}:${ipHash}:${identityHash}`,
        900,
      );
    } catch {
      throw new ApiError(503, "rate_limit_unavailable", "Authentication rate limit is temporarily unavailable");
    }
    const attempts = Number(result);
    if (!Number.isSafeInteger(attempts) || attempts < 1) {
      throw new ApiError(503, "rate_limit_unavailable", "Authentication rate limit is temporarily unavailable");
    }
    if (attempts > maximum) {
      throw new ApiError(429, "rate_limit_exceeded", "Too many authentication attempts");
    }
  }

  async register(input: RegisterRequest, context: AuthRequestContext & { requestId: string }): Promise<AuthResponse> {
    const loginNormalized = (() => {
      try { return normalizeLogin(input.login); }
      catch { throw new ApiError(400, "invalid_login", "Login name is invalid"); }
    })();
    const displayName = input.displayName.normalize("NFKC").trim();
    if (displayName.length < 1 || displayName.length > 80 || /[\u0000-\u001f\u007f]/u.test(displayName)) {
      throw new ApiError(400, "invalid_display_name", "Display name is invalid");
    }
    if (input.role !== "student" && input.role !== "teacher") {
      throw new ApiError(400, "invalid_role", "Public registration supports student or teacher accounts only");
    }
    validateReplacementPassword(input.password);
    await this.enforceRateLimit("register", loginNormalized, context.ip, 3);
    const userId = randomUUID();
    const passwordHash = await hashPassword(input.password);
    const now = this.now();
    try {
      await withTransaction(this.options.pool, async (tx) => {
        await tx.query(
          `insert into users(id, role, display_name, status, must_change_password, created_at, updated_at)
           values ($1, $2, $3, 'active', false, $4, $4)`,
          [userId, input.role, displayName, now],
        );
        await tx.query(
          `insert into password_credentials(user_id, login_normalized, password_hash, changed_at)
           values ($1, $2, $3, $4)`,
          [userId, loginNormalized, passwordHash, now],
        );
        await appendAudit(tx, {
          actorId: userId,
          actorRole: input.role,
          action: "auth.register",
          resourceType: "user",
          resourceId: userId,
          classId: null,
          result: "succeeded",
          beforeState: null,
          afterState: { role: input.role, status: "active" },
          reason: null,
          requestId: context.requestId,
          ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
        });
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        throw new ApiError(409, "login_already_exists", "Login name is already registered");
      }
      throw error;
    }
    return this.login({
      login: loginNormalized,
      password: input.password,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
    }, context);
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
    await this.enforceRateLimit("login", loginNormalized, context.ip, 5);

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
      expectedCredentialVersion: credential.credentialVersion,
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

  async refresh(input: RefreshRequest, context: AuthRequestContext): Promise<AuthResponse> {
    let parsed: ReturnType<typeof parseRefreshToken>;
    try {
      parsed = parseRefreshToken(input.refreshToken);
    } catch {
      throw invalidRefreshToken();
    }
    const suppliedHash = hashRefreshSecret(parsed.secret);
    const now = this.now();
    const outcome = await withTransaction(this.options.pool, async (tx) => {
      const identity = await this.repository.findRefreshTokenIdentity(tx, parsed.tokenId);
      if (!identity || !matchesHash(identity.tokenHash, suppliedHash)) throw invalidRefreshToken();
      await this.repository.lockAuthUser(tx, identity.userId);
      const current = await this.repository.lockRefreshToken(tx, parsed.tokenId);
      if (!current || !matchesHash(current.tokenHash, suppliedHash)) throw invalidRefreshToken();
      await this.enforceRateLimit("refresh", current.familyId, context.ip, 30);
      if (current.rotatedAt || current.revokedAt) {
        await this.repository.revokeFamilyInTransaction(
          tx,
          current.familyId,
          "refresh_token_reused",
          now,
        );
        return { kind: "reused" as const, familyId: current.familyId };
      }
      if (current.expiresAt.getTime() <= now.getTime() || current.userStatus !== "active") {
        throw invalidRefreshToken();
      }
      const next = createRefreshToken();
      await this.repository.insertRotatedRefreshSession(tx, {
        id: next.tokenId,
        familyId: current.familyId,
        parentId: current.id,
        userId: current.userId,
        deviceId: current.deviceId,
        deviceName: current.deviceName,
        tokenHash: next.secretHash,
        sessionStrength: "password",
        expiresAt: new Date(now.getTime() + this.options.refreshTokenTtlSeconds * 1_000),
        createdAt: now,
      });
      await this.repository.markRotated(tx, current.id, next.tokenId, now);
      return { kind: "rotated" as const, current, next };
    });

    if (outcome.kind === "reused") {
      try {
        await this.options.redis.del(`auth:session:${outcome.familyId}`);
      } catch {
        throw new ApiError(503, "session_store_unavailable", "Authentication session is temporarily unavailable");
      }
      throw new ApiError(401, "refresh_token_reused", "Refresh token was already used");
    }

    const session: PositiveSession = {
      userId: outcome.current.userId,
      deviceId: outcome.current.deviceId,
      status: "active",
    };
    try {
      const setResult = await this.options.redis.set(
        `auth:session:${outcome.current.familyId}`,
        JSON.stringify(session),
        "EX",
        this.options.refreshTokenTtlSeconds,
      );
      if (setResult !== "OK") throw new Error("Redis did not acknowledge the session");
      const accessToken = await issueAccessToken({
        userId: outcome.current.userId,
        role: outcome.current.role,
        familyId: outcome.current.familyId,
        deviceId: outcome.current.deviceId,
        sessionStrength: "password",
        jti: randomUUID(),
        nowSeconds: Math.floor(now.getTime() / 1_000),
      }, this.jwtSecret);
      return {
        accessToken,
        refreshToken: outcome.next.token,
        user: refreshRecordToUser(outcome.current),
      };
    } catch {
      await Promise.allSettled([
        this.repository.revokeFamily(outcome.current.familyId, "session_store_unavailable", now),
        this.options.redis.del(`auth:session:${outcome.current.familyId}`),
      ]);
      throw new ApiError(503, "session_store_unavailable", "Authentication session is temporarily unavailable");
    }
  }

  async logout(input: RefreshRequest, context: AuthMutationContext): Promise<void> {
    let parsed: ReturnType<typeof parseRefreshToken>;
    try {
      parsed = parseRefreshToken(input.refreshToken);
    } catch {
      throw invalidRefreshToken();
    }
    const suppliedHash = hashRefreshSecret(parsed.secret);
    const now = this.now();
    const outcome = await withTransaction(this.options.pool, async (tx) => {
      const current = await this.repository.lockRefreshToken(tx, parsed.tokenId);
      if (!current || !matchesHash(current.tokenHash, suppliedHash)) throw invalidRefreshToken();
      const result = await executeIdempotently(tx, {
        ...context.idempotency,
        actorId: current.userId,
        expiresAt: new Date(Math.max(now.getTime(), Date.now()) + 24 * 60 * 60 * 1_000),
      }, async () => {
        await this.repository.revokeFamilyInTransaction(tx, current.familyId, "logout", now);
        await appendAudit(tx, {
          actorId: current.userId,
          actorRole: current.role,
          action: "auth.logout",
          resourceType: "sessionFamily",
          resourceId: current.familyId,
          classId: null,
          result: "succeeded",
          beforeState: { revoked: current.revokedAt !== null },
          afterState: { revoked: true },
          reason: null,
          requestId: context.requestId,
          ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
        });
        return { statusCode: 204, body: null };
      });
      return { familyId: current.familyId, replayed: result.replayed };
    });
    try {
      await this.options.redis.del(`auth:session:${outcome.familyId}`);
    } catch {
      throw new ApiError(503, "session_store_unavailable", "Authentication session is temporarily unavailable");
    }
  }

  async reauthenticate(
    actor: AuthenticatedSession,
    input: ReauthenticateRequest,
    context: AuthRequestContext,
  ): Promise<ReauthenticateResponse> {
    if (actor.replayOnly) throw invalidAccessToken();
    await this.enforceRateLimit("reauthenticate", actor.userId, context.ip, 5);
    const credential = await this.repository.findCredentialByUserId(actor.userId);
    const now = this.now();
    const temporaryExpired = credential?.temporaryExpiresAt !== null
      && credential?.temporaryExpiresAt !== undefined
      && credential.temporaryExpiresAt.getTime() <= now.getTime();
    const passwordMatches = await verifyPassword(
      credential?.passwordHash ?? DUMMY_PASSWORD_HASH,
      input.password,
    );
    if (!credential || !passwordMatches || credential.status !== "active"
      || credential.role !== actor.role || temporaryExpired) {
      throw invalidCredentials();
    }
    const accessToken = await issueAccessToken({
      userId: actor.userId,
      role: actor.role,
      familyId: actor.familyId,
      deviceId: actor.deviceId,
      sessionStrength: "reauthenticated",
      jti: randomUUID(),
      nowSeconds: Math.floor(now.getTime() / 1_000),
    }, this.jwtSecret);
    return { accessToken, user: toAuthUser(credential) };
  }

  async updateDisplayName(
    actor: AuthenticatedSession,
    input: UpdateDisplayNameRequest,
    _context: AuthMutationContext,
  ): Promise<UpdateDisplayNameResponse> {
    if (actor.role !== "student") {
      throw new ApiError(403, "student_role_required", "Only students can change a class remark name");
    }
    const displayName = input.displayName.normalize("NFKC").trim();
    if (displayName.length < 1 || displayName.length > 80 || /[\u0000-\u001f\u007f]/u.test(displayName)) {
      throw new ApiError(400, "validation_error", "Display name is invalid");
    }
    const user = await this.repository.updateDisplayName(actor.userId, displayName, this.now());
    if (!user || user.status !== "active") throw invalidAccessToken();
    return { user: toAuthUser(user) };
  }

  async changePassword(
    actor: AuthenticatedSession,
    input: ChangePasswordRequest,
    context: AuthMutationContext,
  ): Promise<ChangePasswordResponse> {
    validateReplacementPassword(input.newPassword);
    if (input.currentPassword === input.newPassword) {
      throw new ApiError(400, "weak_password", "New password must differ from the current password");
    }
    const now = this.now();
    const result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
      ...context.idempotency,
      actorId: actor.userId,
      expiresAt: new Date(Math.max(now.getTime(), Date.now()) + 24 * 60 * 60 * 1_000),
    }, async () => {
      if (actor.replayOnly) throw invalidAccessToken();
      await this.repository.lockAuthUser(tx, actor.userId);
      await this.repository.lockUserRefreshFamilies(tx, actor.userId);
      const credential = await this.repository.lockCredentialByUser(tx, actor.userId);
      const temporaryExpired = credential?.temporaryExpiresAt !== null
        && credential?.temporaryExpiresAt !== undefined
        && credential.temporaryExpiresAt.getTime() <= now.getTime();
      const passwordMatches = await verifyPassword(
        credential?.passwordHash ?? DUMMY_PASSWORD_HASH,
        input.currentPassword,
      );
      if (!credential || !passwordMatches || credential.status !== "active"
        || credential.role !== actor.role || temporaryExpired) {
        throw invalidCredentials();
      }
      if (await verifyPassword(credential.passwordHash, input.newPassword)) {
        throw new ApiError(400, "weak_password", "New password must differ from the current password");
      }
      const nextHash = await hashPassword(input.newPassword);
      await this.repository.replacePassword(tx, actor.userId, nextHash, now);
      await this.repository.revokeUserFamiliesInTransaction(tx, actor.userId, "password_changed", now);
      const user: AuthUser = {
        id: credential.id,
        role: credential.role,
        displayName: credential.displayName,
        status: credential.status,
        mustChangePassword: false,
        deletionPending: credential.deletionPending,
      };
      await appendAudit(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        action: "auth.changePassword",
        resourceType: "credential",
        resourceId: actor.userId,
        classId: null,
        result: "succeeded",
        beforeState: {
          credentialVersion: credential.credentialVersion,
          mustChangePassword: credential.mustChangePassword,
        },
        afterState: {
          credentialVersion: credential.credentialVersion + 1,
          mustChangePassword: false,
        },
        reason: null,
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return { statusCode: 200, body: { user } };
    }));

    let familyIds: string[];
    try {
      familyIds = await this.repository.listInactiveFamilyIdsByUser(actor.userId);
      await Promise.all(familyIds.map((familyId) => this.options.redis.del(`auth:session:${familyId}`)));
    } catch {
      throw new ApiError(503, "session_store_unavailable", "Authentication session is temporarily unavailable");
    }
    if (result.body === null) throw new Error("Password change response is missing");
    return result.body;
  }

  private async authenticateCommittedPasswordChangeReplay(
    claims: AccessClaims,
    routeIdentity: string | undefined,
    idempotency: MutationIdempotency | undefined,
  ): Promise<AuthenticatedSession | null> {
    if (routeIdentity !== "POST /v1/auth/change-password" || !idempotency
      || idempotency.routeKey !== routeIdentity) return null;
    const stored = await this.repository.findIdempotencyReplay(
      claims.userId,
      idempotency.routeKey,
      idempotency.key,
    );
    if (!stored) return null;
    if (!matchesHash(stored.requestHash, idempotency.requestHash)) {
      throw new ApiError(
        409,
        "idempotency_mismatch",
        "Idempotency-Key was already used for a different request",
      );
    }
    if (stored.responseStatus !== 200) return null;
    const lifecycle = await this.repository.findLifecycleByUserId(claims.userId);
    if (!lifecycle || lifecycle.status !== "active" || lifecycle.role !== claims.role) return null;
    return {
      ...claims,
      user: toAuthUser(lifecycle),
      positiveSessionStatus: "active",
      replayOnly: true,
    };
  }

  async authenticateAccessToken(
    token: string,
    routeIdentity?: string,
    idempotency?: MutationIdempotency,
  ): Promise<AuthenticatedSession> {
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
      const replay = await this.authenticateCommittedPasswordChangeReplay(claims, routeIdentity, idempotency);
      if (replay) return replay;
      throw new ApiError(503, "session_store_unavailable", "Authentication session is temporarily unavailable");
    }
    if (!serialized) {
      const replay = await this.authenticateCommittedPasswordChangeReplay(claims, routeIdentity, idempotency);
      if (replay) return replay;
      throw invalidAccessToken();
    }
    let session: PositiveSession;
    try {
      session = parsePositiveSession(serialized);
    } catch {
      const replay = await this.authenticateCommittedPasswordChangeReplay(claims, routeIdentity, idempotency);
      if (replay) return replay;
      throw new ApiError(503, "session_store_unavailable", "Authentication session is temporarily unavailable");
    }
    if (session.userId !== claims.userId || session.deviceId !== claims.deviceId) {
      const replay = await this.authenticateCommittedPasswordChangeReplay(claims, routeIdentity, idempotency);
      if (replay) return replay;
      throw invalidAccessToken();
    }

    let lifecycle: UserLifecycleRecord | null;
    try {
      lifecycle = await this.repository.findActiveLifecycleBySession(claims.userId, claims.familyId);
    } catch {
      throw new ApiError(503, "identity_store_unavailable", "Account state is temporarily unavailable");
    }
    if (!lifecycle || lifecycle.status !== "active" || lifecycle.role !== claims.role) {
      const replay = await this.authenticateCommittedPasswordChangeReplay(claims, routeIdentity, idempotency);
      if (replay) return replay;
      throw invalidAccessToken();
    }
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
      replayOnly: false,
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
