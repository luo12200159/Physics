import type { Pool, PoolClient } from "pg";

import type { MembershipView } from "../classes/contracts.js";
import type { InviteListItem, InviteListResponse } from "./contracts.js";

interface InviteRow {
  id: string;
  class_id: string;
  expires_at: Date;
  max_uses: number;
  used_count: number;
  status: "active" | "revoked" | "exhausted" | "expired";
  owner_teacher_id: string;
  class_status: "active" | "archived";
  created_at: Date;
}

interface MembershipRow {
  id: string;
  class_id: string;
  group_id: string | null;
  user_id: string;
  display_name: string;
  member_role: "student" | "teacher";
  student_number: string | null;
  status: "pending" | "active" | "removed";
  revision: number;
  joined_at: Date | null;
  updated_at: Date;
}

export interface LockedInviteRecord {
  id: string;
  classId: string;
  expiresAt: Date;
  maxUses: number;
  usedCount: number;
  status: "active" | "revoked" | "exhausted" | "expired";
  ownerTeacherId: string;
  classStatus: "active" | "archived";
}

export interface NewInviteRecord {
  id: string;
  classId: string;
  codeHash: Buffer;
  expiresAt: Date;
  maxUses: number;
  createdBy: string;
  createdAt: Date;
}

function inviteListItem(row: InviteRow): InviteListItem {
  return {
    id: row.id,
    classId: row.class_id,
    expiresAt: row.expires_at.toISOString(),
    maxUses: row.max_uses,
    usedCount: row.used_count,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

function membershipView(row: MembershipRow): MembershipView {
  return {
    id: row.id,
    classId: row.class_id,
    groupId: row.group_id,
    userId: row.user_id,
    displayName: row.display_name,
    memberRole: row.member_role,
    studentNumber: row.student_number,
    status: row.status,
    revision: row.revision,
    joinedAt: row.joined_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
  };
}

export class InvitesRepository {
  constructor(private readonly pool: Pool) {}

  async insertInvite(tx: PoolClient, record: NewInviteRecord): Promise<void> {
    await tx.query(
      `insert into invites(
         id, class_id, code_hash, expires_at, max_uses,
         used_count, status, created_by, created_at
       ) values ($1, $2, $3, $4, $5, 0, 'active', $6, $7)`,
      [
        record.id,
        record.classId,
        record.codeHash,
        record.expiresAt,
        record.maxUses,
        record.createdBy,
        record.createdAt,
      ],
    );
  }

  async revokeActiveClassInvites(tx: PoolClient, classId: string): Promise<void> {
    await tx.query(
      `update invites set status = 'revoked'
        where class_id = $1 and status = 'active'`,
      [classId],
    );
  }

  async lockByCodeHash(tx: PoolClient, codeHash: Buffer): Promise<LockedInviteRecord | null> {
    const result = await tx.query<InviteRow>(
      `select invites.id, invites.class_id, invites.expires_at,
              invites.max_uses, invites.used_count, invites.status,
              classes.owner_teacher_id, classes.status as class_status,
              invites.created_at
         from invites
         join classes on classes.id = invites.class_id
        where invites.code_hash = $1
        for update of invites, classes`,
      [codeHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      classId: row.class_id,
      expiresAt: row.expires_at,
      maxUses: row.max_uses,
      usedCount: row.used_count,
      status: row.status,
      ownerTeacherId: row.owner_teacher_id,
      classStatus: row.class_status,
    };
  }

  async listInvites(classId: string, cursor: string | null): Promise<InviteListResponse> {
    const result = await this.pool.query<InviteRow>(
      `select invites.id, invites.class_id, invites.expires_at,
              invites.max_uses, invites.used_count,
              case
                when invites.status = 'active' and invites.expires_at <= now() then 'expired'
                else invites.status
              end as status,
              classes.owner_teacher_id, classes.status as class_status,
              invites.created_at
         from invites
         join classes on classes.id = invites.class_id
        where invites.class_id = $1
          and ($2::uuid is null or invites.id > $2)
        order by invites.id
        limit 101`,
      [classId, cursor],
    );
    const mapped = result.rows.map(inviteListItem);
    const items = mapped.slice(0, 100);
    return {
      items,
      nextCursor: mapped.length > 100 ? items.at(-1)?.id ?? null : null,
    };
  }

  async lockById(tx: PoolClient, inviteId: string): Promise<LockedInviteRecord | null> {
    const result = await tx.query<InviteRow>(
      `select invites.id, invites.class_id, invites.expires_at,
              invites.max_uses, invites.used_count, invites.status,
              classes.owner_teacher_id, classes.status as class_status,
              invites.created_at
         from invites
         join classes on classes.id = invites.class_id
        where invites.id = $1
        for update of invites, classes`,
      [inviteId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      classId: row.class_id,
      expiresAt: row.expires_at,
      maxUses: row.max_uses,
      usedCount: row.used_count,
      status: row.status,
      ownerTeacherId: row.owner_teacher_id,
      classStatus: row.class_status,
    };
  }

  async revokeInvite(tx: PoolClient, inviteId: string): Promise<void> {
    const result = await tx.query(
      `update invites set status = 'revoked'
        where id = $1 and status <> 'revoked'`,
      [inviteId],
    );
    if (result.rowCount !== 1) throw new Error("Invite changed while locked");
  }

  async lockMembershipIdentity(
    tx: PoolClient,
    classId: string,
    userId: string,
  ): Promise<void> {
    await tx.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`membership:${classId}:${userId}`],
    );
  }

  async findLiveMembership(
    tx: PoolClient,
    classId: string,
    userId: string,
  ): Promise<MembershipView | null> {
    const result = await tx.query<MembershipRow>(
      `select memberships.id, memberships.class_id, memberships.group_id,
              memberships.user_id, users.display_name, memberships.member_role,
              memberships.student_number, memberships.status, memberships.revision,
              memberships.joined_at, memberships.updated_at
         from memberships
         join users on users.id = memberships.user_id
        where memberships.class_id = $1 and memberships.user_id = $2
          and memberships.status <> 'removed'`,
      [classId, userId],
    );
    const row = result.rows[0];
    return row ? membershipView(row) : null;
  }

  async insertPendingMembership(
    tx: PoolClient,
    membershipId: string,
    classId: string,
    userId: string,
    now: Date,
  ): Promise<MembershipView> {
    const result = await tx.query<MembershipRow>(
      `insert into memberships(
         id, class_id, group_id, user_id, member_role, student_number,
         status, joined_at, revision, updated_at
       ) values ($1, $2, null, $3, 'student', null, 'pending', null, 1, $4)
       returning id, class_id, group_id, user_id,
         (select display_name from users where users.id = memberships.user_id) as display_name,
         member_role, student_number, status, revision, joined_at, updated_at`,
      [membershipId, classId, userId, now],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Membership insert did not return a row");
    return membershipView(row);
  }

  /**
   * Invite-code guest entry is an explicit student credential.  It may enter
   * the class immediately; the teacher-only moderation workflow continues to
   * use insertPendingMembership through the authenticated join route.
   */
  async insertActiveMembership(
    tx: PoolClient,
    membershipId: string,
    classId: string,
    userId: string,
    now: Date,
  ): Promise<MembershipView> {
    const result = await tx.query<MembershipRow>(
      `insert into memberships(
         id, class_id, group_id, user_id, member_role, student_number,
         status, joined_at, revision, updated_at
       ) values ($1, $2, null, $3, 'student', null, 'active', $4, 1, $4)
       returning id, class_id, group_id, user_id,
         (select display_name from users where users.id = memberships.user_id) as display_name,
         member_role, student_number, status, revision, joined_at, updated_at`,
      [membershipId, classId, userId, now],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Membership insert did not return a row");
    return membershipView(row);
  }

  async activateMembership(tx: PoolClient, membershipId: string, now: Date): Promise<void> {
    await tx.query(
      `update memberships
          set status = 'active', joined_at = coalesce(joined_at, $2),
              revision = revision + 1, updated_at = $2
        where id = $1 and status = 'pending'`,
      [membershipId, now],
    );
  }

  async consumeInvite(
    tx: PoolClient,
    inviteId: string,
    expectedUsedCount: number,
    exhaust: boolean,
  ): Promise<void> {
    const result = await tx.query(
      `update invites
          set used_count = used_count + 1,
              status = case when $3 then 'exhausted' else status end
        where id = $1 and used_count = $2 and status = 'active'`,
      [inviteId, expectedUsedCount, exhaust],
    );
    if (result.rowCount !== 1) throw new Error("Invite changed while locked");
  }
}
