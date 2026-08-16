import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import { ApiError } from "../../common/errors.js";
import { executeIdempotently, type JsonValue, type MutationIdempotency } from "../../common/idempotency.js";
import { withTransaction } from "../../infrastructure/db.js";
import { appendAudit, hashAuditIp } from "../audit/repository.js";
import {
  authorize,
  type Actor,
  type AuthorizationAction,
  type ResourceContext,
} from "../authorization/policy.js";
import type {
  ClassListResponse,
  ClassView,
  CreateClassRequest,
  CreateGroupRequest,
  GroupListResponse,
  GroupView,
  MembershipView,
  RosterResponse,
  UpdateMembershipRequest,
  DeleteClassResponse,
} from "./contracts.js";
import { appendMembershipOutbox } from "./outbox.js";
import {
  ClassesRepository,
  type ClassAccessRecord,
  type MembershipAccessRecord,
} from "./repository.js";
import {
  createOwnerCapability,
  insertOwnerCapability,
  insertOwnerUser,
  type OwnerCapabilityMaterial,
} from "./owner-capability.js";

export interface ClassServiceOptions {
  pool: Pool;
  auditIpKey: string | Buffer;
  ownerCapabilitySecret?: string | Buffer;
  syncOutboxRetentionDays: number;
  now?: () => Date;
}

export interface ClassMutationContext {
  ip: string;
  requestId: string;
  idempotency: MutationIdempotency;
}

export interface AnonymousClassCreated {
  class: ClassView;
  ownerUserId: string;
  ownerCapability: string;
  ownerCapabilityExpiresAt: string;
}

function apiExpiry(now: Date): Date {
  return new Date(Math.max(now.getTime(), Date.now()) + 24 * 60 * 60 * 1_000);
}

function resourceForClass(access: ClassAccessRecord): ResourceContext {
  return {
    classId: access.classView.id,
    ownerTeacherId: access.ownerTeacherId,
    ownerUserId: null,
    activeMember: access.activeMember,
    guardianLinked: false,
  };
}

function resourceForMembership(access: MembershipAccessRecord): ResourceContext {
  return {
    classId: access.membership.classId,
    ownerTeacherId: access.ownerTeacherId,
    ownerUserId: access.membership.userId,
    activeMember: access.membership.status === "active",
    guardianLinked: false,
  };
}

function assertAuthorized(actor: Actor, action: AuthorizationAction, resource: ResourceContext): void {
  const decision = authorize(actor, action, resource);
  if (decision.allowed) return;
  if (decision.code === "reauthentication_required") {
    throw new ApiError(403, decision.code, "Recent password verification is required");
  }
  throw new ApiError(403, decision.code, "Resource access is forbidden");
}

function trimmed(value: string, maximum: number, field: string): string {
  const result = value.normalize("NFKC").trim();
  if (result.length < 1 || result.length > maximum || /[\u0000-\u001f\u007f]/u.test(result)) {
    throw new ApiError(400, "validation_error", `${field} is invalid`);
  }
  return result;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "23505";
}

