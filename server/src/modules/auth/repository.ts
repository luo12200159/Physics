import type { Pool, PoolClient } from "pg";

import type { UserRole } from "./contracts.js";
import type { SessionStrength } from "./tokens.js";

export interface LoginCredentialRecord {
  id: string;
  role: UserRole;
  displayName: string;
  status: "active" | "disabled";
  mustChangePassword: boolean;
  deletionPending: boolean;
  passwordHash: string;
  temporaryExpiresAt: Date | null;
  credentialVersion: number;
}

export interface UserLifecycleRecord {
  id: string;
  role: UserRole;
  displayName: string;
  status: "active" | "disabled";
  mustChangePassword: boolean;
  deletionPending: boolean;
}

interface RefreshSessionRecord {
  id: string;
  familyId: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  tokenHash: Buffer;
  sessionStrength: SessionStrength;
  expiresAt: Date;
  createdAt: Date;
}

export interface InitialRefreshSessionRecord extends RefreshSessionRecord {
  expectedCredentialVersion: number;
}

export interface RotatedRefreshSessionRecord extends RefreshSessionRecord {
  parentId: string;
}

export interface LockedRefreshSessionRecord {
  id: string;
  familyId: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  tokenHash: Buffer;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  role: UserRole;
  displayName: string;
  userStatus: "active" | "disabled";
  mustChangePassword: boolean;
  deletionPending: boolean;
}

export interface LockedCredentialRecord extends UserLifecycleRecord {
  passwordHash: string;
  temporaryExpiresAt: Date | null;
  credentialVersion: number;
}

interface LoginCredentialRow {
  id: string;
  role: UserRole;
  display_name: string;
  status: "active" | "disabled";
  must_change_password: boolean;
  deletion_pending: boolean;
  password_hash: string;
  temporary_expires_at: Date | null;
  credential_version: number;
}

interface LifecycleRow {
  id: string;
  role: UserRole;
  display_name: string;
  status: "active" | "disabled";
  must_change_password: boolean;
  deletion_pending: boolean;
}

interface LockedRefreshRow {
  id: string;
  family_id: string;
  user_id: string;
  device_id: string;
  device_name: string;
  token_hash: Buffer;
  expires_at: Date;
  rotated_at: Date | null;
  revoked_at: Date | null;
  role: UserRole;
  display_name: string;
  user_status: "active" | "disabled";
  must_change_password: boolean;
  deletion_pending: boolean;
}

interface LockedCredentialRow extends LifecycleRow {
  password_hash: string;
  temporary_expires_at: Date | null;
  credential_version: number;
}

export interface IdempotencyReplayRecord {
  requestHash: Buffer;
  responseStatus: number;
}

export interface RefreshTokenIdentityRecord {
  userId: string;
  tokenHash: Buffer;
}

