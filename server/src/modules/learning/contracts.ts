import { Type, type Static } from "@sinclair/typebox";

import { StrictObject } from "../../common/schema.js";
import { UuidSchema } from "../classes/contracts.js";

const DateTimeSchema = Type.String({ format: "date-time", minLength: 20, maxLength: 64 });
const DateSchema = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const ClientEntityIdSchema = Type.String({
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$",
});
const DeviceIdSchema = Type.String({ pattern: "^[0-9a-f]{64}$" });
const JsonObjectSchema = Type.Record(Type.String({ minLength: 1, maxLength: 120 }), Type.Unknown());
const JsonArraySchema = Type.Array(Type.Unknown(), { maxItems: 2_000 });

export const ClassLearningParamsSchema = StrictObject({ classId: UuidSchema });
export const AssignmentParamsSchema = StrictObject({ assignmentId: UuidSchema });
export const ReviewCaseParamsSchema = StrictObject({ reviewId: UuidSchema });

const VariantRoleSchema = Type.Union([
  Type.Literal("near"),
  Type.Literal("far"),
  Type.Literal("counter"),
  // Accepted for v3.4.1 clients; new clients normalize these to far.
  Type.Literal("reverse"),
  Type.Literal("context"),
]);

export const ProfileSyncSchema = StrictObject({
  clientEntityId: ClientEntityIdSchema,
  displayName: Type.String({ minLength: 1, maxLength: 80 }),
  grade: Type.String({ minLength: 1, maxLength: 40 }),
  curriculumVersion: Type.String({ minLength: 1, maxLength: 80 }),
});

export const LearningAttemptSyncSchema = StrictObject({
  clientEntityId: ClientEntityIdSchema,
  profileClientEntityId: ClientEntityIdSchema,
  questionId: ClientEntityIdSchema,
  sessionClientId: ClientEntityIdSchema,
  knowledgePointIds: Type.Array(ClientEntityIdSchema, { maxItems: 100 }),
  questionType: Type.Union([
    Type.Literal("choice"),
    Type.Literal("numeric"),
    Type.Literal("shortAnswer"),
    Type.Literal("proof"),
    Type.Literal("experiment"),
    Type.Literal("modeling"),
  ]),
  modelFamilyId: Type.Optional(Type.Union([ClientEntityIdSchema, Type.Null()])),
  variantRole: Type.Union([
    Type.Literal("diagnostic"),
    Type.Literal("core"),
    Type.Literal("near"),
    Type.Literal("reverse"),
    Type.Literal("context"),
    Type.Literal("far"),
    Type.Literal("counter"),
    Type.Literal("review"),
  ]),
  difficulty: Type.String({ minLength: 1, maxLength: 40 }),
  startedAt: DateTimeSchema,
  completedAt: DateTimeSchema,
  activeDurationSeconds: Type.Integer({ minimum: 0, maximum: 86_400 }),
  hintViewCount: Type.Integer({ minimum: 0, maximum: 100 }),
  maxHintLevel: Type.Integer({ minimum: 0, maximum: 5 }),
  confidenceBefore: Type.Optional(Type.Union([Type.Integer({ minimum: 1, maximum: 5 }), Type.Null()])),
  confidenceAfter: Type.Optional(Type.Union([Type.Integer({ minimum: 1, maximum: 5 }), Type.Null()])),
  finalAnswer: Type.String({ maxLength: 30_000 }),
  gradingStatus: Type.Union([
    Type.Literal("pending"),
    Type.Literal("correct"),
    Type.Literal("partial"),
    Type.Literal("incorrect"),
  ]),
  score: Type.Optional(Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()])),
  verificationIssues: Type.Array(Type.Unknown(), { maxItems: 100 }),
  primaryErrorType: Type.Optional(Type.Union([Type.String({ maxLength: 80 }), Type.Null()])),
  secondaryErrorTypes: Type.Array(Type.String({ maxLength: 80 }), { maxItems: 20 }),
  reflection: Type.String({ maxLength: 10_000 }),
  selfExplanation: Type.String({ maxLength: 10_000 }),
  modelEvidence: JsonObjectSchema,
  modelScore: Type.Optional(Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()])),
  teacherReviewStatus: Type.Union([
    Type.Literal("notRequired"),
    Type.Literal("pending"),
    Type.Literal("approved"),
    Type.Literal("returned"),
  ]),
});