function classAuditState(value: ClassView): JsonValue {
  return {
    id: value.id,
    name: value.name,
    grade: value.grade,
    subject: value.subject,
    schoolLabel: value.schoolLabel,
    status: value.status,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function groupAuditState(value: GroupView): JsonValue {
  return {
    id: value.id,
    classId: value.classId,
    name: value.name,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function membershipAuditState(value: MembershipView): JsonValue {
  return {
    id: value.id,
    classId: value.classId,
    groupId: value.groupId,
    userId: value.userId,
    displayName: value.displayName,
    memberRole: value.memberRole,
    studentNumber: value.studentNumber,
    status: value.status,
    revision: value.revision,
    joinedAt: value.joinedAt,
    updatedAt: value.updatedAt,
  };
}

export class ClassesService {
  private readonly repository: ClassesRepository;
  private readonly now: () => Date;

  constructor(private readonly options: ClassServiceOptions) {
    if (!Number.isInteger(options.syncOutboxRetentionDays)
      || options.syncOutboxRetentionDays < 1
      || options.syncOutboxRetentionDays > 3_650) {
      throw new TypeError("syncOutboxRetentionDays must be between 1 and 3650");
    }
    this.repository = new ClassesRepository(options.pool);
    this.now = options.now ?? (() => new Date());
  }

  private ownerCapabilitySecret(): string | Buffer {
    // Production bootstrap always supplies the JWT secret.  The stable test
    // fallback keeps v2.8 service factories source-compatible; it is not used
    // by the production `makeBootstrapDependencies` path.
    return this.options.ownerCapabilitySecret ?? "v3-owner-capability-test-secret-at-least-32";
  }

  private async classAccess(actor: Actor, classId: string): Promise<ClassAccessRecord> {
    const access = await this.repository.findClassAccess(actor.userId, classId);
    if (!access) throw new ApiError(404, "class_not_found", "Class was not found");
    return access;
  }

  async createClass(
    actor: Actor,
    input: CreateClassRequest,
    context: ClassMutationContext,
  ): Promise<ClassView> {
    // Class creation is the operation that grants class-scoped owner/teacher
    // authority.  It must not depend on a pre-existing global teacher role or
    // an administrator-created invitation.  Parent accounts remain excluded
    // by the authorization policy because their scope is guardian-only.
    if (actor.role === "parent") {
      throw new ApiError(403, "resource_forbidden", "Parent accounts cannot create classes");
    }
    const name = trimmed(input.name, 120, "Class name");
    const schoolLabel = input.schoolLabel === undefined || input.schoolLabel === null
      ? null
      : trimmed(input.schoolLabel, 120, "School label");
    const now = this.now();
    const result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
      ...context.idempotency,
      actorId: actor.userId,
      expiresAt: apiExpiry(now),
    }, async () => {
      assertAuthorized(actor, "class.manage", {
        classId: null,
        ownerTeacherId: actor.userId,
        ownerUserId: null,
        activeMember: false,
        guardianLinked: false,
      });
      const created = await this.repository.insertClass(tx, {
        id: randomUUID(),
        ownerTeacherId: actor.userId,
        name,
        // v2.8 clients always sent grade. v2.9 quick-create may omit it;
        // keep the persisted ClassView schema valid with a stable default.
        grade: input.grade || "高一",
        schoolLabel,
        now,
      });
      await appendAudit(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        action: "class.create",
        resourceType: "class",
        resourceId: created.id,
        classId: created.id,
        result: "succeeded",
        beforeState: null,
        afterState: classAuditState(created),
        reason: null,
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return { statusCode: 201, body: classAuditState(created) };
    }));
    if (result.body === null) throw new Error("Class response is missing");
    return result.body as ClassView;
  }

  /**
   * Create a class for an offline/local teacher profile without pretending
   * that the caller has a server password account.  The generated owner
   * capability is scoped to the synthetic teacher and is returned exactly
   * once; later management calls use `Authorization: Owner <token>`.
   */
  async createAnonymousClass(
    input: CreateClassRequest,
    context: Pick<ClassMutationContext, "ip" | "requestId">,
  ): Promise<AnonymousClassCreated> {
    const name = trimmed(input.name, 120, "Class name");
    const schoolLabel = input.schoolLabel === undefined || input.schoolLabel === null
      ? null
      : trimmed(input.schoolLabel, 120, "School label");
    const now = this.now();
    const ownerUserId = randomUUID();
    const classId = randomUUID();
    const material: OwnerCapabilityMaterial = createOwnerCapability(
      ownerUserId,
      this.ownerCapabilitySecret(),
      now,
    );
    const created = await withTransaction(this.options.pool, async (tx) => {
      await insertOwnerUser(tx, ownerUserId, "本机教师", now);
      const classView = await this.repository.insertClass(tx, {
        id: classId,
        ownerTeacherId: ownerUserId,
        name,
        grade: input.grade || "\u9ad8\u4e00",
        schoolLabel,
        now,
      });
      await insertOwnerCapability(tx, { ...material, classId }, now);
      await appendAudit(tx, {
        actorId: ownerUserId,
        actorRole: "teacher",
        action: "class.create.anonymous",
        resourceType: "class",
        resourceId: classView.id,
        classId: classView.id,
        result: "succeeded",
        beforeState: null,
        afterState: classAuditState(classView),
        reason: "owner_capability",
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return classView;
    });
    return {
      class: created,
      ownerUserId,
      ownerCapability: material.token,
      ownerCapabilityExpiresAt: material.expiresAt.toISOString(),
    };
  }

  async listClasses(actor: Actor, cursor: string | null): Promise<ClassListResponse> {
    if (actor.role === "parent") {
      throw new ApiError(403, "resource_forbidden", "Class list access is forbidden");
    }
    return this.repository.listAuthorizedClasses(actor.userId, actor.role, cursor);
  }

  async getClass(actor: Actor, classId: string): Promise<ClassView> {
    const access = await this.classAccess(actor, classId);
    assertAuthorized(actor, "class.read", resourceForClass(access));
    if (access.classView.status !== "active") {
      throw new ApiError(404, "class_not_found", "Class was not found");
    }
    return access.classView;
  }

  async deleteClass(
    actor: Actor,
    classId: string,
    context: ClassMutationContext,
  ): Promise<DeleteClassResponse> {
    const now = this.now();
    const result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
      ...context.idempotency,
      actorId: actor.userId,
      expiresAt: apiExpiry(now),
    }, async () => {
      const access = await this.repository.lockClassAccess(tx, actor.userId, classId);
      if (!access || access.classView.status !== "active") {
        throw new ApiError(404, "class_not_found", "Class was not found");
      }
      assertAuthorized(actor, "class.manage", resourceForClass(access));
      const archived = await this.repository.archiveClass(tx, classId, now);
      await this.repository.revokeClassInvites(tx, classId);
      await this.repository.revokeClassOwnerCapabilities(tx, classId, now);
      const removedMemberships = await this.repository.removeClassMemberships(tx, classId, now);
      for (const membership of removedMemberships) {
        await appendMembershipOutbox(tx, {
          membership,
          ownerTeacherId: access.ownerTeacherId,
          operation: "delete",
          occurredAt: now,
          retentionDays: this.options.syncOutboxRetentionDays,
        });
      }
      await appendAudit(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        action: "class.delete",
        resourceType: "class",
        resourceId: classId,
        classId,
        result: "succeeded",
        beforeState: classAuditState(access.classView),
        afterState: classAuditState(archived),
        reason: "owner_requested",
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return {
        statusCode: 200,
        body: { id: classId, status: "archived" as const },
      };
    }));
    if (result.body === null) throw new Error("Delete class response is missing");
    return result.body as DeleteClassResponse;
  }

  async createGroup(
    actor: Actor,
    classId: string,
    input: CreateGroupRequest,
    context: ClassMutationContext,
  ): Promise<GroupView> {
    const name = trimmed(input.name, 80, "Group name");
    const now = this.now();
    try {
      const result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
        ...context.idempotency,
        actorId: actor.userId,
        expiresAt: apiExpiry(now),
      }, async () => {
        const access = await this.repository.lockClassAccess(tx, actor.userId, classId);
        if (!access) throw new ApiError(404, "class_not_found", "Class was not found");
        assertAuthorized(actor, "class.manage", resourceForClass(access));
        if (access.classView.status !== "active") {
          throw new ApiError(409, "class_archived", "Archived classes cannot be changed");
        }
        const created = await this.repository.insertGroup(tx, {
          id: randomUUID(),
          classId,
          name,
          now,
        });
        await appendAudit(tx, {
          actorId: actor.userId,
          actorRole: actor.role,
          action: "class.group.create",
          resourceType: "classGroup",
          resourceId: created.id,
          classId,
          result: "succeeded",
          beforeState: null,
          afterState: groupAuditState(created),
          reason: null,
          requestId: context.requestId,
          ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
        });
        return { statusCode: 201, body: groupAuditState(created) };
      }));
      if (result.body === null) throw new Error("Group response is missing");
      return result.body as GroupView;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "group_name_conflict", "A group with this name already exists");
      }
      throw error;
    }
  }

  async listGroups(
    actor: Actor,
    classId: string,
    cursor: string | null,
  ): Promise<GroupListResponse> {
    const access = await this.classAccess(actor, classId);
    assertAuthorized(actor, "class.read", resourceForClass(access));
    return this.repository.listGroups(classId, cursor);
  }

  async getRoster(
    actor: Actor,
    classId: string,
    cursor: string | null,
  ): Promise<RosterResponse> {
    const access = await this.classAccess(actor, classId);
    if (actor.role !== "administrator" && access.ownerTeacherId !== actor.userId) {
      throw new ApiError(403, "resource_forbidden", "Roster access is forbidden");
    }
    return this.repository.listMembers(classId, cursor);
  }

  async updateMembership(
    actor: Actor,
    membershipId: string,
    input: UpdateMembershipRequest,
    context: ClassMutationContext,
  ): Promise<MembershipView> {
    if (Object.keys(input).length === 0) {
      throw new ApiError(400, "validation_error", "At least one membership change is required");
    }
    if (input.studentNumber !== undefined && input.studentNumber !== null) {
      input = { ...input, studentNumber: trimmed(input.studentNumber, 40, "Student number") };
    }
    const now = this.now();
    const result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
      ...context.idempotency,
      actorId: actor.userId,
      expiresAt: apiExpiry(now),
    }, async () => {
      const access = await this.repository.lockMembershipAccess(tx, membershipId);
      if (!access) throw new ApiError(404, "membership_not_found", "Membership was not found");
      assertAuthorized(actor, "membership.manage", resourceForMembership(access));
      if (access.classStatus !== "active") {
        throw new ApiError(409, "class_archived", "Archived classes cannot be changed");
      }
      const current = access.membership;
      if (current.status === "removed") {
        throw new ApiError(409, "membership_removed", "Removed memberships cannot be changed");
      }
      if (input.groupId) {
        const validGroup = await this.repository.groupExistsInClass(
          tx,
          input.groupId,
          current.classId,
        );
        if (!validGroup) {
          throw new ApiError(409, "group_class_mismatch", "Group does not belong to this class");
        }
      }
      const updated = await this.repository.updateMembership(tx, membershipId, input, now);
      await appendMembershipOutbox(tx, {
        membership: updated,
        ownerTeacherId: access.ownerTeacherId,
        operation: updated.status === "removed" ? "delete" : "update",
        occurredAt: now,
        retentionDays: this.options.syncOutboxRetentionDays,
      });
      await appendAudit(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        action: "membership.update",
        resourceType: "membership",
        resourceId: updated.id,
        classId: updated.classId,
        result: "succeeded",
        beforeState: membershipAuditState(current),
        afterState: membershipAuditState(updated),
        reason: null,
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return { statusCode: 200, body: membershipAuditState(updated) };
    }));
    if (result.body === null) throw new Error("Membership response is missing");
    return result.body as MembershipView;
  }
}

export function createClassesService(options: ClassServiceOptions): ClassesService {
  return new ClassesService(options);
}
