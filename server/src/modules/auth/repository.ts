import type { Pool } from "pg";

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
}

export interface UserLifecycleRecord {
  id: string;
  role: UserRole;
  displayName: string;
  status: "active" | "disabled";
  mustChangePassword: boolean;
  deletionPending: boolean;
}

export interface InitialRefreshSessionRecord {
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

interface LoginCredentialRow {
  id: string;
  role: UserRole;
  display_name: string;
  status: "active" | "disabled";
  must_change_password: boolean;
  deletion_pending: boolean;
  password_hash: string;
  temporary_expires_at: Date | null;
}

interface LifecycleRow {
  id: string;
  role: UserRole;
  display_name: string;
  status: "active" | "disabled";
  must_change_password: boolean;
  deletion_pending: boolean;
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
              credentials.temporary_expires_at,
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

  async insertInitialRefreshSession(record: InitialRefreshSessionRecord): Promise<boolean> {
    const result = await this.pool.query<{ id: string }>(
      `insert into refresh_sessions(
         id, family_id, parent_id, user_id, device_id, device_name,
         token_hash, session_strength, expires_at, created_at
       )
       select $1, $2, null, users.id, $4, $5, $6, $7, $8, $9
         from users
        where users.id = $3 and users.status = 'active'
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