export const SyncLearningRequestSchema = StrictObject({
  deviceId: DeviceIdSchema,
  clientEventId: Type.Optional(UuidSchema),
  baseRevision: Type.Optional(Type.Integer({ minimum: 0 })),
  clientCreatedAt: Type.Optional(DateTimeSchema),
  profile: ProfileSyncSchema,
  attempts: Type.Array(LearningAttemptSyncSchema, { maxItems: 100 }),
});

export const VariantQuestionSyncSchema = StrictObject({
  id: ClientEntityIdSchema,
  variantRole: VariantRoleSchema,
  variantTechnique: Type.Optional(Type.Union([
    Type.Literal("parameter"),
    Type.Literal("condition"),
    Type.Literal("reverse"),
    Type.Literal("representation"),
    Type.Literal("context"),
    Type.Literal("counterexample"),
  ])),
  title: Type.String({ minLength: 1, maxLength: 240 }),
  content: Type.String({ minLength: 12, maxLength: 60_000 }),
  options: Type.Array(JsonObjectSchema, { maxItems: 12 }),
  stage: Type.Union([Type.Literal("初中"), Type.Literal("高中")]),
  grade: Type.String({ minLength: 1, maxLength: 40 }),
  topic: Type.String({ minLength: 1, maxLength: 160 }),
  knowledgePointId: ClientEntityIdSchema,
  questionType: Type.String({ minLength: 1, maxLength: 80 }),
  difficulty: Type.Union([Type.Literal("基础"), Type.Literal("进阶"), Type.Literal("挑战")]),
  changeSummary: Type.String({ minLength: 1, maxLength: 2_000 }),
  relationToParent: Type.String({ minLength: 1, maxLength: 2_000 }),
  answer: Type.String({ minLength: 1, maxLength: 30_000 }),
  solution: Type.String({ minLength: 20, maxLength: 60_000 }),
  solutionDetail: JsonObjectSchema,
  validation: JsonObjectSchema,
  source: Type.Union([Type.Literal("应用内 AI 生成变式"), Type.Literal("应用内已审核题模变式")]),
  approvalStatus: Type.Union([Type.Literal("teacher-approved"), Type.Literal("system-validated")]),
});

export const VariantSetSyncItemSchema = StrictObject({
  clientEntityId: ClientEntityIdSchema,
  parentQuestionId: ClientEntityIdSchema,
  sourceContentHash: Type.String({ pattern: "^[0-9a-f]{16}$" }),
  cacheKey: Type.String({ minLength: 8, maxLength: 600 }),
  specVersion: Type.Literal("variant_generation_v1"),
  generatorVersion: Type.String({ minLength: 1, maxLength: 40 }),
  status: Type.Literal("approved"),
  variants: Type.Array(VariantQuestionSyncSchema, { minItems: 2, maxItems: 3 }),
  updatedAt: DateTimeSchema,
});

export const SyncVariantSetsRequestSchema = StrictObject({
  deviceId: DeviceIdSchema,
  clientEventId: Type.Optional(UuidSchema),
  sets: Type.Array(VariantSetSyncItemSchema, { minItems: 1, maxItems: 20 }),
});

export const VariantSetViewSchema = StrictObject({
  clientEntityId: ClientEntityIdSchema,
  classId: UuidSchema,
  parentQuestionId: ClientEntityIdSchema,
  sourceContentHash: Type.String({ pattern: "^[0-9a-f]{16}$" }),
  cacheKey: Type.String({ minLength: 8, maxLength: 600 }),
  specVersion: Type.String({ minLength: 1, maxLength: 80 }),
  generatorVersion: Type.String({ minLength: 1, maxLength: 40 }),
  status: Type.Literal("approved"),
  variants: Type.Array(VariantQuestionSyncSchema, { minItems: 2, maxItems: 3 }),
  updatedAt: DateTimeSchema,
});

export const VariantSetSyncResponseSchema = StrictObject({
  accepted: Type.Integer({ minimum: 0 }),
  duplicates: Type.Integer({ minimum: 0 }),
  items: Type.Array(VariantSetViewSchema, { maxItems: 20 }),
});

