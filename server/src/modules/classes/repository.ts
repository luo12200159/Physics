import type { Pool, PoolClient } from "pg";

import type { ActorRole } from "../authorization/policy.js";
import type {
  ClassListResponse,
  ClassView,
  Grade,
  GroupListResponse,
  GroupView,
  MembershipView,
  RosterResponse,
  UpdateMembershipRequest,
} from "./contracts.js";

interface ClassRow {
  id: string;
  owner_teacher_id: string;
  name: string;
  grade: Grade;
  subject: "物理";
  school_label: string | null;
  status: "active" | "archived";
  revision: number;
  created_at: Date;
  updated_at: Date;
}

interface ClassAccessRow extends ClassRow {
  active_member: boolean;
}

interface GroupRow {
  id: string;
  class_id: string;
  name: string;
  revision: number;
  created_at: Date;
  updated_at: Date;
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

interface MembershipAccessRow extends MembershipRow {
  owner_teacher_id: string;
  class_status: "active" | "archived";
}

export interface ClassAccessRecord {
  classView: ClassView;
  ownerTeacherId: string;
  activeMember: boolean;
}

export interface MembershipAccessRecord {
  membership: MembershipView;
  ownerTeacherId: string;
  classStatus: "active" | "archived";
}

export interface NewClassRecord {
  id: string;
  ownerTeacherId: string;
  name: string;
  grade: Grade;
  schoolLabel: string | null;
  now: Date;
}

export interface NewGroupRecord {
  id: string;
  classId: string;
  name: string;
  now: Date;
}

function classView(row: ClassRow): ClassView {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    subject: row.subject,
    schoolLabel: row.school_label,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function groupView(row: GroupRow): GroupView {
  return {
    id: row.id,
    classId: row.class_id,
    name: row.name,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
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

const CLASS_COLUMNS = `classes.id, classes.owner_teacher_id, classes.name, classes.grade,
  classes.subject, classes.school_label, classes.status, classes.revision,
  classes.created_at, classes.updated_at`;

const MEMBERSHIP_COLUMNS = `memberships.id, memberships.class_id, memberships.group_id,
  memberships.user_id, users.display_name, memberships.member_role,
  memberships.student_number, memberships.status, memberships.joined_at,
  memberships.revision, memberships.updated_at`;

export class ClassesRepository {
  constructor(private readonly pool: Pool) {}

  async insertClass(tx: PoolClient, record: NewClassRecord): Promise<ClassView> {
    const result = await tx.query<ClassRow>(
      `insert into classes(
         id, owner_teacher_id, name, grade, subject, school_label,
         status, revision, created_at, updated_at
       ) values ($1, $2, $3, $4, '物理', $5, 'active', 1, $6, $6)
       returning id, owner_teacher_id, name, grade, subject, school_label,
                 status, revision, created_at, updated_at`,
      [
        record.id,
        record.ownerTeacherId,
        record.name,
        record.grade,
        record.schoolLabel,
        record.now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Class insert did not return a row");
    return classView(row);
  }

  async listAuthorizedClasses(
    actorId: string,
    role: ActorRole,
    cursor: string | null,
  ): Promise<ClassListResponse> {
    let result;
    if (role === "teacher") {
      result = await this.pool.query<ClassRow>(
        `select ${CLASS_COLUMNS}
           from classes
          where classes.owner_teacher_id = $1
            and classes.status = 'active'
            and ($2::uuid is null or classes.id > $2)
          order by classes.id
          limit 101`,
        [actorId, cursor],
      );
    } else if (role === "student") {
      result = await this.pool.query<ClassRow>(
        `select ${CLASS_COLUMNS}
           from classes
          where (classes.owner_teacher_id = $1 or exists (
                  select 1 from memberships
                   where memberships.class_id = classes.id
                     and memberships.user_id = $1
                     and memberships.status = 'active'
                ))
            and classes.status = 'active'
            and ($2::uuid is null or classes.id > $2)
          order by classes.id
          limit 101`,
        [actorId, cursor],
      );
    } else {
      result = await this.pool.query<ClassRow>(
        `select ${CLASS_COLUMNS}
          from classes
          where classes.status = 'active'
            and ($1::uuid is null or classes.id > $1)
          order by classes.id
          limit 101`,
        [cursor],
      );
    }
    const mapped = result.rows.map(classView);
    const items = mapped.slice(0, 100);
    return {
      items,
      nextCursor: mapped.length > 100 ? items.at(-1)?.id ?? null : null,
    };
  }

  async findClassAccess(actorId: string, classId: string): Promise<ClassAccessRecord | null> {
    const result = await this.pool.query<ClassAccessRow>(
      `select ${CLASS_COLUMNS}, exists(
         select 1 from memberships
          where memberships.class_id = classes.id
            and memberships.user_id = $2
            and memberships.status = 'active'
       ) as active_member
         from classes
        where classes.id = $1`,
      [classId, actorId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      classView: classView(row),
      ownerTeacherId: row.owner_teacher_id,
      activeMember: row.active_member,
    };
  }

  async lockClassAccess(
    tx: PoolClient,
    actorId: string,
    classId: string,
  ): Promise<ClassAccessRecord | null> {
    const result = await tx.query<ClassAccessRow>(
      `select ${CLASS_COLUMNS}, exists(
         select 1 from memberships
          where memberships.class_id = classes.id
            and memberships.user_id = $2
            and memberships.status = 'active'
       ) as active_member
         from classes
        where classes.id = $1
        for update of classes`,
      [classId, actorId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      classView: classView(row),
      ownerTeacherId: row.owner_teacher_id,
      activeMember: row.active_member,
    };
  }

  async archiveClass(tx: PoolClient, classId: string, now: Date): Promise<ClassView> {
    const result = await tx.query<ClassRow>(
      `update classes
          set status = 'archived', revision = revision + 1, updated_at = $2
        where id = $1 and status = 'active'
        returning id, owner_teacher_id, name, grade, subject, school_label,
                  status, revision, created_at, updated_at`,
      [classId, now],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Active class archive did not return a row");
    return classView(row);
  }

  async revokeClassInvites(tx: PoolClient, classId: string): Promise<void> {
    await tx.query(
      `update invites set status = 'revoked'
        where class_id = $1 and status <> 'revoked'`,
      [classId],
    );
  }

  async revokeClassOwnerCapabilities(tx: PoolClient, classId: string, now: Date): Promise<void> {
    await tx.query(
      `update class_owner_capabilities
          set revoked_at = $2
        where class_id = $1 and revoked_at is null`,
      [classId, now],
    );
  }

  async removeClassMemberships(
    tx: PoolClient,
    classId: string,
    now: Date,
  ): Promise<MembershipView[]> {
    const result = await tx.query<MembershipRow>(
      `with removed as (
         update memberships
            set status = 'removed', group_id = null,
                revision = revision + 1, updated_at = $2
          where class_id = $1 and status <> 'removed'
          returning id, class_id, group_id, user_id,
                    member_role, student_number, status, revision, joined_at, updated_at
       )
       select removed.id, removed.class_id, removed.group_id, removed.user_id,
              users.display_name, removed.member_role, removed.student_number,
              removed.status, removed.revision, removed.joined_at, removed.updated_at
         from removed
         join users on users.id = removed.user_id`,
      [classId, now],
    );
    return result.rows.map(membershipView);
  }

  async insertGroup(tx: PoolClient, record: NewGroupRecord): Promise<GroupView> {
    const result = await tx.query<GroupRow>(
      `insert into class_groups(
         id, class_id, name, revision, created_at, updated_at
       ) values ($1, $2, $3, 1, $4, $4)
       returning id, class_id, name, revision, created_at, updated_at`,
      [record.id, record.classId, record.name, record.now],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Group insert did not return a row");
    return groupView(row);
  }

  async listGroups(classId: string, cursor: string | null): Promise<GroupListResponse> {
    const result = await this.pool.query<GroupRow>(
      `select id, class_id, name, revision, created_at, updated_at
         from class_groups
        where class_id = $1 and deleted_at is null
          and ($2::uuid is null or id > $2)
        order by id
        limit 201`,
      [classId, cursor],
    );
    const mapped = result.rows.map(groupView);
    const items = mapped.slice(0, 200);
    return {
      items,
      nextCursor: mapped.length > 200 ? items.at(-1)?.id ?? null : null,
    };
  }

  async listMembers(classId: string, cursor: string | null): Promise<RosterResponse> {
    const result = await this.pool.query<MembershipRow>(
      `select ${MEMBERSHIP_COLUMNS}
         from memberships
         join users on users.id = memberships.user_id
        where memberships.class_id = $1 and memberships.status <> 'removed'
          and ($2::uuid is null or memberships.id > $2)
        order by memberships.id
        limit 201`,
      [classId, cursor],
    );
    const mapped = result.rows.map(membershipView);
    const items = mapped.slice(0, 200);
    return {
      items,
      nextCursor: mapped.length > 200 ? items.at(-1)?.id ?? null : null,
    };
  }

  async findMembershipAccess(
    membershipId: string,
  ): Promise<MembershipAccessRecord | null> {
    const result = await this.pool.query<MembershipAccessRow>(
      `select ${MEMBERSHIP_COLUMNS}, classes.owner_teacher_id,
              classes.status as class_status
         from memberships
         join users on users.id = memberships.user_id
         join classes on classes.id = memberships.class_id
        where memberships.id = $1`,
      [membershipId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      membership: membershipView(row),
      ownerTeacherId: row.owner_teacher_id,
      classStatus: row.class_status,
    };
  }

  async lockMembership(
    tx: PoolClient,
    membershipId: string,
  ): Promise<MembershipView | null> {
    const result = await tx.query<MembershipRow>(
      `select ${MEMBERSHIP_COLUMNS}
         from memberships
         join users on users.id = memberships.user_id
        where memberships.id = $1
        for update of memberships`,
      [membershipId],
    );
    const row = result.rows[0];
    return row ? membershipView(row) : null;
  }

  async lockMembershipAccess(
    tx: PoolClient,
    membershipId: string,
  ): Promise<MembershipAccessRecord | null> {
    const result = await tx.query<MembershipAccessRow>(
      `select ${MEMBERSHIP_COLUMNS}, classes.owner_teacher_id,
              classes.status as class_status
         from memberships
         join users on users.id = memberships.user_id
         join classes on classes.id = memberships.class_id
        where memberships.id = $1
        for update of memberships, classes`,
      [membershipId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      membership: membershipView(row),
      ownerTeacherId: row.owner_teacher_id,
      classStatus: row.class_status,
    };
  }

  async groupExistsInClass(tx: PoolClient, groupId: string, classId: string): Promise<boolean> {
    const result = await tx.query<{ id: string }>(
      `select id from class_groups
        where id = $1 and class_id = $2 and deleted_at is null
        for key share`,
      [groupId, classId],
    );
    return result.rowCount === 1;
  }

  async updateMembership(
    tx: PoolClient,
    membershipId: string,
    input: UpdateMembershipRequest,
    now: Date,
  ): Promise<MembershipView> {
    const hasGroup = Object.hasOwn(input, "groupId");
    const hasStudentNumber = Object.hasOwn(input, "studentNumber");
    const result = await tx.query<MembershipRow>(
      `update memberships
          set status = coalesce($2, status),
              group_id = case
                when $2 = 'removed' then null
                when $3 then $4::uuid
                else group_id
              end,
              student_number = case when $5 then $6 else student_number end,
              joined_at = case
                when $2 = 'active' and joined_at is null then $7
                else joined_at
              end,
              revision = revision + 1,
              updated_at = $7
        where id = $1
        returning id, class_id, group_id, user_id,
          (select display_name from users where users.id = memberships.user_id) as display_name,
          member_role, student_number, status, revision, joined_at, updated_at`,
      [
        membershipId,
        input.status ?? null,
        hasGroup,
        input.groupId ?? null,
        hasStudentNumber,
        input.studentNumber?.trim() || null,
        now,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Membership update did not return a row");
    return membershipView(row);
  }
}
