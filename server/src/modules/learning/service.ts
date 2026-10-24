import { createHash, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { ApiError } from "../../common/errors.js";
import {
  executeIdempotently,
  type JsonValue,
  type MutationIdempotency,
} from "../../common/idempotency.js";
import { withTransaction } from "../../infrastructure/db.js";
import { appendAudit, hashAuditIp } from "../audit/repository.js";
import { authorize, type Actor, type AuthorizationAction } from "../authorization/policy.js";
import { validateSubmissionAnswers, visibleQuestionItems, type AssignmentQuestionItem } from "./assignment-domain.js";
import type {
  AssignmentListResponse,
  AssignmentRequest,
  AssignmentView,
  ClassLearningSummary,
  ExamSyncResponse,
  ReportSnapshotListResponse,
  ReportSnapshotRequest,
  ReportSnapshotView,
  ReviewCaseListResponse,
  ReviewCaseView,
  ReviewDecisionRequest,
  SubmissionRequest,
  SubmissionListResponse,
  SubmissionView,
  SyncExamRecordsRequest,
  SyncLearningRequest,
  SyncVariantSetsRequest,
  VariantSetListResponse,
  VariantSetSyncResponse,
  VariantSetView,
} from "./contracts.js";

interface ClassAccessRow {
  id: string;
  owner_teacher_id: string;
  status: "active" | "archived";
  active_member: boolean;
  membership_id: string | null;
}

interface ProfileRow {
  id: string;
  user_id: string;
  client_entity_id: string;
  display_name: string;
  grade: string;
  curriculum_version: string;
}

interface AssignmentRow {
  id: string;
  class_id: string;
  title: string;
  instructions: string;
  due_at: Date | null;
  status: "draft" | "published" | "closed";
  revision: number;
  published_snapshot: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

interface SubmissionRow {
  id: string;
  assignment_id: string;
  client_entity_id: string;
  status: "submitted" | "underReview" | "returned" | "accepted";
  submitted_at: Date;
  answers?: SubmissionRequest["answers"];
  student_user_id?: string;
  student_display_name?: string;
  submission_version?: number;
  previous_submission_id?: string | null;
  review_status?: "pending" | "approved" | "returned" | "rejudged";
  current_score?: number | string | null;
  feedback?: string | null;
}

interface ReviewCaseRow {
  id: string;
  submission_id: string;
  assignment_id: string;
  class_id: string;
  status: "pending" | "approved" | "returned" | "rejudged";
  current_score: number | string | null;
  revision: number;
  submitted_at: Date;
  updated_at: Date;
  student_display_name?: string;
  answers?: SubmissionRequest["answers"];
  submission_version?: number;
  previous_answers?: SubmissionRequest["answers"] | null;
}

interface SnapshotRow {
  entity_id: string;
  scope_id: string;
  revision: number;
  payload: Record<string, unknown>;
  updated_at: Date;
  profile_id: string;
}

interface VariantSetRow {
  id: string;
  class_id: string;
  client_entity_id: string;
  parent_question_id: string;
  source_content_hash: string;
  cache_key: string;
  spec_version: string;
  generator_version: string;
  status: "approved";
  payload: Record<string, unknown>;
  payload_hash: Buffer;
  updated_at: Date;
}

export interface LearningServiceOptions {
  pool: Pool;
  auditIpKey: string | Buffer;
  now?: () => Date;
}

export interface LearningMutationContext {
  ip: string;
  requestId: string;
  idempotency: MutationIdempotency;
}

function apiExpiry(now: Date): Date {
  return new Date(Math.max(now.getTime(), Date.now()) + 24 * 60 * 60 * 1_000);
}

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "23505";
}

function reject(code: string, message: string, statusCode = 403): never {
  throw new ApiError(statusCode, code, message);
}

function assertAllowed(actor: Actor, action: AuthorizationAction, access: ClassAccessRow): void {
  const decision = authorize(actor, action, {
    classId: access.id,
    ownerTeacherId: access.owner_teacher_id,
    ownerUserId: actor.role === "student" ? actor.userId : null,
    activeMember: access.active_member,
    guardianLinked: false,
  });
  if (decision.allowed) return;
  if (decision.code === "reauthentication_required") {
    reject(decision.code, "Recent password verification is required");
  }
  reject(decision.code, "Resource access is forbidden");
}

function requireActiveClass(access: ClassAccessRow): void {
  if (access.status !== "active") reject("class_archived", "Archived classes cannot be changed", 409);
}

function normalizeGrade(value: string): string {
  const grade = value.normalize("NFKC").trim();
  const aliases = new Map([
    ["grade8", "八年级"],
    ["grade9", "九年级"],
    ["senior1", "高一"],
    ["senior2", "高二"],
    ["senior3", "高三"],
  ]);
  const normalized = aliases.get(grade.toLowerCase()) ?? grade;
  if (!new Set(["八年级", "九年级", "高一", "高二", "高三"]).has(normalized)) {
    throw new ApiError(400, "validation_error", "Grade is not supported");
  }
  return normalized;
}

function normalizeDifficulty(value: string): string {
  const difficulty = value.normalize("NFKC").trim();
  const aliases = new Map([
    ["basic", "基础"],
    ["advanced", "进阶"],
    ["challenge", "挑战"],
  ]);
  const normalized = aliases.get(difficulty.toLowerCase()) ?? difficulty;
  if (!new Set(["基础", "进阶", "挑战"]).has(normalized)) {
    throw new ApiError(400, "validation_error", "Difficulty is not supported");
  }
  return normalized;
}

function normalizePrimaryErrorType(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const normalized = value.normalize("NFKC").trim();
  if (!new Set(["审题", "概念", "建模", "规律适用条件", "计算", "单位", "方向或符号", "图像或实验", "表达", "猜测作答"]).has(normalized)) {
    throw new ApiError(400, "validation_error", "Primary error type is not supported");
  }
  return normalized;
}

function profileView(row: ProfileRow): JsonValue {
  return {
    profileId: row.id,
    clientEntityId: row.client_entity_id,
    displayName: row.display_name,
    grade: row.grade,
    curriculumVersion: row.curriculum_version,
  };
}

function parseSnapshot(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function assignmentView(row: AssignmentRow): AssignmentView {
  const snapshot = parseSnapshot(row.published_snapshot);
  const targetType = snapshot.targetType === "group" || snapshot.targetType === "student"
    ? snapshot.targetType
    : "class";
  const targetId = typeof snapshot.targetId === "string" ? snapshot.targetId : null;
  const questionIds = Array.isArray(snapshot.questionIds)
    ? snapshot.questionIds.filter((item): item is string => typeof item === "string")
    : [];
  const knowledgePointKeys = Array.isArray(snapshot.knowledgePointKeys)
    ? snapshot.knowledgePointKeys.filter((item): item is string => typeof item === "string")
    : [];
  const questionItems = Array.isArray(snapshot.questionItems)
    ? visibleQuestionItems(snapshot.questionItems as AssignmentQuestionItem[])
    : [];
  return {
    id: row.id,
    classId: row.class_id,
    title: row.title,
    instructions: row.instructions,
    dueAt: row.due_at?.toISOString() ?? null,
    status: row.status,
    revision: row.revision,
    targetType,
    targetId,
    questionIds,
    questionItems,
    knowledgePointKeys,
    target: typeof snapshot.target === "string" ? snapshot.target : "",
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function submissionView(row: SubmissionRow): SubmissionView {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    clientEntityId: row.client_entity_id,
    status: row.status,
    submittedAt: row.submitted_at.toISOString(),
    ...(row.answers ? { answers: row.answers } : {}),
    ...(row.student_user_id ? { studentUserId: row.student_user_id } : {}),
    ...(row.student_display_name ? { studentDisplayName: row.student_display_name } : {}),
    ...(row.submission_version ? { version: row.submission_version } : {}),
    ...(row.submission_version ? { previousSubmissionId: row.previous_submission_id ?? null } : {}),
    ...(row.review_status ? { reviewStatus: row.review_status } : {}),
    ...(row.current_score !== undefined ? { score: row.current_score === null ? null : Number(row.current_score) } : {}),
    ...(row.feedback !== undefined ? { feedback: row.feedback } : {}),
  };
}

function reviewView(row: ReviewCaseRow): ReviewCaseView {
  return {
    id: row.id,
    submissionId: row.submission_id,
    assignmentId: row.assignment_id,
    classId: row.class_id,
    status: row.status,
    currentScore: row.current_score === null ? null : Number(row.current_score),
    revision: row.revision,
    submittedAt: row.submitted_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.student_display_name ? { studentDisplayName: row.student_display_name } : {}),
    ...(row.answers ? { answers: row.answers } : {}),
    ...(row.submission_version ? { submissionVersion: row.submission_version } : {}),
    ...(row.previous_answers ? { previousAnswers: row.previous_answers } : {}),
  };
}

function variantSetView(row: VariantSetRow): VariantSetView {
  const payload = parseSnapshot(row.payload);
  return {
    clientEntityId: row.client_entity_id,
    classId: row.class_id,
    parentQuestionId: row.parent_question_id,
    sourceContentHash: row.source_content_hash,
    cacheKey: row.cache_key,
    specVersion: row.spec_version,
    generatorVersion: row.generator_version,
    status: "approved",
    variants: Array.isArray(payload.variants) ? payload.variants as VariantSetView["variants"] : [],
    updatedAt: row.updated_at.toISOString(),
  };
}

export class LearningService {
  private readonly now: () => Date;

  constructor(private readonly options: LearningServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  private async assertPersistedStudentConsent(tx: PoolClient, studentUserId: string): Promise<void> {
    // The client's age flag or consent boolean is not evidence of authorization.
    // Legacy accounts have no row and therefore cannot upload personal learning data.
    const result = await tx.query<{ age_band: string; guardian_user_id: string | null }>(
      `select age_band, guardian_user_id
         from student_data_consents
        where student_user_id = $1
          and consent_status = 'verified'
          and withdrawn_at is null
          and verified_at <= now()`,
      [studentUserId],
    );
    const record = result.rows[0];
    if (!record || (record.age_band === "under14" && !record.guardian_user_id)) {
      reject("student_consent_not_verified", "Server-verified student data consent is required");
    }
  }

  private async classAccess(actorId: string, classId: string): Promise<ClassAccessRow> {
    const result = await this.options.pool.query<ClassAccessRow>(
      `select c.id, c.owner_teacher_id, c.status,
              exists(
                select 1 from memberships m
                 where m.class_id = c.id and m.user_id = $1 and m.status = 'active'
              ) as active_member,
              (
                select m.id from memberships m
                 where m.class_id = c.id and m.user_id = $1 and m.status = 'active'
                 order by m.id limit 1
              ) as membership_id
         from classes c
        where c.id = $2`,
      [actorId, classId],
    );
    const access = result.rows[0];
    if (!access) throw new ApiError(404, "class_not_found", "Class was not found");
    return access;
  }

  private assertStudentMember(actor: Actor, access: ClassAccessRow): void {
    if (actor.role !== "student" || !access.active_member || !access.membership_id) {
      reject("resource_forbidden", "Only an active class student can access this resource");
    }
  }

  private async ensureProfile(
    tx: PoolClient,
    actor: Actor,
    profile: SyncLearningRequest["profile"],
    now: Date,
  ): Promise<ProfileRow> {
    const clientEntityId = profile.clientEntityId.normalize("NFKC").trim();
    const grade = normalizeGrade(profile.grade);
    const existingResult = await tx.query<ProfileRow>(
      `select id, user_id, client_entity_id, display_name, grade, curriculum_version
         from student_profiles where user_id = $1 for update`,
      [actor.userId],
    );
    const existing = existingResult.rows[0];
    if (existing && existing.client_entity_id !== clientEntityId) {
      throw new ApiError(409, "profile_binding_conflict", "This account is already bound to another local student profile");
    }
    if (existing) {
      const updated = await tx.query<ProfileRow>(
        `update student_profiles
            set display_name = $2, grade = $3, curriculum_version = $4,
                revision = revision + 1, updated_at = $5
          where id = $1
        returning id, user_id, client_entity_id, display_name, grade, curriculum_version`,
        [existing.id, profile.displayName.trim(), grade, profile.curriculumVersion.trim(), now],
      );
      const row = updated.rows[0];
      if (!row) throw new Error("Profile update did not return a row");
      return row;
    }
    try {
      const inserted = await tx.query<ProfileRow>(
        `insert into student_profiles(
           id, user_id, client_entity_id, display_name, grade, curriculum_version,
           revision, created_at, updated_at
         ) values ($1, $2, $3, $4, $5, $6, 1, $7, $7)
         returning id, user_id, client_entity_id, display_name, grade, curriculum_version`,
        [randomUUID(), actor.userId, clientEntityId, profile.displayName.trim(), grade, profile.curriculumVersion.trim(), now],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Profile insert did not return a row");
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, "profile_binding_conflict", "This account is already bound to a student profile");
      }
      throw error;
    }
  }

  private async recordInboundEvent(
    tx: PoolClient,
    actor: Actor,
    deviceId: string,
    eventId: string,
    baseRevision: number,
    entityId: string,
    payload: unknown,
    clientCreatedAt: string | undefined,
    entityType: "attempt_batch" | "exam_batch",
    context: LearningMutationContext,
  ): Promise<void> {
    const inserted = await tx.query(
      `insert into sync_inbound_events(
         event_id, actor_id, device_id, scope_type, scope_id, entity_type, entity_id,
         operation, base_revision, payload, idempotency_key, request_hash, client_created_at
       ) values ($1, $2, $3, 'user', $2, $4, $5, 'create', $6, $7::jsonb, $8, $9, $10)
       on conflict (event_id) do nothing`,
      [
        eventId,
        actor.userId,
        deviceId,
        entityType,
        entityId,
        baseRevision,
        JSON.stringify(payload),
        context.idempotency.key,
        context.idempotency.requestHash,
        clientCreatedAt ? new Date(clientCreatedAt) : this.now(),
      ],
    );
    if (!inserted.rowCount) {
      throw new ApiError(409, "sync_event_conflict", "This learning event was already accepted with different request state");
    }
  }

  async syncLearning(
    actor: Actor,
    classId: string,
    input: SyncLearningRequest,
    context: LearningMutationContext,
  ): Promise<JsonValue> {
    const access = await this.classAccess(actor.userId, classId);
    assertAllowed(actor, "sync.write", access);
    this.assertStudentMember(actor, access);
    requireActiveClass(access);
    const now = this.now();
    const result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
      ...context.idempotency,
      actorId: actor.userId,
      expiresAt: apiExpiry(now),
    }, async () => {
      await this.assertPersistedStudentConsent(tx, actor.userId);
      const profile = await this.ensureProfile(tx, actor, input.profile, now);
      await this.recordInboundEvent(
        tx,
        actor,
        input.deviceId,
        input.clientEventId ?? randomUUID(),
        input.baseRevision ?? 0,
        input.profile.clientEntityId,
        input,
        input.clientCreatedAt,
        "attempt_batch",
        context,
      );
      let accepted = 0;
      let duplicates = 0;
      for (const attempt of input.attempts) {
        const inserted = await tx.query<{ id: string }>(
          `insert into attempts(
             id, owner_user_id, client_entity_id, profile_id, question_id,
             session_client_id, knowledge_point_ids, question_type, model_family_id,
             variant_role, difficulty, started_at, completed_at,
             active_duration_seconds, hint_view_count, max_hint_level,
             confidence_before, confidence_after, final_answer, grading_status, score,
             verification_issues, secondary_error_types, reflection, self_explanation,
             model_evidence, model_score, teacher_review_status
           ) values(
             $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13,
             $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb, $23::jsonb,
             $24, $25, $26::jsonb, $27, $28
           ) on conflict (owner_user_id, client_entity_id) do nothing
           returning id`,
          [
            randomUUID(), actor.userId, attempt.clientEntityId, profile.id,
            attempt.questionId, attempt.sessionClientId, JSON.stringify(attempt.knowledgePointIds),
            attempt.questionType, attempt.modelFamilyId ?? null, attempt.variantRole,
            normalizeDifficulty(attempt.difficulty), new Date(attempt.startedAt),
            new Date(attempt.completedAt), attempt.activeDurationSeconds, attempt.hintViewCount,
            attempt.maxHintLevel, attempt.confidenceBefore ?? null, attempt.confidenceAfter ?? null,
            attempt.finalAnswer, attempt.gradingStatus, attempt.score ?? null,
            JSON.stringify(attempt.verificationIssues), JSON.stringify(attempt.secondaryErrorTypes),
            attempt.reflection, attempt.selfExplanation, JSON.stringify(attempt.modelEvidence),
            attempt.modelScore ?? null, attempt.teacherReviewStatus,
          ],
        );
        if (inserted.rowCount) accepted += 1;
        else duplicates += 1;
      }
      const response = {
        profileId: profile.id,
        accepted,
        duplicates,
        conflicts: [] as string[],
        lastAcceptedAt: accepted ? now.toISOString() : null,
      };
      await appendAudit(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        action: "learning.attempts.sync",
        resourceType: "studentProfile",
        resourceId: profile.id,
        classId,
        result: "succeeded",
        beforeState: null,
        afterState: asJson(response),
        reason: null,
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return { statusCode: 200, body: asJson(response) };
    }));
    return result.body ?? {};
  }

  async syncExamRecords(
    actor: Actor,
    classId: string,
    input: SyncExamRecordsRequest,
    context: LearningMutationContext,
  ): Promise<ExamSyncResponse> {
    const access = await this.classAccess(actor.userId, classId);
    assertAllowed(actor, "sync.write", access);
    this.assertStudentMember(actor, access);
    requireActiveClass(access);
    const now = this.now();
    const result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
      ...context.idempotency,
      actorId: actor.userId,
      expiresAt: apiExpiry(now),
    }, async () => {
      await this.assertPersistedStudentConsent(tx, actor.userId);
      const profile = await this.ensureProfile(tx, actor, input.profile, now);
      await this.recordInboundEvent(
        tx,
        actor,
        input.deviceId,
        input.clientEventId ?? randomUUID(),
        input.baseRevision ?? 0,
        `exam-${input.profile.clientEntityId}`,
        input,
        input.clientCreatedAt,
        "exam_batch",
        context,
      );
      let accepted = 0;
      let duplicates = 0;
      for (const record of input.records) {
        if (record.score > record.maxScore) {
          throw new ApiError(400, "validation_error", "Exam score cannot exceed max score");
        }
        const inserted = await tx.query<{ id: string }>(
          `insert into exam_records(
             id, owner_user_id, client_entity_id, profile_id, student_user_id,
             exam_name, occurred_on, score, max_score, source, knowledge_point_scores
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual', $10::jsonb)
           on conflict (owner_user_id, client_entity_id) do nothing
           returning id`,
          [randomUUID(), actor.userId, record.clientEntityId, profile.id, actor.userId,
            record.examName.trim(), record.occurredOn, record.score, record.maxScore,
            JSON.stringify(record.knowledgePointScores)],
        );
        if (inserted.rowCount) accepted += 1;
        else duplicates += 1;
      }
      const response: ExamSyncResponse = { profileId: profile.id, accepted, duplicates, conflicts: [] };
      await appendAudit(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        action: "learning.exams.sync",
        resourceType: "studentProfile",
        resourceId: profile.id,
        classId,
        result: "succeeded",
        beforeState: null,
        afterState: asJson(response),
        reason: null,
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return { statusCode: 200, body: asJson(response) };
    }));
    return result.body as unknown as ExamSyncResponse;
  }

  async syncVariantSets(
    actor: Actor,
    classId: string,
    input: SyncVariantSetsRequest,
    context: LearningMutationContext,
  ): Promise<VariantSetSyncResponse> {
    const access = await this.classAccess(actor.userId, classId);
    assertAllowed(actor, "assignment.create", access);
    requireActiveClass(access);
    const now = this.now();
    const result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
      ...context.idempotency,
      actorId: actor.userId,
      expiresAt: apiExpiry(now),
    }, async () => {
      let accepted = 0;
      let duplicates = 0;
      const items: VariantSetView[] = [];
      for (const item of input.sets) {
        if (item.variants.some((variant) => {
          const validation = parseSnapshot(variant.validation);
          return validation.passed !== true
            || !["teacher-approved", "system-validated"].includes(variant.approvalStatus);
        })) {
          throw new ApiError(400, "variant_not_approved", "Every synced variant must pass validation and teacher/system approval");
        }
        const payload = JSON.stringify(item);
        const payloadHash = createHash("sha256").update(payload, "utf8").digest();
        const existing = await tx.query<VariantSetRow>(
          `select id, class_id, client_entity_id, parent_question_id, source_content_hash,
                  cache_key, spec_version, generator_version, status, payload, payload_hash, updated_at
             from class_variant_sets
            where class_id = $1 and (client_entity_id = $2 or cache_key = $3)
            for update`,
          [classId, item.clientEntityId, item.cacheKey],
        );
        if (existing.rows.length > 1) {
          throw new ApiError(409, "variant_identity_conflict", "Variant set identity and cache key refer to different records");
        }
        const current = existing.rows[0];
        if (current?.payload_hash.equals(payloadHash)) {
          duplicates += 1;
          items.push(variantSetView(current));
          continue;
        }
        const updated = current
          ? await tx.query<VariantSetRow>(
            `update class_variant_sets
                set client_entity_id = $3, parent_question_id = $4, source_content_hash = $5,
                    cache_key = $6, spec_version = $7, generator_version = $8,
                    status = 'approved', payload = $9::jsonb, payload_hash = $10, updated_at = $11
              where id = $1 and class_id = $2
            returning id, class_id, client_entity_id, parent_question_id, source_content_hash,
                      cache_key, spec_version, generator_version, status, payload, payload_hash, updated_at`,
            [current.id, classId, item.clientEntityId, item.parentQuestionId, item.sourceContentHash,
              item.cacheKey, item.specVersion, item.generatorVersion, payload, payloadHash, now],
          )
          : await tx.query<VariantSetRow>(
            `insert into class_variant_sets(
               id, class_id, client_entity_id, parent_question_id, source_content_hash,
               cache_key, spec_version, generator_version, status, payload, payload_hash,
               created_by, created_at, updated_at
             ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', $9::jsonb, $10, $11, $12, $12)
            returning id, class_id, client_entity_id, parent_question_id, source_content_hash,
                      cache_key, spec_version, generator_version, status, payload, payload_hash, updated_at`,
            [randomUUID(), classId, item.clientEntityId, item.parentQuestionId, item.sourceContentHash,
              item.cacheKey, item.specVersion, item.generatorVersion, payload, payloadHash, actor.userId, now],
          );
        const row = updated.rows[0];
        if (!row) throw new Error("Variant set sync did not return a row");
        accepted += 1;
        items.push(variantSetView(row));
      }
      const response: VariantSetSyncResponse = { accepted, duplicates, items };
      await appendAudit(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        action: "variant.sets.sync",
        resourceType: "class",
        resourceId: classId,
        classId,
        result: "succeeded",
        beforeState: null,
        afterState: asJson({ accepted, duplicates, clientEntityIds: items.map((item) => item.clientEntityId) }),
        reason: null,
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return { statusCode: 200, body: asJson(response) };
    }));
    return result.body as unknown as VariantSetSyncResponse;
  }

  async listVariantSets(actor: Actor, classId: string): Promise<VariantSetListResponse> {
    const access = await this.classAccess(actor.userId, classId);
    assertAllowed(actor, "class.read", access);
    requireActiveClass(access);
    const result = await this.options.pool.query<VariantSetRow>(
      `select id, class_id, client_entity_id, parent_question_id, source_content_hash,
              cache_key, spec_version, generator_version, status, payload, payload_hash, updated_at
         from class_variant_sets where class_id = $1 and status = 'approved'
        order by updated_at desc limit 500`,
      [classId],
    );
    return { items: result.rows.map(variantSetView) };
  }

  async createAssignment(
    actor: Actor,
    classId: string,
    input: AssignmentRequest,
    context: LearningMutationContext,
  ): Promise<AssignmentView> {
    const access = await this.classAccess(actor.userId, classId);
    assertAllowed(actor, input.publish ? "assignment.publish" : "assignment.create", access);
    requireActiveClass(access);
    const targetId = input.targetId ?? null;
    const now = this.now();
    const result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
      ...context.idempotency,
      actorId: actor.userId,
      expiresAt: apiExpiry(now),
    }, async () => {
      if (input.targetType === "class" && targetId !== null) {
        throw new ApiError(400, "validation_error", "Class assignments cannot have a target id");
      }
      if (input.targetType !== "class" && targetId === null) {
        throw new ApiError(400, "validation_error", "A group or student assignment requires a target id");
      }
      if (input.targetType === "group") {
        const group = await tx.query("select 1 from class_groups where id = $1 and class_id = $2", [targetId, classId]);
        if (!group.rowCount) throw new ApiError(400, "target_not_in_class", "The group does not belong to this class");
      }
      if (input.targetType === "student") {
        const member = await tx.query(
          `select 1 from memberships where id = $1 and class_id = $2 and status = 'active' and member_role = 'student'`,
          [targetId, classId],
        );
        if (!member.rowCount) throw new ApiError(400, "target_not_in_class", "The student is not an active member of this class");
      }
      if (new Set(input.questionIds).size !== input.questionIds.length) {
        throw new ApiError(400, "duplicate_question", "Assignment question ids must be unique");
      }
      if (input.publish && (!input.questionIds.length || !input.questionItems?.length)) {
        throw new ApiError(400, "question_snapshot_required", "Published assignments need at least one complete question snapshot");
      }
      if (input.questionItems?.length) {
        const ids = new Set(input.questionIds);
        if (input.questionItems.length !== ids.size || new Set(input.questionItems.map((item) => item.id)).size !== ids.size
          || input.questionItems.some((item) => !ids.has(item.id))) {
          throw new ApiError(400, "question_snapshot_mismatch", "Question snapshots must match assignment question ids");
        }
      }
      const snapshot = JSON.stringify({
        targetType: input.targetType,
        targetId,
        questionIds: input.questionIds,
        questionItems: input.questionItems ?? [],
        knowledgePointKeys: input.knowledgePointKeys,
        target: input.target,
      });
      const status = input.publish ? "published" : "draft";
      const inserted = await tx.query<AssignmentRow>(
        `insert into assignments(
           id, class_id, created_by, title, instructions, due_at, status,
           revision, published_snapshot, published_at, created_at, updated_at
         ) values ($1, $2, $3, $4, $5, $6, $7, 1, $8::jsonb, $9, $10, $10)
         returning id, class_id, title, instructions, due_at, status, revision,
                   published_snapshot, created_at, updated_at`,
        [randomUUID(), classId, actor.userId, input.title.trim(), input.instructions,
          input.dueAt ? new Date(input.dueAt) : null, status, snapshot,
          input.publish ? now : null, now],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Assignment insert did not return a row");
      await tx.query(
        `insert into assignment_targets(id, assignment_id, class_id, group_id, membership_id)
         values ($1, $2, $3, $4, $5)`,
        [randomUUID(), row.id, classId, input.targetType === "group" ? targetId : null, input.targetType === "student" ? targetId : null],
      );
      const response = assignmentView(row);
      await appendAudit(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        action: input.publish ? "assignment.publish" : "assignment.create",
        resourceType: "assignment",
        resourceId: row.id,
        classId,
        result: "succeeded",
        beforeState: null,
        afterState: asJson(response),
        reason: null,
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return { statusCode: 201, body: asJson(response) };
    }));
    return result.body as unknown as AssignmentView;
  }

  async listAssignments(actor: Actor, classId: string): Promise<AssignmentListResponse> {
    const access = await this.classAccess(actor.userId, classId);
    assertAllowed(actor, "class.read", access);
    const result = actor.role === "student"
      ? await this.options.pool.query<AssignmentRow>(
        `select a.id, a.class_id, a.title, a.instructions, a.due_at, a.status,
                a.revision, a.published_snapshot, a.created_at, a.updated_at
           from assignments a
           join memberships m on m.class_id = a.class_id and m.user_id = $1 and m.status = 'active'
          where a.class_id = $2 and a.status = 'published'
            and exists (
              select 1 from assignment_targets t
               where t.assignment_id = a.id
                 and (t.group_id is null and t.membership_id is null
                      or t.membership_id = m.id or t.group_id = m.group_id)
            )
          order by a.updated_at desc limit 200`,
        [actor.userId, classId],
      )
      : await this.options.pool.query<AssignmentRow>(
        `select id, class_id, title, instructions, due_at, status, revision,
                published_snapshot, created_at, updated_at
           from assignments where class_id = $1 order by updated_at desc limit 200`,
        [classId],
      );
    return { items: result.rows.map(assignmentView) };
  }

  async submitAssignment(
    actor: Actor,
    assignmentId: string,
    input: SubmissionRequest,
    context: LearningMutationContext,
  ): Promise<SubmissionView> {
    if (actor.role !== "student") reject("resource_forbidden", "Only students can submit assignments");
    const now = this.now();
    const result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
      ...context.idempotency,
      actorId: actor.userId,
      expiresAt: apiExpiry(now),
    }, async () => {
      const assignment = await tx.query<{ id: string; class_id: string; status: AssignmentRow["status"]; membership_id: string; published_snapshot: Record<string, unknown> | null }>(
        `select a.id, a.class_id, a.status, a.published_snapshot, m.id as membership_id
           from assignments a
           join memberships m on m.class_id = a.class_id and m.user_id = $1 and m.status = 'active'
          where a.id = $2 and a.status = 'published'
            and exists (
              select 1 from assignment_targets t
               where t.assignment_id = a.id
                 and (t.group_id is null and t.membership_id is null
                      or t.membership_id = m.id or t.group_id = m.group_id)
            )`,
        [actor.userId, assignmentId],
      );
      const target = assignment.rows[0];
      if (!target) throw new ApiError(404, "assignment_not_found", "Assignment was not found");
      const published = parseSnapshot(target.published_snapshot);
      const questionIds = Array.isArray(published.questionIds)
        ? published.questionIds.filter((id): id is string => typeof id === "string") : [];
      const answerCheck = validateSubmissionAnswers(input.answers, questionIds);
      if (answerCheck.missingQuestionIds.length) {
        throw new ApiError(400, "assignment_incomplete", "Every assignment question needs an answer before submission");
      }
      // Serialize the first submission and later corrections for this member.
      // Locking only the latest submission would not protect the first insert,
      // because there is no row to lock yet.
      await tx.query("select id from memberships where id = $1 for update", [target.membership_id]);
      const prior = await tx.query<SubmissionRow>(
        `select id, assignment_id, client_entity_id, status, submitted_at, submission_version,
                previous_submission_id, answers, student_user_id
           from submissions where membership_id = $1 and assignment_id = $2
          order by submission_version desc limit 1 for update`,
        [target.membership_id, assignmentId],
      );
      const latest = prior.rows[0];
      if (latest?.client_entity_id === input.clientEntityId) return {
        statusCode: 201,
        body: asJson(submissionView(latest)),
      };
      if (latest && latest.status !== "returned") {
        throw new ApiError(409, "submission_already_active", "A new submission is allowed only after teacher return");
      }
      const version = (latest?.submission_version ?? 0) + 1;
      const inserted = await tx.query<SubmissionRow>(
        `insert into submissions(
           id, assignment_id, membership_id, student_user_id, client_entity_id,
           answers, status, submitted_at, created_at, submission_version, previous_submission_id
         ) values ($1, $2, $3, $4, $5, $6::jsonb, 'submitted', $7, $7, $8, $9)
         on conflict (membership_id, client_entity_id) do nothing
         returning id, assignment_id, client_entity_id, status, submitted_at, submission_version,
                   previous_submission_id, answers, student_user_id`,
        [randomUUID(), assignmentId, target.membership_id, actor.userId, input.clientEntityId,
          JSON.stringify(input.answers), now, version, latest?.id ?? null],
      );
      let submission = inserted.rows[0];
      if (!submission) {
        const existing = await tx.query<SubmissionRow>(
          `select id, assignment_id, client_entity_id, status, submitted_at,
                  submission_version, previous_submission_id, answers, student_user_id
             from submissions where membership_id = $1 and client_entity_id = $2`,
          [target.membership_id, input.clientEntityId],
        );
        submission = existing.rows[0];
      }
      if (!submission) throw new Error("Submission was not returned");
      if (submission.assignment_id !== assignmentId) {
        throw new ApiError(409, "client_entity_conflict", "Submission id was already used for another assignment");
      }
      await tx.query(
        `insert into review_cases(id, submission_id, class_id, status, revision, created_at, updated_at)
         values ($1, $2, $3, 'pending', 1, $4, $4)
         on conflict (submission_id) do nothing`,
        [randomUUID(), submission.id, target.class_id, now],
      );
      await appendAudit(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        action: "assignment.submission.create",
        resourceType: "submission",
        resourceId: submission.id,
        classId: target.class_id,
        result: "succeeded",
        beforeState: null,
        afterState: asJson(submissionView(submission)),
        reason: null,
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return { statusCode: 201, body: asJson(submissionView(submission)) };
    }));
    return result.body as unknown as SubmissionView;
  }

  async listReviewCases(actor: Actor, classId: string): Promise<ReviewCaseListResponse> {
    const access = await this.classAccess(actor.userId, classId);
    assertAllowed(actor, "report.read", access);
    const result = await this.options.pool.query<ReviewCaseRow>(
      `select rc.id, rc.submission_id, s.assignment_id, rc.class_id, rc.status,
              rc.current_score, rc.revision, s.submitted_at, rc.updated_at,
              u.display_name as student_display_name,
              s.answers, s.submission_version, previous.answers as previous_answers
         from review_cases rc
         join submissions s on s.id = rc.submission_id
         join users u on u.id = s.student_user_id
         join memberships m on m.id = s.membership_id
         left join submissions previous on previous.id = s.previous_submission_id
        where rc.class_id = $1 and rc.status = 'pending'
        order by rc.updated_at asc limit 200`,
      [classId],
    );
    return { items: result.rows.map(reviewView) };
  }

  async listOwnSubmissions(actor: Actor, assignmentId: string): Promise<SubmissionListResponse> {
    if (actor.role !== "student") reject("resource_forbidden", "Only students can read their submissions");
    const result = await this.options.pool.query<SubmissionRow>(
      `select s.id, s.assignment_id, s.client_entity_id, s.status, s.submitted_at,
              s.answers, s.student_user_id, s.submission_version, s.previous_submission_id,
              rc.status as review_status, rc.current_score,
              (select rd.reason from review_decisions rd where rd.review_id = rc.id
                order by rd.revision desc limit 1) as feedback
         from submissions s
         join assignments a on a.id = s.assignment_id
         join memberships m on m.id = s.membership_id and m.user_id = $1 and m.status = 'active'
         left join review_cases rc on rc.submission_id = s.id
        where a.id = $2 and s.student_user_id = $1
        order by s.submission_version asc limit 100`,
      [actor.userId, assignmentId],
    );
    return { items: result.rows.map(submissionView) };
  }

  async listOwnClassSubmissions(actor: Actor, classId: string): Promise<SubmissionListResponse> {
    if (actor.role !== "student") reject("resource_forbidden", "Only students can read their submissions");
    const access = await this.classAccess(actor.userId, classId);
    assertAllowed(actor, "class.read", access);
    const result = await this.options.pool.query<SubmissionRow>(
      `select s.id, s.assignment_id, s.client_entity_id, s.status, s.submitted_at,
              s.answers, s.student_user_id, s.submission_version, s.previous_submission_id,
              rc.status as review_status, rc.current_score,
              (select rd.reason from review_decisions rd where rd.review_id = rc.id
                order by rd.revision desc limit 1) as feedback
         from submissions s
         join assignments a on a.id = s.assignment_id
         join memberships m on m.id = s.membership_id and m.user_id = $1 and m.status = 'active'
         left join review_cases rc on rc.submission_id = s.id
        where a.class_id = $2 and s.student_user_id = $1
        order by s.submitted_at desc limit 500`,
      [actor.userId, classId],
    );
    return { items: result.rows.map(submissionView) };
  }

  async listClassSubmissions(actor: Actor, classId: string): Promise<SubmissionListResponse> {
    const access = await this.classAccess(actor.userId, classId);
    assertAllowed(actor, "report.read", access);
    const result = await this.options.pool.query<SubmissionRow>(
      `select s.id, s.assignment_id, s.client_entity_id, s.status, s.submitted_at,
              s.answers, s.student_user_id, u.display_name as student_display_name,
              s.submission_version, s.previous_submission_id, rc.status as review_status,
              rc.current_score,
              (select rd.reason from review_decisions rd where rd.review_id = rc.id
                order by rd.revision desc limit 1) as feedback
         from submissions s
         join assignments a on a.id = s.assignment_id
         join memberships m on m.id = s.membership_id
         join users u on u.id = s.student_user_id
         left join review_cases rc on rc.submission_id = s.id
        where a.class_id = $1
        order by s.submitted_at desc limit 500`,
      [classId],
    );
    return { items: result.rows.map(submissionView) };
  }

  async decideReviewCase(
    actor: Actor,
    reviewId: string,
    input: ReviewDecisionRequest,
    context: LearningMutationContext,
  ): Promise<ReviewCaseView> {
    const now = this.now();
    const result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
      ...context.idempotency,
      actorId: actor.userId,
      expiresAt: apiExpiry(now),
    }, async () => {
      const currentResult = await tx.query<ReviewCaseRow & { owner_teacher_id: string; class_status: ClassAccessRow["status"] }>(
        `select rc.id, rc.submission_id, s.assignment_id, rc.class_id, rc.status,
                rc.current_score, rc.revision, s.submitted_at, rc.updated_at,
                c.owner_teacher_id, c.status as class_status
           from review_cases rc
           join submissions s on s.id = rc.submission_id
           join classes c on c.id = rc.class_id
          where rc.id = $1 for update`,
        [reviewId],
      );
      const current = currentResult.rows[0];
      if (!current) throw new ApiError(404, "review_case_not_found", "Review case was not found");
      assertAllowed(actor, "review.decide", {
        id: current.class_id,
        owner_teacher_id: current.owner_teacher_id,
        status: current.class_status,
        active_member: false,
        membership_id: null,
      });
      requireActiveClass({
        id: current.class_id,
        owner_teacher_id: current.owner_teacher_id,
        status: current.class_status,
        active_member: false,
        membership_id: null,
      });
      if (current.status === "pending" && input.decision !== "approve" && input.decision !== "return" && input.decision !== "rejudge") {
        throw new ApiError(400, "validation_error", "Review decision is invalid");
      }
      const nextStatus = input.decision === "approve" ? "approved" : input.decision === "return" ? "returned" : "rejudged";
      const nextRevision = current.revision + 1;
      await tx.query(
        `insert into review_decisions(
           id, review_id, actor_id, revision, decision, previous_status, next_status,
           previous_score, next_score, per_question_scores, reason, annotation, created_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::jsonb, $13)`,
        [randomUUID(), reviewId, actor.userId, nextRevision, input.decision, current.status,
          nextStatus, current.current_score === null ? null : Number(current.current_score),
          input.score, JSON.stringify(input.perQuestionScores), input.reason.trim(),
          JSON.stringify(input.annotation), now],
      );
      const updated = await tx.query<ReviewCaseRow>(
        `update review_cases
            set status = $2, current_score = $3, current_per_question_scores = $4::jsonb,
                revision = $5, updated_at = $6
          where id = $1
        returning id, submission_id, $7::uuid as assignment_id, class_id, status,
                  current_score, revision,
                  (select submitted_at from submissions where id = submission_id) as submitted_at,
                  updated_at`,
        [reviewId, nextStatus, input.score, JSON.stringify(input.perQuestionScores), nextRevision, now, current.assignment_id],
      );
      const row = updated.rows[0];
      if (!row) throw new Error("Review update did not return a row");
      await tx.query(
        `update submissions set status = $2 where id = $1`,
        [current.submission_id, input.decision === "return" ? "returned" : "accepted"],
      );
      const response = reviewView(row);
      await appendAudit(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        action: "review.decide",
        resourceType: "reviewCase",
        resourceId: reviewId,
        classId: current.class_id,
        result: "succeeded",
        beforeState: asJson(reviewView(current)),
        afterState: asJson(response),
        reason: input.reason,
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return { statusCode: 200, body: asJson(response) };
    }));
    return result.body as unknown as ReviewCaseView;
  }

  async classLearningSummary(actor: Actor, classId: string): Promise<ClassLearningSummary> {
    const access = await this.classAccess(actor.userId, classId);
    assertAllowed(actor, "report.read", access);
    const result = await this.options.pool.query<{
      membership_id: string;
      student_user_id: string;
      display_name: string;
      profile_id: string | null;
      attempt_count: string | number;
      exam_count: string | number;
      pending_review_count: string | number;
      last_evidence_at: Date | null;
    }>(
      `select m.id as membership_id, m.user_id as student_user_id, u.display_name,
              sp.id as profile_id,
              coalesce((select count(*) from attempts a where a.owner_user_id = m.user_id and a.profile_id = sp.id), 0) as attempt_count,
              coalesce((select count(*) from exam_records e where e.owner_user_id = m.user_id and e.profile_id = sp.id), 0) as exam_count,
              coalesce((select count(*) from review_cases rc join submissions s on s.id = rc.submission_id
                         where rc.class_id = m.class_id and s.student_user_id = m.user_id and rc.status = 'pending'), 0) as pending_review_count,
              greatest(
                (select max(a.completed_at) from attempts a where a.owner_user_id = m.user_id and a.profile_id = sp.id),
                (select max(e.created_at) from exam_records e where e.owner_user_id = m.user_id and e.profile_id = sp.id)
              ) as last_evidence_at
         from memberships m
         join users u on u.id = m.user_id
         left join student_profiles sp on sp.user_id = m.user_id
        where m.class_id = $1 and m.member_role = 'student' and m.status = 'active'
        order by m.id limit 200`,
      [classId],
    );
    return {
      classId,
      items: result.rows.map((row) => ({
        membershipId: row.membership_id,
        studentUserId: row.student_user_id,
        displayName: row.display_name,
        profileId: row.profile_id,
        attemptCount: Number(row.attempt_count),
        examCount: Number(row.exam_count),
        pendingReviewCount: Number(row.pending_review_count),
        lastEvidenceAt: row.last_evidence_at?.toISOString() ?? null,
      })),
    };
  }

  private async profileForClass(
    actor: Actor,
    classId: string,
    clientEntityId: string,
  ): Promise<ProfileRow> {
    const access = await this.classAccess(actor.userId, classId);
    const result = await this.options.pool.query<ProfileRow>(
      `select sp.id, sp.user_id, sp.client_entity_id, sp.display_name, sp.grade, sp.curriculum_version
         from student_profiles sp
         join memberships m on m.user_id = sp.user_id and m.class_id = $1
        where sp.client_entity_id = $2 and m.member_role = 'student' and m.status = 'active'
          and ($3 = sp.user_id or $4 = true)`,
      [classId, clientEntityId, actor.userId,
        (actor.role !== "parent" && access.owner_teacher_id === actor.userId) || actor.role === "administrator"],
    );
    const profile = result.rows[0];
    if (!profile) throw new ApiError(404, "profile_not_found", "Student profile was not found in this class");
    if (actor.role === "student"
      && profile.user_id !== actor.userId
      && access.owner_teacher_id !== actor.userId) {
      reject("resource_forbidden", "A student can only access their own profile");
    }
    if (actor.role !== "student") assertAllowed(actor, "report.read", access);
    return profile;
  }

  async saveReportSnapshot(
    actor: Actor,
    classId: string,
    input: ReportSnapshotRequest,
    context: LearningMutationContext,
  ): Promise<ReportSnapshotView> {
    const profile = await this.profileForClass(actor, classId, input.profileClientEntityId);
    const access = await this.classAccess(actor.userId, classId);
    if (actor.role === "student") this.assertStudentMember(actor, access);
    const now = this.now();
    const result = await withTransaction(this.options.pool, async (tx) => executeIdempotently(tx, {
      ...context.idempotency,
      actorId: actor.userId,
      expiresAt: apiExpiry(now),
    }, async () => {
      const current = await tx.query<{ revision: number }>(
        `select revision from sync_entity_heads
          where scope_type = 'user' and scope_id = $1 and entity_type = 'learning_report' and entity_id = $2
          for update`,
        [profile.user_id, input.clientEntityId],
      );
      const baseRevision = input.baseRevision ?? 0;
      if (current.rows[0] && current.rows[0].revision > baseRevision) {
        throw new ApiError(409, "sync_conflict", "A newer report snapshot already exists; teacher review is required");
      }
      const revision = (current.rows[0]?.revision ?? 0) + 1;
      const payload = JSON.stringify(input.snapshot);
      const payloadHash = createHash("sha256").update(payload, "utf8").digest();
      await tx.query(
        `insert into sync_entity_heads(
           scope_type, scope_id, entity_type, entity_id, owner_user_id,
           revision, payload, payload_hash, deleted_at, updated_at
         ) values ('user', $1, 'learning_report', $2, $1, $3, $4::jsonb, $5, null, $6)
         on conflict (scope_type, scope_id, entity_type, entity_id) do update
            set revision = excluded.revision, payload = excluded.payload,
                payload_hash = excluded.payload_hash, deleted_at = null, updated_at = excluded.updated_at`,
        [profile.user_id, input.clientEntityId, revision, payload, payloadHash, now],
      );
      const response: ReportSnapshotView = {
        clientEntityId: input.clientEntityId,
        profileId: profile.id,
        revision,
        snapshot: input.snapshot,
        updatedAt: now.toISOString(),
      };
      await appendAudit(tx, {
        actorId: actor.userId,
        actorRole: actor.role,
        action: "learning.report.snapshot",
        resourceType: "learningReport",
        resourceId: input.clientEntityId,
        classId,
        result: "succeeded",
        beforeState: null,
        afterState: asJson(response),
        reason: null,
        requestId: context.requestId,
        ipHash: hashAuditIp(this.options.auditIpKey, context.ip),
      });
      return { statusCode: 200, body: asJson(response) };
    }));
    return result.body as unknown as ReportSnapshotView;
  }

  async listReportSnapshots(
    actor: Actor,
    classId: string,
    profileClientEntityId: string,
  ): Promise<ReportSnapshotListResponse> {
    const profile = await this.profileForClass(actor, classId, profileClientEntityId);
    const result = await this.options.pool.query<SnapshotRow>(
      `select h.entity_id, h.scope_id, h.revision, h.payload, h.updated_at, sp.id as profile_id
         from sync_entity_heads h
         join student_profiles sp on sp.user_id = h.scope_id
        where h.scope_type = 'user' and h.scope_id = $1 and h.entity_type = 'learning_report'
          and h.deleted_at is null
        order by h.updated_at desc limit 100`,
      [profile.user_id],
    );
    return {
      items: result.rows.map((row) => ({
        clientEntityId: row.entity_id,
        profileId: row.profile_id,
        revision: row.revision,
        snapshot: row.payload,
        updatedAt: row.updated_at.toISOString(),
      })),
    };
  }
}

export function createLearningService(options: LearningServiceOptions): LearningService {
  return new LearningService(options);
}