export const VariantSetListResponseSchema = StrictObject({
  items: Type.Array(VariantSetViewSchema, { maxItems: 500 }),
});

export const ExamRecordSyncSchema = StrictObject({
  clientEntityId: ClientEntityIdSchema,
  profileClientEntityId: ClientEntityIdSchema,
  examName: Type.String({ minLength: 1, maxLength: 160 }),
  occurredOn: DateSchema,
  score: Type.Number({ minimum: 0 }),
  maxScore: Type.Number({ exclusiveMinimum: 0 }),
  knowledgePointScores: JsonArraySchema,
});

export const SyncExamRecordsRequestSchema = StrictObject({
  deviceId: DeviceIdSchema,
  clientEventId: Type.Optional(UuidSchema),
  baseRevision: Type.Optional(Type.Integer({ minimum: 0 })),
  clientCreatedAt: Type.Optional(DateTimeSchema),
  profile: ProfileSyncSchema,
  records: Type.Array(ExamRecordSyncSchema, { maxItems: 100 }),
});

export const AssignmentRequestSchema = StrictObject({
  title: Type.String({ minLength: 1, maxLength: 160 }),
  instructions: Type.String({ maxLength: 30_000 }),
  dueAt: Type.Optional(Type.Union([DateTimeSchema, Type.Null()])),
  targetType: Type.Union([Type.Literal("class"), Type.Literal("group"), Type.Literal("student")]),
  targetId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
  questionIds: Type.Array(ClientEntityIdSchema, { maxItems: 100 }),
  knowledgePointKeys: Type.Array(ClientEntityIdSchema, { maxItems: 100 }),
  target: Type.String({ minLength: 1, maxLength: 1_000 }),
  publish: Type.Optional(Type.Boolean()),
});

export const SubmissionRequestSchema = StrictObject({
  clientEntityId: ClientEntityIdSchema,
  answers: JsonArraySchema,
});

export const ReviewDecisionRequestSchema = StrictObject({
  decision: Type.Union([Type.Literal("approve"), Type.Literal("return"), Type.Literal("rejudge")]),
  score: Type.Number({ minimum: 0, maximum: 100 }),
  perQuestionScores: JsonArraySchema,
  reason: Type.String({ minLength: 1, maxLength: 1_000 }),
  annotation: JsonObjectSchema,
});

export const ReportSnapshotRequestSchema = StrictObject({
  clientEntityId: ClientEntityIdSchema,
  profileClientEntityId: ClientEntityIdSchema,
  baseRevision: Type.Optional(Type.Integer({ minimum: 0 })),
  snapshot: JsonObjectSchema,
});

export const LearningSyncResponseSchema = StrictObject({
  profileId: UuidSchema,
  accepted: Type.Integer({ minimum: 0 }),
  duplicates: Type.Integer({ minimum: 0 }),
  conflicts: Type.Array(Type.String({ maxLength: 200 }), { maxItems: 100 }),
  lastAcceptedAt: Type.Union([DateTimeSchema, Type.Null()]),
});

export const ExamSyncResponseSchema = StrictObject({
  profileId: UuidSchema,
  accepted: Type.Integer({ minimum: 0 }),
  duplicates: Type.Integer({ minimum: 0 }),
  conflicts: Type.Array(Type.String({ maxLength: 200 }), { maxItems: 100 }),
});