export function normalizeLogin(login: string): string {
  const normalized = login.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  if (normalized.length < 1 || normalized.length > 120 || /[\s\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new TypeError("login is invalid");
  }
  return normalized;
}

function lifecycleSql(): string {
  return `exists(
    select 1 from account_deletion_requests deletion
     where deletion.user_id = users.id
       and deletion.status in ('gracePeriod','processing')
  )`;
}

export class AuthRepository {
  constructor(private readonly pool: Pool) {}

  async findCredentialByLogin(loginNormalized: string): Promise<LoginCredentialRecord | null> {
    const result = await this.pool.query<LoginCredentialRow>(
      `select users.id, users.role, users.display_name, users.status,
              users.must_change_password, credentials.password_hash,
              credentials.temporary_expires_at, credentials.credential_version,
              ${lifecycleSql()} as deletion_pending
         from password_credentials credentials
         join users on users.id = credentials.user_id
        where credentials.login_normalized = $1`,
      [loginNormalized],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      role: row.role,
      displayName: row.display_name,
      status: row.status,
      mustChangePassword: row.must_change_password,
      deletionPending: row.deletion_pending,
      passwordHash: row.password_hash,
      temporaryExpiresAt: row.temporary_expires_at,
      credentialVersion: row.credential_version,
    };
  }

  async findLifecycleByUserId(userId: string): Promise<UserLifecycleRecord | null> {
    const result = await this.pool.query<LifecycleRow>(
      `select users.id, users.role, users.display_name, users.status,
              users.must_change_password,
              ${lifecycleSql()} as deletion_pending
         from users where users.id = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      role: row.role,
      displayName: row.display_name,
      status: row.status,
      mustChangePassword: row.must_change_password,
      deletionPending: row.deletion_pending,
    };
  }

  async findActiveLifecycleBySession(
    userId: string,
    familyId: string,
  ): Promise<UserLifecycleRecord | null> {
    const result = await this.pool.query<LifecycleRow>(
      `select users.id, users.role, users.display_name, users.status,
              users.must_change_password,
              ${lifecycleSql()} as deletion_pending
         from users where users.id = $1
          and exists (
            select 1 from refresh_sessions sessions
             where sessions.user_id = users.id
               and sessions.family_id = $2
               and sessions.revoked_at is null
               and sessions.expires_at > now()
          )`,
      [userId, familyId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      role: row.role,
      displayName: row.display_name,
      status: row.status,
      mustChangePassword: row.must_change_password,
      deletionPending: row.deletion_pending,
    };
  }

  async findIdempotencyReplay(
    actorId: string,
    routeKey: string,
    key: string,
  ): Promise<IdempotencyReplayRecord | null> {
    const result = await this.pool.query<{
      request_hash: Buffer;
      response_status: number;
    }>(
      `select request_hash, response_status
         from api_idempotency
        where actor_id = $1
          and route_key = $2
          and idempotency_key = $3
          and expires_at > now()`,
      [actorId, routeKey, key],
    );
    const row = result.rows[0];
    return row ? { requestHash: row.request_hash, responseStatus: row.response_status } : null;
  }

  async findCredentialByUserId(userId: string): Promise<LockedCredentialRecord | null> {
    const result = await this.pool.query<LockedCredentialRow>(
      `select users.id, users.role, users.display_name, users.status,
              users.must_change_password,
              ${lifecycleSql()} as deletion_pending,
              credentials.password_hash, credentials.temporary_expires_at,
              credentials.credential_version
         from users
         join password_credentials credentials on credentials.user_id = users.id
        where users.id = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      role: row.role,
      displayName: row.display_name,
      status: row.status,
      mustChangePassword: row.must_change_password,
      deletionPending: row.deletion_pending,
      passwordHash: row.password_hash,
      temporaryExpiresAt: row.temporary_expires_at,
      credentialVersion: row.credential_version,
    };
  }

  async lockRefreshToken(tx: PoolClient, tokenId: string): Promise<LockedRefreshSessionRecord | null> {
    const result = await tx.query<LockedRefreshRow>(
      `select sessions.id, sessions.family_id, sessions.user_id, sessions.device_id,
              sessions.device_name, sessions.token_hash, sessions.expires_at,
              sessions.rotated_at, sessions.revoked_at,
              users.role, users.display_name, users.status as user_status,
              users.must_change_password,
              ${lifecycleSql()} as deletion_pending
         from refresh_sessions sessions
         join users on users.id = sessions.user_id
        where sessions.id = $1
        for update of sessions`,
      [tokenId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      familyId: row.family_id,
      userId: row.user_id,
      deviceId: row.device_id,
      deviceName: row.device_name,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      rotatedAt: row.rotated_at,
      revokedAt: row.revoked_at,
      role: row.role,
      displayName: row.display_name,
      userStatus: row.user_status,
      mustChangePassword: row.must_change_password,
      deletionPending: row.deletion_pending,
    };
  }

  async findRefreshTokenIdentity(
    tx: PoolClient,
    tokenId: string,
  ): Promise<RefreshTokenIdentityRecord | null> {
    const result = await tx.query<{ user_id: string; token_hash: Buffer }>(
      "select user_id, token_hash from refresh_sessions where id = $1",
      [tokenId],
    );
    const row = result.rows[0];
    return row ? { userId: row.user_id, tokenHash: row.token_hash } : null;
  }

  async lockAuthUser(tx: PoolClient, userId: string): Promise<void> {
    await tx.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`auth-user:${userId}`],
    );
  }

  async insertRotatedRefreshSession(tx: PoolClient, record: RotatedRefreshSessionRecord): Promise<void> {
    await tx.query(
      `insert into refresh_sessions(
         id, family_id, parent_id, user_id, device_id, device_name,
         token_hash, session_strength, expires_at, created_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        record.id,
        record.familyId,
        record.parentId,
        record.userId,
        record.deviceId,
        record.deviceName,
        record.tokenHash,
        record.sessionStrength,
        record.expiresAt,
        record.createdAt,
      ],
    );
  }

  async markRotated(tx: PoolClient, tokenId: string, replacedById: string, now: Date): Promise<void> {
    const result = await tx.query(
      `update refresh_sessions
          set rotated_at = $2, replaced_by_id = $3
        where id = $1 and rotated_at is null and revoked_at is null`,
      [tokenId, now, replacedById],
    );
    if (result.rowCount !== 1) throw new Error("Refresh session changed while locked");
  }

  async revokeFamilyInTransaction(
    tx: PoolClient,
    familyId: string,
    reason: string,
    now: Date,
  ): Promise<void> {
    await tx.query(
      `update refresh_sessions
          set revoked_at = coalesce(revoked_at, $2),
              revoke_reason = coalesce(revoke_reason, $3)
        where family_id = $1`,
      [familyId, now, reason],
    );
  }

  async lockCredentialByUser(tx: PoolClient, userId: string): Promise<LockedCredentialRecord | null> {
    const result = await tx.query<LockedCredentialRow>(
      `select users.id, users.role, users.display_name, users.status,
              users.must_change_password,
              ${lifecycleSql()} as deletion_pending,
              credentials.password_hash, credentials.temporary_expires_at,
              credentials.credential_version
         from users
         join password_credentials credentials on credentials.user_id = users.id
        where users.id = $1
        for update of users, credentials`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      role: row.role,
      displayName: row.display_name,
      status: row.status,
      mustChangePassword: row.must_change_password,
      deletionPending: row.deletion_pending,
      passwordHash: row.password_hash,
      temporaryExpiresAt: row.temporary_expires_at,
      credentialVersion: row.credential_version,
    };
  }

  async lockUserRefreshFamilies(tx: PoolClient, userId: string): Promise<void> {
    await tx.query(
      `select id
         from refresh_sessions
        where user_id = $1
        order by id
        for update`,
      [userId],
    );
  }

  async replacePassword(
    tx: PoolClient,
    userId: string,
    passwordHash: string,
    now: Date,
  ): Promise<void> {
    await tx.query(
      `update password_credentials
          set password_hash = $2,
              credential_version = credential_version + 1,
              temporary_expires_at = null,
              changed_at = $3
        where user_id = $1`,
      [userId, passwordHash, now],
    );
    await tx.query(
      `update users
          set must_change_password = false, updated_at = $2
        where id = $1`,
      [userId, now],
    );
  }

  async revokeUserFamiliesInTransaction(
    tx: PoolClient,
    userId: string,
    reason: string,
    now: Date,
  ): Promise<void> {
    await tx.query(
      `update refresh_sessions
          set revoked_at = coalesce(revoked_at, $2),
              revoke_reason = coalesce(revoke_reason, $3)
        where user_id = $1`,
      [userId, now, reason],
    );
  }

  async listFamilyIdsByUser(userId: string): Promise<string[]> {
    const result = await this.pool.query<{ family_id: string }>(
      "select distinct family_id from refresh_sessions where user_id = $1",
      [userId],
    );
    return result.rows.map((row) => row.family_id);
  }

  async listInactiveFamilyIdsByUser(userId: string): Promise<string[]> {
    const result = await this.pool.query<{ family_id: string }>(
      `select family_id
         from refresh_sessions
        where user_id = $1
        group by family_id
       having bool_and(revoked_at is not null)`,
      [userId],
    );
    return result.rows.map((row) => row.family_id);
  }

  async insertInitialRefreshSession(record: InitialRefreshSessionRecord): Promise<boolean> {
    const result = await this.pool.query<{ id: string }>(
      `insert into refresh_sessions(
         id, family_id, parent_id, user_id, device_id, device_name,
         token_hash, session_strength, expires_at, created_at
       )
       select $1, $2, null, users.id, $4, $5, $6, $7, $8, $9
         from users
         join password_credentials credentials on credentials.user_id = users.id
        where users.id = $3 and users.status = 'active'
          and credentials.credential_version = $10
       returning id`,
      [
        record.id,
        record.familyId,
        record.userId,
        record.deviceId,
        record.deviceName,
        record.tokenHash,
        record.sessionStrength,
        record.expiresAt,
        record.createdAt,
        record.expectedCredentialVersion,
      ],
    );
    return result.rowCount === 1;
  }

  async revokeFamily(familyId: string, reason: string, now: Date): Promise<void> {
    await this.pool.query(
      `update refresh_sessions
          set revoked_at = coalesce(revoked_at, $2),
              revoke_reason = coalesce(revoke_reason, $3)
        where family_id = $1`,
      [familyId, now, reason],
    );
  }
}