export const AssignmentViewSchema = StrictObject({
  id: UuidSchema,
  classId: UuidSchema,
  title: Type.String({ minLength: 1, maxLength: 160 }),
  instructions: Type.String({ maxLength: 30_000 }),
  dueAt: Type.Union([DateTimeSchema, Type.Null()]),
  status: Type.Union([Type.Literal("draft"), Type.Literal("published"), Type.Literal("closed")]),
  revision: Type.Integer({ minimum: 1 }),
  targetType: Type.Union([Type.Literal("class"), Type.Literal("group"), Type.Literal("student")]),
  targetId: Type.Union([UuidSchema, Type.Null()]),
  questionIds: Type.Array(ClientEntityIdSchema, { maxItems: 100 }),
  knowledgePointKeys: Type.Array(ClientEntityIdSchema, { maxItems: 100 }),
  target: Type.String({ maxLength: 1_000 }),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const AssignmentListResponseSchema = StrictObject({
  items: Type.Array(AssignmentViewSchema, { maxItems: 200 }),
});

export const SubmissionViewSchema = StrictObject({
  id: UuidSchema,
  assignmentId: UuidSchema,
  clientEntityId: ClientEntityIdSchema,
  status: Type.Union([Type.Literal("submitted"), Type.Literal("underReview"), Type.Literal("returned"), Type.Literal("accepted")]),
  submittedAt: DateTimeSchema,
});

export const ReviewCaseViewSchema = StrictObject({
  id: UuidSchema,
  submissionId: UuidSchema,
  assignmentId: UuidSchema,
  classId: UuidSchema,
  status: Type.Union([Type.Literal("pending"), Type.Literal("approved"), Type.Literal("returned"), Type.Literal("rejudged")]),
  currentScore: Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()]),
  revision: Type.Integer({ minimum: 1 }),
  submittedAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export const ReviewCaseListResponseSchema = StrictObject({
  items: Type.Array(ReviewCaseViewSchema, { maxItems: 200 }),
});

export const ClassLearningSummarySchema = StrictObject({
  classId: UuidSchema,
  items: Type.Array(StrictObject({
    membershipId: UuidSchema,
    studentUserId: UuidSchema,
    displayName: Type.String({ minLength: 1, maxLength: 80 }),
    profileId: Type.Union([UuidSchema, Type.Null()]),
    attemptCount: Type.Integer({ minimum: 0 }),
    examCount: Type.Integer({ minimum: 0 }),
    pendingReviewCount: Type.Integer({ minimum: 0 }),
    lastEvidenceAt: Type.Union([DateTimeSchema, Type.Null()]),
  }), { maxItems: 200 }),
});

export const ReportSnapshotViewSchema = StrictObject({
  clientEntityId: ClientEntityIdSchema,
  profileId: UuidSchema,
  revision: Type.Integer({ minimum: 1 }),
  snapshot: JsonObjectSchema,
  updatedAt: DateTimeSchema,
});

export const ReportSnapshotListResponseSchema = StrictObject({
  items: Type.Array(ReportSnapshotViewSchema, { maxItems: 100 }),
});

export type ClassLearningParams = Static<typeof ClassLearningParamsSchema>;
export type AssignmentParams = Static<typeof AssignmentParamsSchema>;
export type ReviewCaseParams = Static<typeof ReviewCaseParamsSchema>;
export type SyncLearningRequest = Static<typeof SyncLearningRequestSchema>;
export type SyncVariantSetsRequest = Static<typeof SyncVariantSetsRequestSchema>;
export type VariantSetSyncResponse = Static<typeof VariantSetSyncResponseSchema>;
export type VariantSetListResponse = Static<typeof VariantSetListResponseSchema>;
export type VariantSetView = Static<typeof VariantSetViewSchema>;
export type SyncExamRecordsRequest = Static<typeof SyncExamRecordsRequestSchema>;
export type LearningSyncResponse = Static<typeof LearningSyncResponseSchema>;
export type ExamSyncResponse = Static<typeof ExamSyncResponseSchema>;
export type AssignmentRequest = Static<typeof AssignmentRequestSchema>;
export type SubmissionRequest = Static<typeof SubmissionRequestSchema>;
export type ReviewDecisionRequest = Static<typeof ReviewDecisionRequestSchema>;
export type ReportSnapshotRequest = Static<typeof ReportSnapshotRequestSchema>;
export type AssignmentView = Static<typeof AssignmentViewSchema>;
export type AssignmentListResponse = Static<typeof AssignmentListResponseSchema>;
export type SubmissionView = Static<typeof SubmissionViewSchema>;
export type ReviewCaseView = Static<typeof ReviewCaseViewSchema>;
export type ReviewCaseListResponse = Static<typeof ReviewCaseListResponseSchema>;
export type ClassLearningSummary = Static<typeof ClassLearningSummarySchema>;
export type ReportSnapshotView = Static<typeof ReportSnapshotViewSchema>;
export type ReportSnapshotListResponse = Static<typeof ReportSnapshotListResponseSchema>;
