# School Sync Backend v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side v1 account, class, synchronization, assignment, review, upload, feedback, and report backend while preserving the existing AI gateway as an isolated service.

**Architecture:** Add a horizontally scalable TypeScript modular monolith beside the existing `physics-ai-gateway.mjs`. PostgreSQL is the source of truth, Redis supplies shared rate limits, positive session state, and BullMQ coordination, and an S3-compatible object store holds verified artifacts; database writes that must be observed asynchronously use a transactional outbox. Synchronization uses strict entity-specific schemas, an inbound event journal, optimistic revisions, tombstones, and a per-recipient durable outbox so authorization changes cannot leak or skip data.

**Tech Stack:** Node.js 24.15.0, TypeScript 7.0.2, pnpm 11.18.0, Fastify 5.11.0, TypeBox 0.34.52, PostgreSQL 17, Redis 7.4, BullMQ 6.0.2, AWS SDK for JavaScript v3, Nodemailer 9.0.3, Prometheus client 15.1.3, Vitest 4.1.10, Testcontainers 12.0.4, Docker Compose.

## Global Constraints

- Scope is server-only. Client integration and capacity/load testing are not implemented by this plan.
- The target protocol is service protocol v1 under `/v1`; health and metrics routes are deliberately unversioned.
- The first release is a horizontally scalable modular monolith, not a microservice split.
- PostgreSQL is the authority for accounts, classes, assignments, reviews, learning evidence, job state, and audit records.
- Redis is shared infrastructure for rate limits, positive session state, revocation propagation, and BullMQ coordination; authenticated requests fail closed when session state cannot be verified.
- Optional `schoolLabel` is descriptive text on a class and is never a school identity, tenant boundary, or login credential.
- Membership is the online authorization fact. A client-provided `classId`, `groupId`, role string, `actorId`, or `deviceId` never grants access.
- Passwords use Argon2id with `memoryCost=65536`, `timeCost=3`, and `parallelism=1`; plaintext and reversible passwords are forbidden.
- Access tokens expire after 900 seconds. Refresh tokens expire after 2,592,000 seconds, rotate on every successful refresh, and reuse revokes the complete token family.
- Access tokens are sent only as `Authorization: Bearer <accessToken>`. Native clients save refresh tokens in platform secure storage; the server never returns them in cookies, URLs, logs, or error bodies.
- Login is limited to 5 attempts/15 minutes per IP plus normalized login, refresh to 30/15 minutes per IP plus token family, invitation join to 10/15 minutes per IP plus code hash, and reauthentication to 5/15 minutes per user plus IP. Every `POST`, `PATCH`, and `DELETE` route requires an `Idempotency-Key` header of 16-128 visible ASCII characters except `/v1/auth/login`, `/v1/auth/refresh`, and `/v1/auth/reauthenticate`. Logout, invite join, account lifecycle, upload, feedback, privacy, assignment, review, and sync push are not exceptions. The same key and canonical request digest must return the original status/body; the same key with a different digest returns `409 idempotency_mismatch`.
- General JSON request bodies are capped at 1 MiB. `POST /v1/sync/push` has a stricter 900 KiB (921,600-byte) wire-body cap, contains 1-100 events, and each serialized event payload is at most 64 KiB. The client forms a dynamic batch by adding events in order until either 100 events or the 900 KiB serialized-request cap would be exceeded; it never splits one event. Sync pull/bootstrap responses are also capped at 900 KiB and return the largest ordered prefix that fits both the byte cap and the 200-change/item cap.
- Sync evidence entities are append-only. Revisioned entities use optimistic concurrency. Deletion produces a tombstone retained for 180 days; once the recipient's exclusive lower watermark is greater than zero, a cursor at or below it returns `409 cursor_expired` and requires an authorized, paginated bootstrap. Bootstrap fixes a recipient-specific outbox cutoff before scanning current authorized state, so changes committed during bootstrap are subsequently pulled and no gap is possible.
- Teacher decisions outrank student temporary state. Students cannot overwrite published assignments, teacher comments, review decisions, or audit records.
- All external deployment traffic uses HTTPS. Secrets live only in server environment variables or a secret manager and are redacted from logs.
- Signed upload URLs expire after 600 seconds. Objects remain unusable until size, declared MIME, checksum, and detected file signature pass server-side verification.
- Feedback is sent only to `luo865265@gmail.com`. Queued, retrying, sent, and failed are distinct states; the API never reports `sent` before the SMTP worker records success.
- Existing `server/physics-ai-gateway.mjs` keeps its current paths, model allowlist, token, CORS policy, limits, and process boundary. The business API does not import it and does not receive `OPENAI_API_KEY`.
- Student learning evidence is stored once in user scope. For every active class membership, the same committed evidence change is projected into that class owner's recipient outbox with the class ID recorded on the projection; it is never duplicated in domain tables. Assignment submissions and corrections remain membership-scoped. Membership removal or sharing withdrawal stops future projections without deleting the student's own evidence.
- Accounts created in bulk use one-time temporary credentials, require a password change before business access, and never store or re-display plaintext credentials. Disabled accounts cannot log in, refresh, pull, or receive new projections. Recovery in v1 is an audited administrator reset to a new one-time credential; security questions and unauthenticated email recovery are out of scope.
- Self-service cloud export, deletion request, class-sharing withdrawal, and guardian-link withdrawal are explicit authenticated workflows. Account deletion disables access immediately, observes a documented grace period, then deletes or irreversibly pseudonymizes data according to the table-level retention policy; it is never represented as synchronous hard deletion.
- Published assignments pin immutable, versioned question-content snapshots. Prompt visibility and solution/analysis visibility are separate; answers and analyses follow the assignment's explicit release policy and are never included in a student pull before that policy is satisfied.
- `GET /health/live`, `GET /health/ready`, and protected/internal `GET /metrics` are stable observability contracts. Capacity claims remain unverified until a separate production-equivalent load plan passes.
- All timestamps are UTC RFC 3339 strings at the API boundary and `timestamptz` in PostgreSQL. `eventId` and server-owned resource IDs are lowercase canonical UUIDs. `PushEvent.entityId` and local payload references use the existing client-stable ID format `^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$`; legacy values such as `attempt-2025-001` and `profile-local-001` must not be remapped or discarded.
- `LoginRequest.deviceId` is the existing activation/device fingerprint: exactly 64 hexadecimal characters. The API accepts upper- or lowercase input, normalizes it to lowercase before persistence and session comparison, and never interprets it as a UUID or an authorization fact.
- Every database migration has an explicit down migration, runs in a transaction, and is tested from an empty database and through one rollback/reapply cycle.
- Tests follow red-green-refactor. Unit tests do not require Docker; integration tests use isolated PostgreSQL, Redis, and MinIO containers and never contact OpenAI or a real SMTP server.

---

## Scope Boundaries and Design Basis

The transactional outbox prevents a committed PostgreSQL change from being lost between the request transaction and Redis queue publication. Per-recipient sync outbox rows make authorization and pagination deterministic: a user only reads rows materialized for that user, and a new membership can receive a bounded bootstrap without rewinding a global cursor. Refresh-token rotation plus family revocation detects replay while the short-lived access token limits exposure; positive Redis session keys make logout effective immediately and fail safely after Redis data loss.

This plan deliberately does not add school SSO, microservices, client storage changes, production deployment, backup/restore automation, or load scripts. It creates the server capabilities and observability needed by later client and capacity plans.

## Immutable Client Contracts

All objects below are strict: unknown properties cause `400 validation_error`.

```ts
export type UserRole = "student" | "teacher" | "parent" | "administrator";

export interface AuthUser {
  id: string;
  role: UserRole;
  displayName: string;
  status: "active" | "disabled";
  mustChangePassword: boolean;
  deletionPending: boolean;
}

export interface LoginRequest {
  login: string;
  password: string;
  deviceId: string;
  deviceName: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
```

- `POST /v1/auth/login` accepts `LoginRequest` and returns exactly `{accessToken,refreshToken,user}`.
- `POST /v1/auth/refresh` accepts exactly `{refreshToken}` and rotates the token, returning exactly `{accessToken,refreshToken,user}`.
- `POST /v1/auth/logout` accepts exactly `{refreshToken}` and returns `204`.
- `POST /v1/auth/change-password` accepts exactly `{currentPassword,newPassword}` and returns exactly `{user}`. An account with `mustChangePassword=true` may authenticate only to this route, refresh, and logout until the change succeeds; a successful change revokes all prior refresh families and issues no token in the response, so the client logs in again.
- Authenticated routes require `Authorization: Bearer <accessToken>`.
- Unless explicitly exempted in Global Constraints, a mutable request also requires `Idempotency-Key`; the API exposes `Access-Control-Allow-Headers: Authorization, Content-Type, Idempotency-Key` only for an exact allowed origin.

```ts
export type SyncOperation = "create" | "update" | "delete";
export type ClientStableId = string;
export type PushEntityType =
  | "studentProfile"
  | "attempt"
  | "hintEvent"
  | "transferAttempt"
  | "correction"
  | "reviewSchedule"
  | "examRecord"
  | "submission";

export interface PushEvent {
  eventId: string;
  entityType: PushEntityType;
  entityId: ClientStableId;
  operation: SyncOperation;
  baseRevision: number;
  payload: StudentProfilePayload | AttemptPayload | HintEventPayload | TransferAttemptPayload | CorrectionPayload | ReviewSchedulePayload | ExamRecordPayload | SubmissionPayload | TombstonePayload;
  idempotencyKey: string;
  createdAt: string;
}

export interface SyncPushRequest {
  cursor: string | null;
  events: PushEvent[];
}

export interface SyncConflictBase {
  eventId: string;
  entityId: string;
  code: "revision_conflict" | "forbidden_transition" | "idempotency_mismatch" | "correction_history_limit_reached";
  serverRevision: number;
}

export type RevisionedConflictPayload<T> =
  | { serverPayload: T | TombstonePayload; serverPayloadOmitted: false; serverPayloadSha256: null }
  | { serverPayload: null; serverPayloadOmitted: true; serverPayloadSha256: string }
  | { serverPayload: null; serverPayloadOmitted: false; serverPayloadSha256: null };

export type RevisionedSyncConflict =
  | (SyncConflictBase & { entityType: "studentProfile" } & RevisionedConflictPayload<StudentProfilePayload>)
  | (SyncConflictBase & { entityType: "reviewSchedule" } & RevisionedConflictPayload<ReviewSchedulePayload>);

export type AppendOnlyPushEntityType = Exclude<PushEntityType, "studentProfile" | "reviewSchedule">;
export type AppendOnlySyncConflict = SyncConflictBase & {
  entityType: AppendOnlyPushEntityType;
  serverPayload: null;
  serverPayloadOmitted: true;
  serverPayloadSha256: null;
};

export type SyncConflict = RevisionedSyncConflict | AppendOnlySyncConflict;

export interface SyncPushResponse {
  acceptedEventIds: string[];
  conflicts: SyncConflict[];
  cursor: string;
}

export interface PushEntityChange {
  changeId: string;
  eventId: string;
  entityType: PushEntityType;
  entityId: string;
  projectionClassId: string | null;
  operation: SyncOperation;
  revision: number;
  payload: StudentProfilePayload | AttemptPayload | HintEventPayload | TransferAttemptPayload | CorrectionPayload | ReviewSchedulePayload | ExamRecordPayload | SubmissionPayload | TombstonePayload;
  occurredAt: string;
}

export interface MembershipChangePayload {
  membershipId: string;
  classId: string;
  className: string;
  groupId: string | null;
  groupName: string | null;
  memberRole: "student" | "teacher";
  status: "pending" | "active" | "removed";
  studentNumber: string | null;
  updatedAt: string;
}

export type PhysicsFormulaAstV1 =
  | { type: "row"; children: PhysicsFormulaAstV1[] }
  | { type: "identifier" | "number" | "operator" | "text"; value: string }
  | { type: "fraction"; numerator: PhysicsFormulaAstV1; denominator: PhysicsFormulaAstV1 }
  | { type: "superscript"; base: PhysicsFormulaAstV1; exponent: PhysicsFormulaAstV1 }
  | { type: "subscript"; base: PhysicsFormulaAstV1; subscript: PhysicsFormulaAstV1 }
  | { type: "subsup"; base: PhysicsFormulaAstV1; subscript: PhysicsFormulaAstV1; superscript: PhysicsFormulaAstV1 }
  | { type: "sqrt"; radicand: PhysicsFormulaAstV1 };

export type RichContentV1 = Array<
  | { type: "text"; text: string }
  | { type: "formula"; display: boolean; ast: PhysicsFormulaAstV1; spokenText: string }
>;

export interface AssignmentQuestionSnapshot {
  questionId: ClientStableId;
  contentVersion: string;
  contentHash: string;
  title: string;
  stem: string;
  richStemV1: RichContentV1 | null;
  options: Array<{ key: string; text: string; richContentV1: RichContentV1 | null }>;
  attachmentRefs: Array<{ uploadId: string; sha256: string; mimeType: string; sizeBytes: number }>;
  gradingMethod: "choice" | "numeric" | "text" | "teacherReview";
  answerReleasePolicy: "afterSubmit" | "afterDue" | "teacherRelease" | "never";
  publishedAnswer: string | null;
  publishedSolution: string | null;
  publishedRichSolutionV1: RichContentV1 | null;
}

export interface PublishedQuestionVersionSummary {
  contentVersion: string;
  questionId: ClientStableId;
  version: number;
  title: string;
  knowledgePointIds: ClientStableId[];
  gradingMethod: "choice" | "numeric" | "text" | "teacherReview";
  sourceHash: string;
  publishedAt: string;
  status: "published";
}

export interface PublishedQuestionVersionDetail extends PublishedQuestionVersionSummary {
  stem: string;
  richStemV1: RichContentV1 | null;
  options: Array<{ key: string; text: string; richContentV1: RichContentV1 | null }>;
  attachmentRefs: Array<{ uploadId: string; sha256: string; mimeType: string; sizeBytes: number }>;
  answer: string;
  solution: string;
  richSolutionV1: RichContentV1 | null;
  source: { title: string; url: string; rightsBasis: string };
}

export type QuestionContentStatus = "draft" | "published" | "rejected" | "withdrawn" | "quarantined";
export type QuestionContentReviewDecision = "approve" | "reject" | "withdraw" | "quarantine";

export interface QuestionContentDraftCreateResponse {
  contentVersion: string;
  questionId: ClientStableId;
  status: "draft";
  createdAt: string;
}

export interface QuestionContentReviewQueueItem {
  contentVersion: string;
  questionId: ClientStableId;
  version: number;
  title: string;
  status: "draft" | "published" | "withdrawn";
  createdBy: { userId: string; displayName: string };
  createdAt: string;
  publishedAt: string | null;
  latestReviewAt: string | null;
}

export interface VerifiedQuestionContentAttachmentV1 {
  uploadId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  status: "verified";
}

export interface QuestionContentReviewHistoryItemV1 {
  reviewId: string;
  decision: QuestionContentReviewDecision;
  previousStatus: QuestionContentStatus;
  nextStatus: QuestionContentStatus;
  reason: string;
  actor: { userId: string; displayName: string };
  createdAt: string;
}

export interface QuestionContentReviewDetailV1 {
  contentVersion: string;
  questionId: ClientStableId;
  version: number;
  status: QuestionContentStatus;
  title: string;
  stem: string;
  richStemV1: RichContentV1 | null;
  options: Array<{ key: string; text: string; richContentV1: RichContentV1 | null }>;
  attachments: VerifiedQuestionContentAttachmentV1[];
  gradingMethod: "choice" | "numeric" | "text" | "teacherReview";
  answer: string;
  solution: string;
  richSolutionV1: RichContentV1 | null;
  knowledgePointIds: ClientStableId[];
  source: { title: string; url: string; rightsBasis: string };
  sourceHash: string | null;
  createdBy: { userId: string; displayName: string };
  createdAt: string;
  publishedAt: string | null;
  withdrawnAt: string | null;
  reviewHistory: QuestionContentReviewHistoryItemV1[];
}

export interface QuestionContentReviewResponseBase {
  contentVersion: string;
  questionId: ClientStableId;
  review: { reviewId: string; decision: QuestionContentReviewDecision; reason: string; createdAt: string };
}

export type QuestionContentReviewResponse =
  | (QuestionContentReviewResponseBase & { status: "published"; sourceHash: string; review: { reviewId: string; decision: "approve"; reason: string; createdAt: string } })
  | (QuestionContentReviewResponseBase & { status: "rejected"; sourceHash: null; review: { reviewId: string; decision: "reject"; reason: string; createdAt: string } })
  | (QuestionContentReviewResponseBase & { status: "withdrawn"; sourceHash: string; review: { reviewId: string; decision: "withdraw"; reason: string; createdAt: string } })
  | (QuestionContentReviewResponseBase & { status: "quarantined"; sourceHash: string; review: { reviewId: string; decision: "quarantine"; reason: string; createdAt: string } });

export interface AssignmentChangePayload {
  assignmentId: string;
  classId: string;
  title: string;
  instructions: string;
  dueAt: string | null;
  target: { type: "class" | "group" | "student"; id: string };
  solutionReleasePolicy: "afterSubmit" | "afterDue" | "teacherRelease" | "never";
  solutionsReleasedAt: string | null;
  questions: Array<{ points: number; snapshot: AssignmentQuestionSnapshot }>;
  publishedAt: string;
}

export type ReviewAnnotationCategory =
  | "审题" | "概念" | "建模" | "规律适用条件" | "计算" | "单位"
  | "方向或符号" | "图像或实验" | "表达" | "猜测作答" | "其他";

export interface ReviewAnnotationV1 {
  overallComment: string | null;
  items: Array<{
    questionId: ClientStableId;
    category: ReviewAnnotationCategory;
    visibility: "student" | "teacherOnly";
    location: string | null;
    comment: string;
  }>;
}

export interface StudentVisibleReviewAnnotationV1 {
  overallComment: string | null;
  items: Array<{
    questionId: ClientStableId;
    category: ReviewAnnotationCategory;
    visibility: "student";
    location: string | null;
    comment: string;
  }>;
}

export interface ReviewPerQuestionScoreV1 {
  questionId: ClientStableId;
  scoreEarned: number;
  pointsPossible: number;
}

export type ReviewDecisionOutcome =
  | { decision: "approve"; status: "approved" }
  | { decision: "return"; status: "returned" }
  | { decision: "rejudge"; status: "rejudged" };

export interface ReviewDecisionChangeBase {
  reviewId: string;
  submissionId: string;
  decisionId: string;
  revision: number;
  score: number;
  perQuestionScores: ReviewPerQuestionScoreV1[];
  reason: string;
  decidedAt: string;
}

export type ReviewDecisionChangePayload =
  | (ReviewDecisionChangeBase & ReviewDecisionOutcome & { view: "teacher"; annotation: ReviewAnnotationV1 })
  | (ReviewDecisionChangeBase & ReviewDecisionOutcome & { view: "student"; annotation: StudentVisibleReviewAnnotationV1 });

export type UploadDownloadQuery =
  | { contextType: "own" }
  | { contextType: "assignment" | "review" | "questionContent"; contextId: string }
  | { contextType: "questionContentReview"; contextId: string };

export type ServerOwnedChange =
  | { changeId: string; eventId: string; entityType: "membership"; entityId: string; projectionClassId: string; operation: SyncOperation; revision: number; payload: MembershipChangePayload | TombstonePayload; occurredAt: string }
  | { changeId: string; eventId: string; entityType: "assignment"; entityId: string; projectionClassId: string; operation: SyncOperation; revision: number; payload: AssignmentChangePayload | TombstonePayload; occurredAt: string }
  | { changeId: string; eventId: string; entityType: "reviewDecision"; entityId: string; projectionClassId: string; operation: "create"; revision: number; payload: ReviewDecisionChangePayload; occurredAt: string };

export type SyncChange = PushEntityChange | ServerOwnedChange;

export interface SyncPullResponse {
  changes: SyncChange[];
  cursor: string;
  hasMore: boolean;
}

export interface SyncBootstrapResponse {
  snapshotId: string;
  items: SyncChange[];
  nextPageToken: string | null;
  cursor: string;
  complete: boolean;
}
```

- `POST /v1/sync/push` accepts exactly `{cursor,events:[{eventId,entityType,entityId,operation,baseRevision,payload,idempotencyKey,createdAt}]}` and returns exactly `{acceptedEventIds,conflicts,cursor}`. Its response cursor represents exactly the caller's validated request cursor position; it never advances past an unseen pull row. With `cursor:null`, it returns a signed cursor for the recipient's current lower watermark, not the current outbox maximum.
- `GET /v1/sync/pull?cursor=` returns exactly `{changes,cursor,hasMore}`. An empty cursor is permitted only when the recipient watermark is zero; otherwise it returns `409 cursor_expired`. `limit` is not client-configurable. The server returns the largest ordered prefix fitting 200 changes and 900 KiB, and the response cursor advances only through the final returned change.
- `GET /v1/sync/bootstrap?pageToken=` returns exactly `{snapshotId,items,nextPageToken,cursor,complete}`. The first page creates a UUID `snapshotId`, fixes `cutoffSequence=max(sync_outbox.sequence)` for that recipient, and starts a stable ordered scan; continuation tokens are signed, user-bound, and carry the same snapshot ID/cutoff. `nextPageToken` is null exactly when `complete=true`. Every page returns the cursor for the fixed cutoff, but clients persist it as active pull state only after `complete=true`. Current-state items may overlap later pull rows, but every change committed after the cutoff is pulled, so overlap is allowed and gaps are not.
- The service derives `actorId` from the verified access token and `deviceId` from the positive server session. These fields are never accepted in a push event.
- `SyncChange` is a discriminated strict union. Unknown fields in the envelope, membership, assignment, review-decision, question snapshot, or nested target/annotation object cause server test failure; server-owned DTOs are never represented as unrestricted `Record<string, unknown>`.
- `richStemV1`, option `richContentV1`, and `publishedRichSolutionV1` use exactly the recursive `RichContentV1` contract above: only text/formula blocks and the listed AST node variants, at most 512 blocks per rich document, maximum AST depth 12, maximum 256 nodes per formula, maximum 64 children in one row, maximum 200 characters for every text block/node value/spoken label, and no unknown field. Options are capped at 20 and verified attachment references at 10 per question. The API rejects raw HTML, raw MathML, URL/style/event attributes, and any arbitrary object/string presented as an AST. Before answer release, `publishedAnswer`, `publishedSolution`, and `publishedRichSolutionV1` are all `null`; partial release is invalid.
- `GET /v1/question-content?status=published&cursor=` returns exactly `{items:PublishedQuestionVersionSummary[],nextCursor}` with at most 100 rows. `status` is required and only `published` is accepted. `GET /v1/question-content/:id` returns exactly one `PublishedQuestionVersionDetail`. Both routes are teacher/administrator-only, use signed user-bound cursors, expose only approved, published, non-withdrawn, non-quarantined versions with verified attachments, and reject unknown query/response fields. Students receive content only through an authorized assignment projection.
- `POST /v1/question-content` returns exactly `QuestionContentDraftCreateResponse`, so the creator receives the server-generated `contentVersion` without guessing it. `GET /v1/question-content/review-queue?status=&cursor=` and `GET /v1/question-content/:id/review-detail` require an administrator with a high-strength session; the queue returns exactly `{items:QuestionContentReviewQueueItem[],nextCursor}` with at most 100 rows and the detail returns exactly `QuestionContentReviewDetailV1`. The queue status is required and is only `draft|published|withdrawn`; its cursor is signed, administrator-bound, filter-bound, and based on stable `(createdAt,contentVersion)` ordering. `POST /v1/question-content/:id/review` returns exactly `QuestionContentReviewResponse`. Every request and every nested response object uses `additionalProperties:false`; detail attachment metadata is verified and its audit history is append-only.
- `UploadDownloadQuery` is an exact strict union. `questionContent` retains the published-content authorization above. `questionContentReview` requires an administrator high-strength session, uses `contextId=contentVersion`, and authorizes only a verified upload actually present in that version's `QuestionContentReviewDetailV1.attachments`; teacher/student/parent callers, guessed versions, or non-referenced uploads receive 404. An ordinary-strength administrator receives `403 reauthentication_required` before version lookup.
- Review decisions use strict discriminated outcomes only: `approve→approved`, `return→returned`, and `rejudge→rejudged`; a decision payload can never emit `pending` or a mismatched status. Every decision contains a unique, complete `perQuestionScores` set matching the submission's pinned answers and assignment points. The server derives the 0—100 percentage as `roundHalfUp(100000 × ΣearnedMilli / ΣpossibleMilli) / 1000`, where values have at most three decimals and are parsed to integer millipoints; `ΣpossibleMilli` must be positive. The `reason` is always student-visible and must contain only student-facing feedback; internal notes are allowed only in `annotation.items` with `visibility:"teacherOnly"`. Every annotation item has a non-null `questionId` belonging to exactly one submitted answer.
- A submission accepts at most 100 correction rows and a review case accepts at most 100 decision rows. The shared domain command locks the parent row before counting/inserting, so concurrent attempts cannot exceed the cap. The 101st correction route call returns `409 correction_history_limit_reached`; sync push preserves its batch HTTP contract and returns that identical stable code on the correction event's conflict without insertion. The 101st review decision returns `409 review_decision_history_limit_reached`.
- Push returns one result for every submitted event while remaining below 900 KiB. Conflict envelopes are never dropped. In request order, the server includes a revisioned `serverPayload` only while the final response remains within budget; an included payload fixes `serverPayloadOmitted:false` and `serverPayloadSha256:null`. If a current revision has no payload, all three payload fields are null/false/null. When an existing payload must be omitted for size, the server sets `serverPayload:null`, `serverPayloadOmitted:true`, and supplies the canonical `serverPayloadSha256`. `serverPayload` is validated by the conflict's `entityType`; it is never an unrestricted record. Append-only conflicts always have `serverPayload:null`, `serverPayloadOmitted:true`, and `serverPayloadSha256:null`. A client obtains current authorized state through pull/bootstrap rather than an oversized conflict response.

```ts
export interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
}

export interface LiveResponse {
  status: "ok";
  service: "physics-studio-business";
  version: "1.0.0";
}

export interface ReadyResponse {
  status: "ready" | "not_ready";
  checks: {
    postgres: "up" | "down";
    redis: "up" | "down";
    objectStorage: "up" | "down";
  };
}
```

- `GET /health/live` always tests only the process event loop and returns `200 LiveResponse` while the process can serve requests.
- `GET /health/ready` returns `200 ReadyResponse` only when PostgreSQL, Redis, and object storage checks pass within 1 second; otherwise it returns `503 ReadyResponse`.
- `GET /metrics` returns Prometheus text only when `Authorization: Bearer <METRICS_TOKEN>` succeeds or the request originates from loopback in development. It is never CORS-enabled.

## Strict Sync Payload Types

```ts
export interface ModelEvidenceV1 {
  researchObject?: string;
  processSegmentation?: string;
  idealizedAssumptions?: string;
  coordinateSystem?: string;
  forceAnalysis?: string;
  stateProcessDistinction?: string;
  equations?: string;
  applicabilityConditions?: string;
  resultCheck?: string;
}

export interface StudentProfilePayload {
  displayName: string;
  grade: "八年级" | "九年级" | "高一" | "高二" | "高三";
  curriculumVersion: "人教版";
}

export interface AttemptPayload {
  profileId: ClientStableId;
  questionId: ClientStableId;
  sessionId: ClientStableId;
  assignmentId: string | null;
  knowledgePointIds: ClientStableId[];
  questionType: "choice" | "numeric" | "shortAnswer" | "proof" | "experiment" | "modeling";
  modelFamilyId: ClientStableId | null;
  variantRole: "diagnostic" | "core" | "near" | "far" | "counter" | "review";
  difficulty: "基础" | "进阶" | "挑战";
  startedAt: string;
  completedAt: string;
  activeDurationSeconds: number;
  hintViewCount: number;
  maxHintLevel: number;
  confidenceBefore: 1 | 2 | 3 | 4 | 5 | null;
  confidenceAfter: 1 | 2 | 3 | 4 | 5 | null;
  finalAnswer: string;
  gradingStatus: "pending" | "correct" | "partial" | "incorrect";
  score: number | null;
  verificationIssues: string[];
  primaryErrorType: "审题" | "概念" | "建模" | "规律适用条件" | "计算" | "单位" | "方向或符号" | "图像或实验" | "表达" | "猜测作答" | null;
  secondaryErrorTypes: Array<"审题" | "概念" | "建模" | "规律适用条件" | "计算" | "单位" | "方向或符号" | "图像或实验" | "表达" | "猜测作答">;
  reflection: string;
  selfExplanation: string;
  modelEvidence: ModelEvidenceV1;
  modelScore: number | null;
  teacherReviewStatus: "notRequired" | "pending" | "approved" | "returned";
  teacherReviewedAt: string | null;
}

export interface HintEventPayload {
  attemptId: ClientStableId;
  level: number;
  openedAt: string;
}

export interface TransferAttemptPayload {
  profileId: ClientStableId;
  sourceQuestionId: ClientStableId;
  variantId: ClientStableId;
  variantType: "near" | "far" | "counter";
  response: string;
  gradingStatus: "pending" | "correct" | "partial" | "incorrect";
  verificationMethod: "automatic" | "teacher";
  reviewComment: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface CorrectionPayload {
  submissionId: ClientStableId;
  questionId: ClientStableId;
  answer: string;
  explanation: string;
}

export interface ReviewSchedulePayload {
  profileId: ClientStableId;
  questionId: ClientStableId;
  knowledgePointIds: ClientStableId[];
  dueAt: string;
  intervalDays: number;
  easeFactor: number;
  repetition: number;
  lapses: number;
  lastRating: 0 | 1 | 2 | 3 | null;
  lastReviewedAt: string | null;
  sourceAttemptId: ClientStableId | null;
}

export interface ExamRecordPayload {
  profileId: ClientStableId;
  examName: string;
  occurredOn: string;
  score: number;
  maxScore: number;
  knowledgePointScores: Array<{ knowledgePointId: ClientStableId; score: number; maxScore: number }>;
}

export interface SubmissionPayload {
  assignmentId: string;
  answers: Array<{ questionId: ClientStableId; contentVersion: string; contentHash: string; answer: string; attachmentIds: string[] }>;
  submittedAt: string;
}

export interface TombstonePayload {
  deletedAt: string;
}
```

Operation rules are exact: `attempt`, `hintEvent`, `transferAttempt`, `correction`, `examRecord`, and `submission` accept only `create` with `baseRevision=0`; `studentProfile` and `reviewSchedule` accept `create`, `update`, and `delete`; a `delete` accepts only `TombstonePayload`; reviewed fields sent by a student are normalized to pending and cannot assert teacher approval. `growthRecord` and the local recommendation `learningPlan` are not cloud sync entity types and must fail schema validation. `assignment` and `reviewDecision` can only be created by their dedicated server routes and are emitted through pull, never accepted through push.

`ModelEvidenceV1` is a strict optional-field object, not a dynamic record: it accepts only the nine listed keys, each value is a trimmed string of at most 2,000 characters, the complete serialized object is at most 12 KiB, and unknown keys or non-string values fail validation. A client may omit unavailable evidence; it must not invent missing modeling steps or stringify arbitrary nested objects.

`StudentProfilePayload.curriculumVersion` is the literal `"人教版"` in service protocol v1. Empty strings, `"未确认"`, `"默认版"`, `"通用版"`, publisher-free labels, and every unsupported edition return `400 validation_error`; the server never silently maps an unknown value to 人教版. Supporting another edition requires a versioned protocol/schema migration and matching content catalog.

## Route and Authorization Matrix

| Route | Allowed principal | Resource rule |
|---|---|---|
| `POST /v1/auth/login` | Anonymous | Valid active credential; 5 attempts/15 minutes per IP plus normalized login |
| `POST /v1/auth/refresh` | Anonymous with refresh token | Current unrotated token; 30 attempts/15 minutes per IP plus token family |
| `POST /v1/auth/logout` | Token holder | Revoke supplied family and delete its Redis session key |
| `POST /v1/auth/reauthenticate` | Authenticated | Current password; return a 10-minute high-strength access token |
| `POST /v1/auth/change-password` | Authenticated account owner | Current/temporary password; revoke all sessions; clear first-change requirement |
| `POST /v1/admin/account-imports` | Administrator | Verified CSV/XLSX upload; high-strength session; async batch provisioning |
| `GET /v1/admin/account-imports/:id` | Creating administrator | Strict batch status and one-time credential-artifact state |
| `GET /v1/admin/credential-artifacts/:id/download` | Creating administrator | High-strength; API-streamed one-time artifact; never exposes an object URL |
| `POST /v1/admin/users/:id/disable` | Administrator | High-strength; revoke every session; audited reason required |
| `POST /v1/admin/users/:id/enable` | Administrator | High-strength; does not restore an old password or session |
| `POST /v1/admin/users/:id/reset-credential` | Administrator | High-strength; create one-time credential; require first password change |
| `POST /v1/classes` | Teacher, administrator | Teacher becomes owner; admin records delegated owner |
| `GET /v1/classes?cursor=` | Authenticated | Paginated authorized classes only; no global directory |
| `GET /v1/classes/:id` | Administrator, owner teacher, active member, linked parent | Membership/ownership checked in PostgreSQL |
| `POST /v1/classes/:id/groups` | Administrator, owner teacher | High-strength session |
| `PATCH /v1/groups/:id` | Administrator, owner teacher | Revision match required |
| `POST /v1/classes/:id/invites` | Administrator, owner teacher | High-strength session; raw code returned once |
| `GET /v1/classes/:id/invites?cursor=` | Administrator, owner teacher | Metadata only; raw codes are never returned again |
| `POST /v1/invites/:id/revoke` | Administrator, owner teacher | High-strength session; idempotent revocation |
| `POST /v1/invites/join` | Student | Code in body; active account; rate limited |
| `GET /v1/classes/:id/roster` | Administrator, owner teacher | No cross-class rows |
| `PATCH /v1/memberships/:id` | Administrator, owner teacher | Approve, assign group, or remove; high-strength session |
| `POST /v1/classes/:id/guardian-links` | Administrator, owner teacher | Both users must belong to the class relationship |
| `POST /v1/guardian-links/:id/revoke` | Administrator, owner teacher | High-strength session; append audit |
| `POST /v1/sync/push` | Authenticated | User-scoped evidence requires ownership; assignment-scoped entities additionally require the derived active membership |
| `GET /v1/sync/pull?cursor=` | Authenticated | Reads only the caller's materialized outbox rows |
| `GET /v1/sync/bootstrap?pageToken=` | Authenticated | Current authorized state at a fixed recipient cutoff; signed user-bound page token |
| `POST /v1/assignments` | Administrator, owner teacher | Draft only; exact class/group target |
| `POST /v1/assignments/:id/publish` | Administrator, owner teacher | High-strength session; immutable published snapshot |
| `POST /v1/assignments/:id/release-solutions` | Administrator, owner teacher | High-strength; append-only release event; cannot retract already released content |
| `GET /v1/question-content/review-queue?status=&cursor=` | Administrator | High-strength; strict 100-row draft/published/withdrawn queue with signed user/filter-bound cursor |
| `GET /v1/question-content/:id/review-detail` | Administrator | High-strength; strict full content, verified attachment metadata, and append-only audit history |
| `GET /v1/question-content?status=published&cursor=` | Teacher, administrator | Paginated reviewed/non-quarantined versions for assignment selection |
| `GET /v1/question-content/:id` | Teacher, administrator | Strict published version detail; no draft/rejected/withdrawn/quarantined content |
| `POST /v1/question-content` | Teacher, administrator | Create draft and return exact server-generated content-version identity |
| `POST /v1/question-content/:id/review` | Administrator | High-strength; append decision and return exact strict review result |
| `POST /v1/submissions` | Student | Own active membership and published assignment |
| `POST /v1/submissions/:id/corrections` | Owning student | Append-only per-question correction; pinned question required; maximum 100, then `409 correction_history_limit_reached` |
| `GET /v1/reviews?classId=&status=&cursor=` | Administrator, class owner teacher | Paginated authorized review queue; no cross-class rows |
| `GET /v1/reviews/:id` | Administrator, class owner teacher, owning student | Role-filtered strict detail; student cannot read teacher-only audit fields |
| `POST /v1/reviews/:id/decision` | Administrator, class owner teacher | High-strength; strict outcome/per-question scores; maximum 100, then `409 review_decision_history_limit_reached` |
| `POST /v1/exam-records/import` | Administrator, class owner teacher | Verified CSV/XLSX upload owned by caller |
| `POST /v1/uploads/presign` | Authenticated | Purpose-specific MIME and size policy |
| `POST /v1/uploads/:id/complete` | Upload owner | Enqueue verification; object is not yet trusted |
| `GET /v1/uploads/:id` | Upload owner | Strict `presigned|uploaded|verifying|verified|rejected|deleted` state; no object key or URL |
| `GET /v1/uploads/:id/download?contextType=&contextId=` | Owner or exact context reader | Strict `own|assignment|review|questionContent|questionContentReview` union; draft review context is high-strength administrator-only; return a 60-second no-store GET URL |
| `POST /v1/feedback` | Authenticated | Own verified attachments only; fixed recipient |
| `GET /v1/feedback/:id` | Feedback owner, administrator | Real queue/delivery state |
| `POST /v1/reports` | Administrator, class owner teacher, student for self | Exact report scope policy |
| `GET /v1/reports/:id` | Job owner or authorized resource reader | Download URL only after artifact verification |
| `GET /v1/parents/students` | Parent | Students reachable only through active guardian links |
| `GET /v1/parents/students/:id/summary?period=` | Linked parent | Aggregated duration, review completion, and knowledge-module summary; no raw answers |
| `POST /v1/privacy/exports` | Authenticated | Self export job; administrator cannot silently request another user's self export |
| `GET /v1/privacy/exports/:id` | Export owner | Strict public status mapping; download URL only while public status is `ready` |
| `POST /v1/privacy/deletion-requests` | Authenticated | High-strength; disable account immediately and schedule grace-period deletion |
| `POST /v1/privacy/deletion-requests/:id/cancel` | Request owner | High-strength; only before irreversible processing starts |
| `POST /v1/privacy/memberships/:id/withdraw` | Owning student | High-strength; remove membership and stop future class projections |
| `POST /v1/privacy/guardian-links/:id/withdraw` | Linked parent or student | High-strength; revoke summary authorization immediately |
| `GET /health/live` | Public/internal probe | No dependency check |
| `GET /health/ready` | Public/internal probe | Dependency status only; no secrets |
| `GET /metrics` | Metrics bearer token or loopback development request | No CORS |

## File Map

| Files | Responsibility |
|---|---|
| `server/package.json`, `server/tsconfig.json`, `server/tsconfig.build.json`, `server/vitest.config.ts`, `server/.env.business.example` | Reproducible TypeScript runtime, commands, compiler/test configuration, and isolated business-service environment |
| `server/src/app.ts`, `server/src/main.ts`, `server/src/worker-main.ts`, `server/src/config.ts` | Composition root, HTTP entry point, worker entry point, strict environment validation |
| `server/src/common/errors.ts`, `server/src/common/schema.ts`, `server/src/common/idempotency.ts`, `server/src/common/request-context.ts` | Strict schema helpers, public errors, request identity, generic idempotency |
| `server/src/infrastructure/db.ts`, `server/src/infrastructure/redis.ts`, `server/src/infrastructure/queues.ts`, `server/src/infrastructure/object-storage.ts`, `server/src/infrastructure/metrics.ts` | External adapters with injectable interfaces |
| `server/migrations/001_core_auth.ts` through `server/migrations/006_account_privacy_content.ts` | Exact PostgreSQL schema and reversible migration sequence |
| `server/src/modules/audit/repository.ts`, `server/src/modules/authorization/policy.ts` | Append-only audit persistence and centralized RBAC/resource ownership rules |
| `server/src/modules/auth/contracts.ts`, `server/src/modules/auth/password.ts`, `server/src/modules/auth/tokens.ts`, `server/src/modules/auth/repository.ts`, `server/src/modules/auth/service.ts`, `server/src/modules/auth/routes.ts`, `server/src/cli/create-user.ts` | Login, access token verification, refresh rotation/reuse detection, logout, reauthentication, controlled provisioning |
| `server/src/modules/classes/contracts.ts`, `server/src/modules/classes/repository.ts`, `server/src/modules/classes/service.ts`, `server/src/modules/classes/routes.ts` | Classes, optional school labels, groups, membership, roster, guardian links |
| `server/src/modules/invites/contracts.ts`, `server/src/modules/invites/repository.ts`, `server/src/modules/invites/service.ts`, `server/src/modules/invites/routes.ts` | Hashed, expiring, limited-use, revocable invitation workflow |
| `server/src/modules/sync/contracts.ts`, `server/src/modules/sync/payload-schemas.ts`, `server/src/modules/sync/cursor.ts`, `server/src/modules/sync/repository.ts`, `server/src/modules/sync/service.ts`, `server/src/modules/sync/routes.ts` | Strict push/pull contracts, revisions, idempotency, tombstones, recipient outbox |
| `server/src/modules/assignments/contracts.ts`, `server/src/modules/assignments/repository.ts`, `server/src/modules/assignments/service.ts`, `server/src/modules/assignments/routes.ts` | Draft/publish snapshot, submission, per-question capped correction history, and sync fan-out |
| `server/src/modules/reviews/contracts.ts`, `server/src/modules/reviews/repository.ts`, `server/src/modules/reviews/service.ts`, `server/src/modules/reviews/routes.ts` | Review queue, strict outcome unions, deterministic per-question weighted scoring, and capped append-only decision history |
| `server/src/modules/accounts/contracts.ts`, `server/src/modules/accounts/repository.ts`, `server/src/modules/accounts/service.ts`, `server/src/modules/accounts/routes.ts`, `server/src/workers/account-import-worker.ts` | Bulk provisioning, required first password change, disable/enable, reset, and administrator recovery |
| `server/src/modules/privacy/contracts.ts`, `server/src/modules/privacy/repository.ts`, `server/src/modules/privacy/service.ts`, `server/src/modules/privacy/routes.ts`, `server/src/workers/account-deletion-worker.ts` | Self export, deletion grace workflow, membership sharing withdrawal, guardian authorization withdrawal |
| `server/src/modules/parent-summary/contracts.ts`, `server/src/modules/parent-summary/service.ts`, `server/src/modules/parent-summary/routes.ts` | Guardian-linked aggregate summaries without raw attempts or answers |
| `server/src/modules/question-content/contracts.ts`, `server/src/modules/question-content/repository.ts`, `server/src/modules/question-content/service.ts`, `server/src/modules/question-content/routes.ts` | Exact draft identity response, high-strength administrator review queue/detail/history, strict published-content list/detail, and immutable assignment snapshot materialization |
| `server/src/modules/exam-import/contracts.ts`, `server/src/modules/exam-import/repository.ts`, `server/src/modules/exam-import/service.ts`, `server/src/modules/exam-import/routes.ts`, `server/src/workers/exam-import-worker.ts` | CSV/XLSX row validation and append-only exam evidence import |
| `server/src/modules/uploads/contracts.ts`, `server/src/modules/uploads/repository.ts`, `server/src/modules/uploads/service.ts`, `server/src/modules/uploads/routes.ts`, `server/src/workers/upload-verification-worker.ts` | Signed upload creation, signature/size/checksum verification, and strict five-context referenced downloads including administrator draft review |
| `server/src/modules/jobs/repository.ts`, `server/src/modules/jobs/dispatcher.ts` | PostgreSQL transactional outbox claim, deterministic BullMQ enqueue, retry state |
| `server/src/modules/feedback/contracts.ts`, `server/src/modules/feedback/repository.ts`, `server/src/modules/feedback/service.ts`, `server/src/modules/feedback/routes.ts`, `server/src/workers/feedback-worker.ts` | Feedback receipt, safe payload, fixed-recipient SMTP delivery and status |
| `server/src/modules/reports/contracts.ts`, `server/src/modules/reports/repository.ts`, `server/src/modules/reports/service.ts`, `server/src/modules/reports/routes.ts`, `server/src/workers/report-worker.ts` | Authorized report jobs and verified downloadable JSON/CSV artifacts |
| `server/src/modules/health/routes.ts` | Stable live, ready, and protected metrics contracts |
| `server/Dockerfile`, `server/Dockerfile.ai`, `server/compose.yaml`, `server/README.md` | Development environment, separate business/worker/AI processes, exact operator commands |
| `server/tests/helpers/test-app.ts`, `server/tests/helpers/containers.ts`, `server/tests/helpers/factories.ts` | Deterministic fixtures and isolated integration infrastructure |
| `server/tests/unit/app.test.ts`, `server/tests/unit/password.test.ts`, `server/tests/unit/tokens.test.ts`, `server/tests/unit/policy.test.ts`, `server/tests/unit/sync-contracts.test.ts`, `server/tests/unit/cursor.test.ts`, `server/tests/unit/upload-policy.test.ts` | Fast unit feedback for pure behavior |
| `server/tests/integration/migrations.test.ts`, `server/tests/integration/auth.test.ts`, `server/tests/integration/classes.test.ts`, `server/tests/integration/invites.test.ts`, `server/tests/integration/sync-push.test.ts`, `server/tests/integration/sync-pull.test.ts`, `server/tests/integration/sync-bootstrap.test.ts`, `server/tests/integration/assignments.test.ts`, `server/tests/integration/reviews.test.ts`, `server/tests/integration/accounts.test.ts`, `server/tests/integration/privacy.test.ts`, `server/tests/integration/parent-summary.test.ts`, `server/tests/integration/question-content.test.ts`, `server/tests/integration/exam-import.test.ts`, `server/tests/integration/uploads.test.ts`, `server/tests/integration/jobs.test.ts`, `server/tests/integration/feedback.test.ts`, `server/tests/integration/reports.test.ts`, `server/tests/integration/health.test.ts`, `server/tests/integration/security.test.ts`, `server/tests/e2e/compose-api-contract.test.ts`, `server/tests/fixtures/protocol-v1-fixtures.ts` | Database, Redis, object store, queue, RBAC, strict protocol fixtures, and real Compose API verification |

## Exact Migration Contract

The migration files use `node-pg-migrate` and application-generated UUIDs. Every `up` and `down` body below is the required content; implementation may format the SQL but must not weaken a constraint.

### `001_core_auth.ts`

```ts
import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      role text NOT NULL CHECK (role IN ('student','teacher','parent','administrator')),
      display_name varchar(80) NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 80),
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
      must_change_password boolean NOT NULL DEFAULT false,
      disabled_at timestamptz,
      CHECK ((status = 'disabled' AND disabled_at IS NOT NULL) OR status = 'active'),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE password_credentials (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      login_normalized varchar(120) NOT NULL UNIQUE,
      password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
      credential_version integer NOT NULL DEFAULT 1 CHECK (credential_version > 0),
      temporary_expires_at timestamptz,
      changed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE refresh_sessions (
      id uuid PRIMARY KEY,
      family_id uuid NOT NULL,
      parent_id uuid REFERENCES refresh_sessions(id) ON DELETE SET NULL,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id varchar(64) NOT NULL CHECK (device_id ~ '^[0-9a-f]{64}$'),
      device_name varchar(80) NOT NULL,
      token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
      session_strength text NOT NULL DEFAULT 'password' CHECK (session_strength IN ('password','reauthenticated')),
      expires_at timestamptz NOT NULL,
      rotated_at timestamptz,
      replaced_by_id uuid REFERENCES refresh_sessions(id) ON DELETE SET NULL,
      revoked_at timestamptz,
      revoke_reason varchar(40),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX refresh_sessions_family_idx ON refresh_sessions(family_id);
    CREATE INDEX refresh_sessions_user_idx ON refresh_sessions(user_id, expires_at DESC);
    CREATE TABLE api_idempotency (
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      route_key varchar(120) NOT NULL,
      idempotency_key varchar(128) NOT NULL,
      request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
      response_status integer NOT NULL CHECK (response_status BETWEEN 200 AND 299),
      response_body jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      PRIMARY KEY (actor_id, route_key, idempotency_key)
    );
    CREATE INDEX api_idempotency_expiry_idx ON api_idempotency(expires_at);
    CREATE TABLE audit_events (
      id uuid PRIMARY KEY,
      actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
      actor_role text CHECK (actor_role IS NULL OR actor_role IN ('student','teacher','parent','administrator')),
      action varchar(120) NOT NULL,
      resource_type varchar(80) NOT NULL,
      resource_id varchar(160) CHECK (resource_id IS NULL OR resource_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      class_id uuid,
      result text NOT NULL CHECK (result IN ('allowed','denied','succeeded','failed')),
      before_state jsonb,
      after_state jsonb,
      reason varchar(500),
      request_id uuid NOT NULL,
      ip_hash bytea CHECK (ip_hash IS NULL OR octet_length(ip_hash) = 32),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX audit_events_resource_idx ON audit_events(resource_type, resource_id, created_at DESC);
    CREATE INDEX audit_events_class_idx ON audit_events(class_id, created_at DESC);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE audit_events;
    DROP TABLE api_idempotency;
    DROP TABLE refresh_sessions;
    DROP TABLE password_credentials;
    DROP TABLE users;
  `);
}
```

### Task 1: Bootstrap the TypeScript business service

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/tsconfig.build.json`
- Create: `server/vitest.config.ts`
- Create: `server/.env.business.example`
- Create: `server/src/config.ts`
- Create: `server/src/app.ts`
- Create: `server/src/main.ts`
- Create: `server/src/worker-main.ts`
- Create: `server/src/common/errors.ts`
- Create: `server/src/common/schema.ts`
- Create: `server/src/common/request-context.ts`
- Create: `server/tests/helpers/factories.ts`
- Create: `server/tests/helpers/test-app.ts`
- Test: `server/tests/unit/app.test.ts`

**Interfaces:**
- Produces: `loadConfig(env: NodeJS.ProcessEnv): AppConfig`, `buildApp(deps: AppDependencies): Promise<FastifyInstance>`, strict `ApiErrorBody` serialization, `makeUnitDependencies()` in `server/tests/helpers/factories.ts`, and a reusable `buildTestApp()` in `server/tests/helpers/test-app.ts`.
- Preserves: `server/physics-ai-gateway.mjs` without imports or edits.

- [ ] **Step 1: Write the failing application-kernel test**

```ts
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/test-app.js";

describe("business application kernel", () => {
  it("uses the stable service identity", async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "physics-studio-business",
      version: "1.0.0",
    });
    await app.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir server test:unit -- tests/unit/app.test.ts`

Expected: FAIL because `server/package.json` and `src/app.ts` do not exist.

- [ ] **Step 3: Add the exact runtime manifest and composition root**

```json
{
  "name": "physics-studio-business-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.18.0",
  "engines": { "node": ">=24.15.0 <25" },
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "dev:worker": "tsx watch src/worker-main.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/main.js",
    "start:worker": "node dist/worker-main.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run tests/unit tests/integration",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration --maxWorkers=1",
    "test:e2e": "vitest run tests/e2e --maxWorkers=1",
    "migrate:up": "tsx src/cli/migrate.ts up",
    "migrate:down": "tsx src/cli/migrate.ts down",
    "create-user": "tsx src/cli/create-user.ts"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "3.1100.0",
    "@aws-sdk/s3-request-presigner": "3.1100.0",
    "@fastify/cors": "11.3.0",
    "@fastify/env": "7.0.0",
    "@fastify/helmet": "13.1.0",
    "@fastify/rate-limit": "11.2.0",
    "@fastify/type-provider-typebox": "6.1.0",
    "@sinclair/typebox": "0.34.52",
    "argon2": "0.45.1",
    "bullmq": "6.0.2",
    "csv-parse": "7.0.1",
    "exceljs": "4.4.0",
    "fastify": "5.11.0",
    "file-type": "22.0.1",
    "ioredis": "5.11.1",
    "jose": "6.2.5",
    "nodemailer": "9.0.3",
    "pg": "8.22.0",
    "prom-client": "15.1.3"
  },
  "devDependencies": {
    "@testcontainers/minio": "12.0.4",
    "@testcontainers/postgresql": "12.0.4",
    "@testcontainers/redis": "12.0.4",
    "@types/node": "26.1.2",
    "@types/nodemailer": "8.0.1",
    "@types/pg": "8.20.0",
    "node-pg-migrate": "9.0.0",
    "pino-pretty": "13.1.3",
    "tsx": "4.23.1",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

```ts
// server/src/common/schema.ts
import { Type, type TProperties } from "@sinclair/typebox";

export function StrictObject<T extends TProperties>(properties: T) {
  return Type.Object(properties, { additionalProperties: false });
}
```

```ts
// server/src/app.ts
import Fastify, { type FastifyInstance } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

export interface AppDependencies {
  config: AppConfig;
  postgres: { query(text: string, values?: readonly unknown[]): Promise<unknown> };
  redis: { ping(): Promise<string>; get(key: string): Promise<string | null> };
  objectStorage: { healthcheck(): Promise<void> };
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.config.nodeEnv !== "test", bodyLimit: 1_048_576 })
    .withTypeProvider<TypeBoxTypeProvider>();
  app.decorate("deps", deps);
  app.get("/health/live", async () => ({
    status: "ok" as const,
    service: "physics-studio-business" as const,
    version: "1.0.0" as const,
  }));
  return app;
}
```

`makeUnitDependencies()` supplies deterministic inert test implementations for configuration, PostgreSQL, Redis, and object storage. `buildTestApp()` calls `buildApp(makeUnitDependencies(overrides))`, supports explicit dependency overrides, and registers cleanup so unit and integration tests do not duplicate composition or leak resources.

The exact `.env.business.example` names are `NODE_ENV`, `BUSINESS_HOST`, `BUSINESS_PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `CURSOR_HMAC_SECRET`, `AUDIT_IP_KEY`, `CREDENTIAL_ARTIFACT_KEY`, `ACCESS_TOKEN_TTL_SECONDS=900`, `REFRESH_TOKEN_TTL_SECONDS=2592000`, `CORS_ALLOWED_ORIGINS`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `FEEDBACK_TO_EMAIL=luo865265@gmail.com`, `METRICS_TOKEN`, `TOMBSTONE_RETENTION_DAYS=180`, `SYNC_OUTBOX_RETENTION_DAYS=180`, `ACCOUNT_TEMP_CREDENTIAL_TTL_HOURS=72`, `ACCOUNT_DELETION_GRACE_DAYS=30`, and `PRIVACY_EXPORT_RETENTION_DAYS=7`. `CREDENTIAL_ARTIFACT_KEY` decodes to exactly 32 random bytes and is used only for AES-256-GCM credential-artifact encryption. `CORS_ALLOWED_ORIGINS` is a comma-separated exact-origin allowlist; packaged releases require `https://physics-studio.local` and `https://appassets.androidplatform.net`, while localhost origins are development-only. Wildcards, `null`, path-bearing entries, and origin reflection are rejected. `loadConfig` must reject missing secrets, an alternate feedback recipient, non-positive/out-of-policy lifecycle values, or development secrets when `NODE_ENV=production`.

- [ ] **Step 4: Verify the kernel and compiler**

Run: `pnpm --dir server install --frozen-lockfile=false`

Run: `pnpm --dir server typecheck`

Run: `pnpm --dir server test:unit -- tests/unit/app.test.ts`

Expected: all three commands exit 0; the test reports 1 passed.

- [ ] **Step 5: Commit the bootstrap**

```bash
git add server/package.json server/pnpm-lock.yaml server/tsconfig.json server/tsconfig.build.json server/vitest.config.ts server/.env.business.example server/src server/tests/helpers/factories.ts server/tests/helpers/test-app.ts server/tests/unit/app.test.ts
git commit -m "chore(server): bootstrap business service"
```

### Task 2: Add PostgreSQL, Redis, migration, and transaction adapters

**Files:**
- Create: `server/src/infrastructure/db.ts`
- Create: `server/src/infrastructure/redis.ts`
- Create: `server/src/cli/migrate.ts`
- Create: `server/migrations/001_core_auth.ts`
- Create: `server/migrations/002_classes.ts`
- Create: `server/migrations/003_learning_sync.ts`
- Create: `server/migrations/004_assignments_reviews.ts`
- Create: `server/migrations/005_jobs_files_feedback_reports.ts`
- Create: `server/migrations/006_account_privacy_content.ts`
- Create: `server/tests/helpers/containers.ts`
- Test: `server/tests/integration/migrations.test.ts`

**Interfaces:**
- Produces: `createPool(connectionString: string): Pool`, `withTransaction<T>(pool: Pool, work: (tx: PoolClient) => Promise<T>): Promise<T>`, `createRedis(url: string): Redis`, and `runMigrations(direction: "up" | "down", count?: number): Promise<void>`.
- Consumes: the six exact migration contracts in this plan.

- [ ] **Step 1: Write the failing migration lifecycle test**

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgres } from "../helpers/containers.js";
import { runMigrations } from "../../src/cli/migrate.js";
import { createPool } from "../../src/infrastructure/db.js";

describe("database migrations", () => {
  const database = startPostgres();
  beforeAll(async () => database.start());
  afterAll(async () => database.stop());

  it("applies, rolls back one step, and reapplies", async () => {
    process.env.DATABASE_URL = database.connectionString();
    await runMigrations("up");
    const pool = createPool(database.connectionString());
    const first = await pool.query<{ name: string }>(
      "select table_name as name from information_schema.tables where table_schema='public'"
    );
    expect(first.rows.map((row) => row.name)).toContain("sync_outbox");
    await runMigrations("down", 1);
    const removed = await pool.query("select to_regclass('public.account_import_batches') as name");
    expect(removed.rows[0].name).toBeNull();
    await runMigrations("up");
    expect((await pool.query("select to_regclass('public.uploads') as name")).rows[0].name).toBe("uploads");
    await pool.end();
  });
});
```

- [ ] **Step 2: Run the migration test to verify it fails**

Run: `pnpm --dir server test:integration -- tests/integration/migrations.test.ts`

Expected: FAIL because migration runner and files are absent.

- [ ] **Step 3: Implement adapters and the exact migrations**

```ts
// server/src/infrastructure/db.ts
import pg, { type Pool, type PoolClient } from "pg";

export function createPool(connectionString: string): Pool {
  return new pg.Pool({ connectionString, max: 20, statement_timeout: 10_000 });
}

export async function withTransaction<T>(
  pool: Pool,
  work: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    const result = await work(tx);
    await tx.query("COMMIT");
    return result;
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}
```

```ts
// server/src/cli/migrate.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";

export async function runMigrations(direction: "up" | "down", count?: number): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  await runner({
    databaseUrl,
    dir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations"),
    direction,
    count,
    migrationsTable: "pgmigrations",
    checkOrder: true,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const direction = process.argv[2] === "down" ? "down" : "up";
  await runMigrations(direction, direction === "down" ? 1 : undefined);
}
```

- [ ] **Step 4: Verify migration and transaction behavior**

Run: `pnpm --dir server test:integration -- tests/integration/migrations.test.ts`

Expected: PASS, including rollback and reapply.

- [ ] **Step 5: Commit database infrastructure**

```bash
git add server/src/infrastructure server/src/cli/migrate.ts server/migrations server/tests/helpers/containers.ts server/tests/integration/migrations.test.ts
git commit -m "feat(server): add database and migration foundation"
```

### Task 3: Add generic idempotency, audit, and authorization primitives

**Files:**
- Create: `server/src/common/idempotency.ts`
- Create: `server/src/modules/audit/repository.ts`
- Create: `server/src/modules/authorization/policy.ts`
- Test: `server/tests/unit/policy.test.ts`
- Test: `server/tests/integration/security.test.ts`

**Interfaces:**
- Produces: `requireMutationIdempotency(request): MutationIdempotency`, `executeIdempotently<T>(tx, input, work): Promise<IdempotentResult<T>>`, `appendAudit(tx, event): Promise<void>`, `authorize(actor, action, resource): AuthorizationDecision`.
- Guarantees: a repeated key with an identical SHA-256 canonical request returns the stored response; a repeated key with a different hash throws `409 idempotency_mismatch`.

- [ ] **Step 1: Write failing policy and idempotency tests**

```ts
import { describe, expect, it } from "vitest";
import { authorize } from "../../src/modules/authorization/policy.js";

describe("authorization policy", () => {
  it("denies a teacher reading another teacher's class", () => {
    const result = authorize(
      { userId: "00000000-0000-4000-8000-000000000001", role: "teacher", sessionStrength: "password" },
      "class.read",
      { classId: "00000000-0000-4000-8000-000000000010", ownerTeacherId: "00000000-0000-4000-8000-000000000002", activeMember: false, guardianLinked: false },
    );
    expect(result).toEqual({ allowed: false, code: "resource_forbidden" });
  });
});
```

Add a table-driven route assertion covering class/group/invite/join/membership/assignment/publish/solution-release/submission/correction/review/upload/feedback/report/account/privacy/sync mutations: a missing or malformed `Idempotency-Key` returns `400 idempotency_key_required` before domain work; identical replay returns the original response; a changed canonical body returns `409 idempotency_mismatch`. Explicitly test a stored `204` response using JSON `null` internally and an empty HTTP body externally. Also assert that denial writes `audit_events.result='denied'` without storing a raw IP address.

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `pnpm --dir server test:unit -- tests/unit/policy.test.ts`

Expected: FAIL because `authorize` is absent.

- [ ] **Step 3: Implement canonical hashing, stored responses, and centralized policy**

```ts
export type AuthorizationAction =
  | "class.read" | "class.manage" | "membership.manage" | "guardian.manage"
  | "assignment.create" | "assignment.publish" | "submission.create"
  | "review.decide" | "report.read" | "sync.write" | "account.manage"
  | "privacy.read" | "privacy.withdraw" | "content.create" | "content.review" | "parent.summary";

export function authorize(actor: Actor, action: AuthorizationAction, resource: ResourceContext): AuthorizationDecision {
  if (actor.role === "administrator") return { allowed: true };
  const owner = actor.role === "teacher" && resource.ownerTeacherId === actor.userId;
  const sensitive = new Set<AuthorizationAction>([
    "class.manage", "membership.manage", "guardian.manage", "assignment.publish", "review.decide",
    "account.manage", "privacy.withdraw", "content.review",
  ]);
  if (sensitive.has(action) && actor.sessionStrength !== "reauthenticated") {
    return { allowed: false, code: "reauthentication_required" };
  }
  if (action === "class.read" && (owner || resource.activeMember || resource.guardianLinked)) return { allowed: true };
  if (actor.role === "teacher" && owner) return { allowed: true };
  if (action === "submission.create" && actor.role === "student" && resource.activeMember) return { allowed: true };
  if (action === "sync.write" && resource.ownerUserId === actor.userId) return { allowed: true };
  return { allowed: false, code: "resource_forbidden" };
}
```

Register `requireMutationIdempotency` as a route-aware pre-handler for every non-exempt mutable route. Route handlers pass its key, canonical method/path/body digest, actor, and response serializer into `executeIdempotently`; retries after reauthentication reuse the same key. Sync retains its request-level key in this table and its per-event key in `sync_inbound_events`. `appendAudit` takes `{actorId,actorRole,action,resourceType,resourceId,classId,result,beforeState,afterState,reason,requestId,ipHash}` and inserts one append-only row in the same transaction as the sensitive mutation. `ipHash` is `HMAC-SHA256(AUDIT_IP_KEY, normalizedIp)`; raw IPs and bearer tokens never enter the row.

- [ ] **Step 4: Verify primitives**

Run: `pnpm --dir server test:unit -- tests/unit/policy.test.ts`

Run: `pnpm --dir server test:integration -- tests/integration/security.test.ts`

Expected: policy unit tests pass; idempotency replay returns the original response and mismatch returns 409 with a denial audit row.

- [ ] **Step 5: Commit shared safety primitives**

```bash
git add server/src/common/idempotency.ts server/src/modules/audit server/src/modules/authorization server/tests/unit/policy.test.ts server/tests/integration/security.test.ts
git commit -m "feat(server): add idempotency audit and authorization"
```

### Task 4: Implement password login and Bearer access authentication

**Files:**
- Create: `server/src/modules/auth/contracts.ts`
- Create: `server/src/modules/auth/password.ts`
- Create: `server/src/modules/auth/tokens.ts`
- Create: `server/src/modules/auth/repository.ts`
- Create: `server/src/modules/auth/service.ts`
- Create: `server/src/modules/auth/routes.ts`
- Create: `server/src/cli/create-user.ts`
- Test: `server/tests/unit/password.test.ts`
- Test: `server/tests/unit/tokens.test.ts`
- Test: `server/tests/integration/auth.test.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): Promise<string>`, `verifyPassword(hash: string, password: string): Promise<boolean>`, `issueAccessToken(claims): Promise<string>`, `verifyAccessToken(token): Promise<AccessClaims>`, `login(input, context): Promise<AuthResponse>`.
- Route contract: `POST /v1/auth/login` returns exactly `{accessToken,refreshToken,user}`.

- [ ] **Step 1: Write failing password, token, and response-shape tests**

```ts
it("returns the immutable login response and accepts it as Bearer auth", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      login: "student-001",
      password: "Correct Horse Battery Staple 2026",
      deviceId: "A".repeat(64),
      deviceName: "Windows classroom PC",
    },
  });
  expect(response.statusCode).toBe(200);
  expect(Object.keys(response.json()).sort()).toEqual(["accessToken", "refreshToken", "user"]);
  expect(response.json().user).toMatchObject({ role: "student", status: "active" });
  expect(await redis.get(`auth:session:${decodeSid(response.json().accessToken)}`)).not.toBeNull();
});
```

Unit tests must also assert an Argon2id hash verifies the right password, rejects a wrong password, contains `m=65536,t=3,p=1`, that access claims expire 900 seconds after issuance, and that login returns only the two lifecycle booleans `user.mustChangePassword` and `user.deletionPending` in addition to the fixed public user fields.

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --dir server test:unit -- tests/unit/password.test.ts tests/unit/tokens.test.ts`

Run: `pnpm --dir server test:integration -- tests/integration/auth.test.ts`

Expected: FAIL because auth modules and routes are absent.

- [ ] **Step 3: Implement login with opaque refresh secret and positive Redis session**

```ts
// server/src/modules/auth/password.ts
import argon2 from "argon2";

const OPTIONS = { type: argon2.argon2id, memoryCost: 65_536, timeCost: 3, parallelism: 1 } as const;
export const hashPassword = (password: string) => argon2.hash(password, OPTIONS);
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password, OPTIONS);
```

```ts
// server/src/modules/auth/tokens.ts
import { SignJWT, jwtVerify } from "jose";

export async function issueAccessToken(claims: AccessClaimsInput, secret: Uint8Array): Promise<string> {
  return new SignJWT({
    role: claims.role,
    sid: claims.familyId,
    deviceId: claims.deviceId,
    sessionStrength: claims.sessionStrength,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("physics-studio-business")
    .setAudience("physics-studio-clients")
    .setSubject(claims.userId)
    .setJti(claims.jti)
    .setIssuedAt(claims.nowSeconds)
    .setExpirationTime(claims.nowSeconds + 900)
    .sign(secret);
}
```

Validate `deviceId` against `^[0-9A-Fa-f]{64}$`, normalize it to lowercase before storing it in PostgreSQL, placing it in token claims, or comparing it with the positive Redis session. Generate refresh secrets with `randomBytes(32).toString("base64url")`; return `r1.<tokenId>.<secret>`, store only `SHA-256(secret)`, and set `auth:session:<familyId>` with `{userId,deviceId,status:"active"}` and the 30-day TTL. Auth middleware verifies JWT signature/issuer/audience/expiry, then requires that exact Redis family key and matching user/device values exist. When `mustChangePassword=true`, middleware allows only change-password, refresh, logout, and minimal account-self reads; all other routes return `403 password_change_required`. When a live deletion request exists, login is allowed only to create a restricted cancellation session; reauthentication, deletion status/cancel, and logout are permitted while every learning/class/content route returns `403 deletion_pending`. `create-user.ts` requires explicit `--login`, `--display-name`, and `--role`; it reads the password from a no-echo prompt by default or from stdin only when `--password-stdin` is explicitly supplied. It never accepts a password argument, environment variable, or prints a secret/hash.

- [ ] **Step 4: Verify auth behavior and response contract**

Run: `pnpm --dir server test:unit -- tests/unit/password.test.ts tests/unit/tokens.test.ts`

Run: `pnpm --dir server test:integration -- tests/integration/auth.test.ts`

Expected: valid login is 200 with exactly three top-level fields; wrong credentials are identical `401 invalid_credentials`; disabled users are rejected; logs contain neither password nor tokens.

- [ ] **Step 5: Commit login and access auth**

```bash
git add server/src/modules/auth server/src/cli/create-user.ts server/tests/unit/password.test.ts server/tests/unit/tokens.test.ts server/tests/integration/auth.test.ts
git commit -m "feat(server): add login and bearer authentication"
```

### Task 5: Implement refresh rotation, replay revocation, logout, and reauthentication

**Files:**
- Modify: `server/src/modules/auth/contracts.ts`
- Modify: `server/src/modules/auth/repository.ts`
- Modify: `server/src/modules/auth/service.ts`
- Modify: `server/src/modules/auth/routes.ts`
- Test: `server/tests/integration/auth.test.ts`

**Interfaces:**
- Produces: `refresh({refreshToken}): Promise<AuthResponse>`, `logout({refreshToken}): Promise<void>`, `reauthenticate(actor, password): Promise<{accessToken: string; user: AuthUser}>`, `changePassword(actor,{currentPassword,newPassword}): Promise<{user: AuthUser}>`.
- Guarantees: refresh success returns exactly the login response shape; a rotated token can never rotate again.

- [ ] **Step 1: Add failing rotation/replay/logout tests**

```ts
it("rotates once and revokes the family on replay", async () => {
  const first = await login(app);
  const rotated = await app.inject({
    method: "POST",
    url: "/v1/auth/refresh",
    payload: { refreshToken: first.refreshToken },
  });
  expect(rotated.statusCode).toBe(200);
  expect(Object.keys(rotated.json()).sort()).toEqual(["accessToken", "refreshToken", "user"]);
  expect(rotated.json().refreshToken).not.toBe(first.refreshToken);

  const replay = await app.inject({
    method: "POST",
    url: "/v1/auth/refresh",
    payload: { refreshToken: first.refreshToken },
  });
  expect(replay.statusCode).toBe(401);
  expect(replay.json().code).toBe("refresh_token_reused");

  const familyAfterReplay = await app.inject({
    method: "POST",
    url: "/v1/auth/refresh",
    payload: { refreshToken: rotated.json().refreshToken },
  });
  expect(familyAfterReplay.statusCode).toBe(401);
});
```

Add tests that logout returns 204 and immediately invalidates the current access token, that a reauthenticated token permits sensitive policy for 10 minutes but refresh does not extend that strength, and that first password change clears `mustChangePassword`, increments `credential_version`, revokes every existing token family, rejects known-compromised/too-short passwords, and requires a fresh login.

- [ ] **Step 2: Run the auth integration test to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/auth.test.ts`

Expected: FAIL on missing refresh/logout/reauthenticate routes.

- [ ] **Step 3: Implement atomic rotation and family revocation**

```ts
export async function rotateRefreshToken(input: RefreshRequest, context: AuthContext): Promise<AuthResponse> {
  const parsed = parseRefreshToken(input.refreshToken);
  return withTransaction(context.pool, async (tx) => {
    const current = await context.repository.lockRefreshToken(tx, parsed.tokenId);
    if (!current || !timingSafeEqual(current.tokenHash, sha256(parsed.secret)) || current.expiresAt <= context.now()) {
      throw unauthorized("invalid_refresh_token");
    }
    if (current.rotatedAt || current.revokedAt) {
      await context.repository.revokeFamily(tx, current.familyId, "refresh_token_reused", context.now());
      await context.redis.del(`auth:session:${current.familyId}`);
      throw unauthorized("refresh_token_reused");
    }
    const next = createRefreshRecord(current, context.now());
    await context.repository.insertRefreshToken(tx, next);
    await context.repository.markRotated(tx, current.id, next.id, context.now());
    await context.redis.set(
      `auth:session:${current.familyId}`,
      JSON.stringify({ userId: current.userId, deviceId: current.deviceId, status: "active" }),
      "EX",
      2_592_000,
    );
    return context.issueAuthResponse(current.userId, current.familyId, current.deviceId, next);
  });
}
```

If Redis update fails, revoke the family in a compensating PostgreSQL transaction and return `503 session_store_unavailable`. `POST /v1/auth/reauthenticate` verifies the current password and issues only `{accessToken,user}` with `sessionStrength="reauthenticated"` and an additional `reauthenticatedUntil` claim equal to now plus 600 seconds. `POST /v1/auth/logout` locks the supplied row, revokes its family, deletes the Redis key, writes an audit row, and returns an empty 204 response. `POST /v1/auth/change-password` locks the credential, verifies the current or unexpired administrator-issued temporary password, writes a fresh Argon2id hash, increments `credential_version`, clears `must_change_password` and `temporary_expires_at`, revokes every refresh family and Redis session for the user, and appends an audit event in one transaction plus fail-closed Redis cleanup.

- [ ] **Step 4: Verify the complete auth lifecycle**

Run: `pnpm --dir server test:integration -- tests/integration/auth.test.ts`

Expected: all login, refresh, replay, logout, rate-limit, and reauthentication cases pass; the two fixed auth success responses have no additional top-level fields.

- [ ] **Step 5: Commit session lifecycle**

```bash
git add server/src/modules/auth server/tests/integration/auth.test.ts
git commit -m "feat(server): rotate and revoke refresh sessions"
```

### Task 6: Implement class, group, membership, roster, and RBAC services

**Files:**
- Create: `server/src/modules/classes/contracts.ts`
- Create: `server/src/modules/classes/repository.ts`
- Create: `server/src/modules/classes/service.ts`
- Create: `server/src/modules/classes/routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/integration/classes.test.ts`

**Interfaces:**
- Produces: `createClass`, `listClasses`, `getClass`, `createGroup`, `updateGroup`, `getRoster`, and `updateMembership`, each taking an authenticated `Actor` and returning strict response objects. `listClasses` returns `{items,nextCursor}` with at most 100 authorized rows; `getClass` includes only that class's group metadata.
- Emits: `membership` sync changes to the affected student and owner teacher in the same transaction as membership mutation.

- [ ] **Step 1: Write failing class-isolation tests**

```ts
it("keeps schoolLabel descriptive and blocks cross-class access", async () => {
  const created = await postAs(teacherA, "/v1/classes", {
    name: "九年级一班",
    grade: "九年级",
    subject: "物理",
    schoolLabel: "示例学校",
  }, "class-create-0001");
  expect(created.statusCode).toBe(201);
  expect(created.json().schoolLabel).toBe("示例学校");

  const denied = await getAs(teacherB, `/v1/classes/${created.json().id}`);
  expect(denied.statusCode).toBe(403);
  expect(denied.json().code).toBe("resource_forbidden");
  expect(await auditResult(teacherB.id, "class.read")).toBe("denied");
});
```

Add cases for optional `schoolLabel=null`, duplicate group names, wrong-class `groupId`, class-list pagination/isolation, roster pagination capped at 200, pending membership invisibility to unrelated users, removal, and administrator override.

- [ ] **Step 2: Run the class integration test to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/classes.test.ts`

Expected: FAIL because class routes are not registered.

- [ ] **Step 3: Implement transactional class operations**

```ts
export const CreateClassBody = StrictObject({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  grade: Type.Union([Type.Literal("八年级"), Type.Literal("九年级"), Type.Literal("高一"), Type.Literal("高二"), Type.Literal("高三")]),
  subject: Type.Literal("物理"),
  schoolLabel: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
});

export async function createClass(actor: Actor, input: CreateClassInput, request: MutationContext): Promise<ClassView> {
  if (!new Set(["teacher", "administrator"]).has(actor.role)) throw forbidden("role_forbidden");
  return withTransaction(request.pool, async (tx) => executeIdempotently(tx, request.idempotency, async () => {
    const row = await request.repository.insertClass(tx, {
      id: request.ids.uuid(),
      ownerTeacherId: actor.userId,
      name: input.name.trim(),
      grade: input.grade,
      subject: "物理",
      schoolLabel: input.schoolLabel?.trim() || null,
    });
    await appendAudit(tx, request.audit("class.create", "class", row.id, "succeeded", null, row));
    return row;
  }));
}
```

`PATCH /v1/memberships/:id` accepts exactly `{status:"active"|"removed",groupId:string|null,studentNumber:string|null}`. The repository locks membership and group rows, verifies the group belongs to the same class, sets `joinedAt` only on first activation, increments affected projections, writes audit, and adds recipient outbox rows before commit.

- [ ] **Step 4: Verify class behavior**

Run: `pnpm --dir server test:integration -- tests/integration/classes.test.ts`

Expected: PASS for ownership, optional label, group, roster, membership state, idempotency, and cross-class denial cases.

- [ ] **Step 5: Commit class management**

```bash
git add server/src/modules/classes server/src/app.ts server/tests/integration/classes.test.ts
git commit -m "feat(server): add classes groups and memberships"
```

### Task 7: Implement limited invitation codes and explicit guardian links

**Files:**
- Create: `server/src/modules/invites/contracts.ts`
- Create: `server/src/modules/invites/repository.ts`
- Create: `server/src/modules/invites/service.ts`
- Create: `server/src/modules/invites/routes.ts`
- Modify: `server/src/modules/classes/contracts.ts`
- Modify: `server/src/modules/classes/service.ts`
- Modify: `server/src/modules/classes/routes.ts`
- Test: `server/tests/integration/invites.test.ts`

**Interfaces:**
- Produces: `createInvite(classId,{expiresAt,maxUses}) -> {id,code,expiresAt,maxUses}`, `listInvites(classId,cursor) -> {items,nextCursor}` without any raw code/hash, `revokeInvite(inviteId) -> {id,status:"revoked"}`, `joinInvite({code}) -> {membershipId,status:"pending"}`, `createGuardianLink`, and `revokeGuardianLink`.
- Guarantees: raw invitation code is returned once and only its 32-byte SHA-256 digest is persisted.

- [ ] **Step 1: Write failing expiry, limit, revoke, race, and guardian tests**

```ts
it("consumes the final invite use exactly once under concurrency", async () => {
  const invite = await createInvite(owner, classId, { expiresAt: inOneHour(), maxUses: 1 });
  const [first, second] = await Promise.all([
    joinInvite(studentA, invite.code),
    joinInvite(studentB, invite.code),
  ]);
  expect([first.statusCode, second.statusCode].sort()).toEqual([201, 409]);
  expect(await countPendingMemberships(classId)).toBe(1);
  expect(await storedRawInviteCount(invite.code)).toBe(0);
});
```

Add tests for expired, revoked, exhausted, wrong role, per-IP/code-hash rate limit, duplicate join idempotency, idempotent owner-only invite revocation, guardian read before/after explicit link, and link revocation.

- [ ] **Step 2: Run the invitation test to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/invites.test.ts`

Expected: FAIL because invitation and guardian routes are absent.

- [ ] **Step 3: Implement atomic invite consumption and guardian authorization**

```ts
export async function joinInvite(actor: Actor, code: string, context: InviteContext): Promise<JoinInviteResult> {
  if (actor.role !== "student") throw forbidden("student_role_required");
  const codeHash = sha256(Buffer.from(code, "utf8"));
  return withTransaction(context.pool, async (tx) => {
    const invite = await context.repository.lockByHash(tx, codeHash);
    if (!invite) throw notFound("invite_not_found");
    if (invite.status !== "active" || invite.expiresAt <= context.now()) throw conflict("invite_unavailable");
    if (invite.usedCount >= invite.maxUses) throw conflict("invite_exhausted");
    const membership = await context.repository.insertPendingMembership(tx, invite.classId, actor.userId);
    await context.repository.incrementUse(tx, invite.id, invite.usedCount + 1 === invite.maxUses);
    await appendAudit(tx, context.audit("invite.join", invite.id, membership.id));
    return { membershipId: membership.id, status: "pending" };
  });
}
```

Create codes from 16 cryptographically random bytes encoded as base64url. `POST /v1/classes/:id/guardian-links` accepts exactly `{parentUserId,studentUserId}` and verifies parent role, student role, active student membership in that class, owner/high-strength authorization, and an active link before any parent report/class read.

- [ ] **Step 4: Verify invitation and guardian workflows**

Run: `pnpm --dir server test:integration -- tests/integration/invites.test.ts`

Expected: PASS with one winner at max-use race, no raw code in PostgreSQL/logs, and no parent access without an active explicit link.

- [ ] **Step 5: Commit invitation and guardian flows**

```bash
git add server/src/modules/invites server/src/modules/classes server/tests/integration/invites.test.ts
git commit -m "feat(server): add invites and guardian links"
```

### Task 8: Implement the strict synchronization schema boundary

**Files:**
- Create: `server/src/modules/sync/contracts.ts`
- Create: `server/src/modules/sync/payload-schemas.ts`
- Test: `server/tests/unit/sync-contracts.test.ts`

**Interfaces:**
- Produces: `SyncPushBodySchema`, `SyncPushResponseSchema`, `SyncPullQuerySchema`, `SyncPullResponseSchema`, `SyncBootstrapQuerySchema`, `SyncBootstrapResponseSchema`, strict discriminated server-owned change schemas, and `validatePushEvent(event): ValidatedPushEvent`.
- Entity contract: push accepts only `studentProfile|attempt|hintEvent|transferAttempt|correction|reviewSchedule|examRecord|submission`; pull additionally emits `membership|assignment|reviewDecision`.

- [ ] **Step 1: Write a failing table-driven strictness test**

```ts
it.each([
  [Object.assign(validAttemptEvent(), { unexpected: true }), "unknown envelope field"],
  [Object.assign(validAttemptEvent(), { entityType: "growthRecord" }), "growthRecord is local only"],
  [Object.assign(validAttemptEvent(), { entityType: "learningPlan" }), "learningPlan is local only"],
  [Object.assign(validAttemptEvent(), { entityType: "assignment" }), "assignment uses its dedicated route"],
  [Object.assign(validAttemptEvent(), { entityType: "reviewDecision" }), "reviewDecision uses its dedicated route"],
  [Object.assign(validAttemptEvent(), { operation: "update" }), "attempt is append-only"],
  [Object.assign(validReviewScheduleEvent(), { payload: Object.assign(validReviewScheduleEvent().payload, { extra: 1 }) }), "unknown payload field"],
])("rejects %s: %s", (event) => {
  expect(() => validatePushEvent(event)).toThrowError("validation_error");
});
```

Add one accepted fixture for every one of the eight push entity types, delete fixtures only for `studentProfile` and `reviewSchedule`, 101-event rejection, exact 900-KiB request acceptance, 900-KiB-plus-one-byte rejection, dynamic batches smaller than 100 when byte-limited, 64-KiB event rejection, malformed RFC 3339 rejection, unknown nested `knowledgePointScores`/`answers` fields, deterministic conflict-payload omission keeping the complete response below 900 KiB, and accepted/rejected fixtures for every strict membership, assignment-question snapshot, assignment, and review-decision pull DTO. Review-decision fixtures include complete strict `perQuestionScores` and prove only approve/approved, return/returned, and rejudge/rejudged pass; `pending`, mismatches, null scores, null annotation question IDs, and unknown fields fail. The correction fixture must include a valid `questionId`; missing, empty, malformed, or unknown correction fields fail strict schema validation before semantic submission lookup. Add an append-only correction conflict fixture for `correction_history_limit_reached`. For `studentProfile`, accept only `curriculumVersion:"人教版"`; reject an empty string, `"未确认"`, `"默认版"`, `"通用版"`, a publisher-free generic label, and every unsupported edition. Add response-schema fixtures proving a revisioned conflict accepts only the payload matching its `entityType`, unknown conflict/payload fields fail, and every append-only conflict rejects a non-null payload or non-null payload hash.

- [ ] **Step 2: Run the schema tests to verify failure**

Run: `pnpm --dir server test:unit -- tests/unit/sync-contracts.test.ts`

Expected: FAIL because sync schemas do not exist.

- [ ] **Step 3: Implement discriminated TypeBox schemas and semantic operation checks**

```ts
export const ReviewSchedulePayloadSchema = StrictObject({
  profileId: ClientStableIdSchema,
  questionId: ClientStableIdSchema,
  knowledgePointIds: Type.Array(ClientStableIdSchema, { maxItems: 50, uniqueItems: true }),
  dueAt: Rfc3339Schema,
  intervalDays: Type.Number({ minimum: 0, maximum: 3650 }),
  easeFactor: Type.Number({ minimum: 1, maximum: 5 }),
  repetition: Type.Integer({ minimum: 0, maximum: 10000 }),
  lapses: Type.Integer({ minimum: 0, maximum: 10000 }),
  lastRating: Type.Union([Type.Integer({ minimum: 0, maximum: 3 }), Type.Null()]),
  lastReviewedAt: Type.Union([Rfc3339Schema, Type.Null()]),
  sourceAttemptId: Type.Union([ClientStableIdSchema, Type.Null()]),
});

export const ExamRecordPayloadSchema = StrictObject({
  profileId: ClientStableIdSchema,
  examName: Type.String({ minLength: 1, maxLength: 160 }),
  occurredOn: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  score: Type.Number({ minimum: 0, maximum: 100000 }),
  maxScore: Type.Number({ exclusiveMinimum: 0, maximum: 100000 }),
  knowledgePointScores: Type.Array(StrictObject({
    knowledgePointId: ClientStableIdSchema,
    score: Type.Number({ minimum: 0, maximum: 100000 }),
    maxScore: Type.Number({ exclusiveMinimum: 0, maximum: 100000 }),
  }), { maxItems: 500 }),
});

export const SubmissionPayloadSchema = StrictObject({
  assignmentId: UuidSchema,
  answers: Type.Array(StrictObject({
    questionId: ClientStableIdSchema,
    contentVersion: UuidSchema,
    contentHash: Type.String({ pattern: "^[0-9a-f]{64}$" }),
    answer: Type.String({ maxLength: 30000 }),
    attachmentIds: Type.Array(UuidSchema, { maxItems: 10, uniqueItems: true }),
  }), { minItems: 1, maxItems: 200 }),
  submittedAt: Rfc3339Schema,
});
```

Define `ClientStableIdSchema = Type.String({minLength:1,maxLength:160,pattern:"^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$"})`. Build each event as a strict object with a literal `entityType`, allowed literal `operation`, canonical UUID `eventId`, stable-string `entityId`, exact payload schema, `baseRevision>=0`, `idempotencyKey` length 16-128, and RFC 3339 `createdAt`. `StudentProfilePayloadSchema` uses `Type.Literal("人教版")`; neither validation nor persistence performs a fallback or alias mapping. Run `Value.Check`, serialized payload byte length, and route-level raw-body byte checks before domain processing. Enforce `score<=maxScore` for exam totals and every knowledge-point score after structural validation. Implement `SyncConflictSchema` and `SyncChangeSchema` as exact strict discriminated TypeBox unions from Immutable Client Contracts: revisioned conflict payloads are selected by literal `entityType`, while every append-only conflict fixes `serverPayload:null`, `serverPayloadOmitted:true`, and `serverPayloadSha256:null`. Assignment answer/solution fields are nullable but their release-state authorization is enforced before serialization.

- [ ] **Step 4: Verify all eight schemas and exclusions**

Run: `pnpm --dir server test:unit -- tests/unit/sync-contracts.test.ts`

Expected: eight valid push fixtures and all three server-owned pull fixtures pass; every unknown field/type/operation/local-only or server-only push fixture fails; both request and response byte-boundary fixtures are deterministic.

- [ ] **Step 5: Commit sync contracts**

```bash
git add server/src/modules/sync/contracts.ts server/src/modules/sync/payload-schemas.ts server/tests/unit/sync-contracts.test.ts
git commit -m "feat(server): define strict sync event schemas"
```

### Task 9: Implement sync push, idempotency, revision conflicts, and tombstones

**Files:**
- Create: `server/src/modules/sync/repository.ts`
- Create: `server/src/modules/sync/service.ts`
- Create: `server/src/modules/sync/routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/integration/sync-push.test.ts`

**Interfaces:**
- Produces: `push(actor, deviceId, request: SyncPushRequest): Promise<SyncPushResponse>` with exactly `{acceptedEventIds,conflicts,cursor}`.
- Consumes: strict schemas from Task 8 and `withTransaction`, `authorize`, and audit primitives.

- [ ] **Step 1: Write failing push semantics tests**

```ts
it("accepts an event once and reports a stale revision without overwriting", async () => {
  const created = await push(student, { cursor: null, events: [studentProfileCreate(0)] });
  expect(created.body).toEqual({
    acceptedEventIds: [studentProfileCreate(0).eventId],
    conflicts: [],
    cursor: expect.any(String),
  });
  const replay = await push(student, { cursor: created.body.cursor, events: [studentProfileCreate(0)] });
  expect(replay.body.acceptedEventIds).toEqual([studentProfileCreate(0).eventId]);
  expect(await profileRowCount(student.id)).toBe(1);

  const stale = await push(student, { cursor: replay.body.cursor, events: [studentProfileUpdate(0)] });
  expect(stale.body.conflicts[0]).toMatchObject({ code: "revision_conflict", serverRevision: 1 });
  expect(await currentProfileRevision(student.id)).toBe(1);
});
```

Add cases for same idempotency key/different digest; append-only replay with a different event/key but identical entity/payload; append-only same entity with different payload; accepted legacy IDs such as `attempt-2025-001`; identical local IDs isolated across two users; user-scoped evidence projection to two simultaneously active class memberships without duplicating the domain row; membership-scoped submission/correction isolation; cross-scope reference rejection; cross-user profile; wrong assignment class; student-forged approved review fields; submission to unpublished assignment; review schedule update/delete; tombstone retention; and all eight domain tables. Verify that every active class owner receives one class-tagged projection, unrelated teachers receive none, membership removal stops only future projections, and a linked parent receives no raw answers, attempts, hint events, or teacher-only review rows through sync. Assert the service persists `curriculumVersion:"人教版"` unchanged and rejects generic/unsupported curriculum values before opening the domain transaction. Assert revisioned conflicts serialize only the entity-matching payload, while every append-only conflict returns exactly null payload/hash with `serverPayloadOmitted:true` and never discloses prior content.

Add a cursor regression: materialize a remote assignment after the client's request cursor but before its push; assert the push response cursor equals the request position, then pull and receive that assignment. Repeat with `cursor:null` and a nonzero retention watermark to prove the response cannot skip directly to the current outbox maximum.

- [ ] **Step 2: Run push tests to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/sync-push.test.ts`

Expected: FAIL because push service and route are absent.

- [ ] **Step 3: Implement ordered transactional event application**

```ts
export async function applyPushEvent(tx: PoolClient, actor: Actor, deviceId: string, event: ValidatedPushEvent): Promise<ApplyResult> {
  const digest = sha256(canonicalJson(event));
  const prior = await findInboundByActorAndKey(tx, actor.userId, event.idempotencyKey);
  if (prior) {
    if (!timingSafeEqual(prior.requestHash, digest)) return conflictFor(event, "idempotency_mismatch", prior.revision, prior.payload);
    return { acceptedEventId: prior.eventId };
  }
  const scope = await resolveAuthorizedSyncScope(tx, actor, event);
  const head = await lockEntityHead(tx, scope.type, scope.id, event.entityType, event.entityId);
  if (isAppendOnly(event.entityType) && head) {
    if (head.payloadHash === sha256(canonicalJson(event.payload))) {
      await insertInboundJournal(tx, actor.userId, deviceId, event, digest);
      return { acceptedEventId: event.eventId };
    }
    return conflictFor(event, "forbidden_transition", head.revision, null);
  }
  if (isAppendOnly(event.entityType) && event.baseRevision !== 0) return conflictFor(event, "forbidden_transition", head?.revision ?? 0, null);
  if (!isAppendOnly(event.entityType) && event.operation !== "create" && head?.revision !== event.baseRevision) {
    return conflictFor(event, "revision_conflict", head?.revision ?? 0, head?.payload ?? null);
  }
  await assertEventOwnershipAndDomainRules(tx, actor, scope, event);
  const revision = head ? head.revision + 1 : 1;
  await persistDomainEntity(tx, actor.userId, event, revision);
  await insertInboundJournal(tx, actor.userId, deviceId, event, digest);
  if (event.operation === "delete") await insertTombstone(tx, scope, actor.userId, event, revision, 180);
  await materializeRecipientChanges(tx, actor, event, revision);
  return { acceptedEventId: event.eventId };
}
```

Process request events in array order inside one transaction. `resolveAuthorizedSyncScope` uses user scope for profile, attempt, hint, transfer, review schedule, and manual exam evidence; submission/correction scope is derived from the published assignment and active membership, never from a client class ID. `materializeRecipientChanges` always includes the owning user and projects one class-tagged outbox row to every currently active class owner; it never duplicates the domain record. Each projection receives a deterministic UUID derived from `(eventId,recipientUserId,classId-or-user)` so the same teacher owning two relevant classes receives two distinct class-tagged rows while retries remain idempotent under `UNIQUE(recipient_user_id,change_id)`. Parents receive no raw learning event and must use authorized summary routes. Validation errors reject the whole HTTP request; expected entity conflicts are accumulated and do not mutate that event; unexpected storage errors roll back all accepted mutations. An append-only duplicate with a different event/key is accepted only when the authorized scope, entity ID, and canonical payload hash are identical; otherwise it returns `forbidden_transition` without leaking the prior payload. Append-only retries with the same actor/key/digest are reported as accepted.

The push response cursor is derived only from the validated request cursor. It must never use `max(sync_outbox.sequence)` or any sequence created during this transaction. A null request cursor becomes a signed cursor at the recipient's exclusive lower watermark. If that watermark is nonzero, push may still commit accepted local writes, but the response cursor remains at the watermark and the next pull returns `cursor_expired`, forcing bootstrap rather than skipping unseen data.

- [ ] **Step 4: Verify push contract and storage effects**

Run: `pnpm --dir server test:integration -- tests/integration/sync-push.test.ts`

Expected: push success has exactly three top-level fields, legacy stable IDs remain unchanged, same IDs in different authorized scopes stay isolated, cross-scope references are denied, all eight entity types persist correctly, duplicates do not duplicate rows, conflicts preserve server state, and deletes write a 180-day tombstone.

- [ ] **Step 5: Commit sync push**

```bash
git add server/src/modules/sync server/src/app.ts server/tests/integration/sync-push.test.ts
git commit -m "feat(server): add idempotent sync push"
```

### Task 10: Implement byte-bounded pull, gap-free bootstrap, and recipient retention

**Files:**
- Create: `server/src/modules/sync/cursor.ts`
- Modify: `server/src/modules/sync/repository.ts`
- Modify: `server/src/modules/sync/service.ts`
- Modify: `server/src/modules/sync/routes.ts`
- Test: `server/tests/unit/cursor.test.ts`
- Test: `server/tests/integration/sync-pull.test.ts`
- Test: `server/tests/integration/sync-bootstrap.test.ts`

**Interfaces:**
- Produces: `encodeCursor({userId,lastSequence}, secret)`, `decodeCursor(cursor,userId,secret)`, `encodeBootstrapToken({snapshotId,userId,cutoffSequence,lastSortKey},secret)`, `pull(actor,cursor)`, `bootstrap(actor,pageToken)`, and `purgeRecipientOutbox(now,batchSize)`.
- Page size is dynamically bounded by both 200 items and 900 KiB. A page always includes at least one valid change whose individual serialized size is within the 64-KiB entity cap.

- [ ] **Step 1: Write failing cursor and authorization tests**

```ts
it("rejects cursor tampering and never returns another recipient's row", async () => {
  const page = await pull(studentA, "");
  expect(Object.keys(page.body).sort()).toEqual(["changes", "cursor", "hasMore"]);
  expect(page.body.changes.every((change: SyncChange) => change.entityId !== studentBPrivateEntity)).toBe(true);
  const tampered = `${page.body.cursor.slice(0, -1)}x`;
  const rejected = await pull(studentA, tampered);
  expect(rejected.statusCode).toBe(400);
  expect(rejected.body.code).toBe("invalid_cursor");
});
```

Add tests for 201 small changes yielding 200 plus `hasMore=true`; fewer than 200 large changes stopping below 900 KiB; exact 900-KiB response acceptance; resume without gaps/duplicates; wrong-user cursor/token; assignment/reviewDecision emitted only from dedicated routes; first assignment publication arriving as `create`; tombstone pull; and strict DTO rejection before serialization.

Add retention/bootstrap tests that: create rows before and after the retention boundary; purge in batches while atomically advancing `last_purged_sequence` to the maximum actually deleted sequence; reject cursors with `lastSequence <= last_purged_sequence`; start bootstrap at a fixed outbox cutoff; mutate, delete, and create entities between bootstrap pages; finish bootstrap; then pull from the returned cutoff and prove every committed entity/change is represented by either the bootstrap snapshot or subsequent pull with no missing revision. Include process restart between pages and a tampered/other-user page token.

- [ ] **Step 2: Run cursor and pull tests to verify failure**

Run: `pnpm --dir server test:unit -- tests/unit/cursor.test.ts`

Run: `pnpm --dir server test:integration -- tests/integration/sync-pull.test.ts`

Run: `pnpm --dir server test:integration -- tests/integration/sync-bootstrap.test.ts`

Expected: FAIL because cursor and pull behavior are absent.

- [ ] **Step 3: Implement HMAC cursor and recipient-only query**

```ts
export function encodeCursor(state: CursorState, secret: Uint8Array): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, u: state.userId, s: state.lastSequence.toString() })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function decodeCursor(value: string, expectedUserId: string, secret: Uint8Array): CursorState {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) throw badRequest("invalid_cursor");
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw badRequest("invalid_cursor");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { v: number; u: string; s: string };
  if (decoded.v !== 1 || decoded.u !== expectedUserId || !/^\d+$/.test(decoded.s)) throw badRequest("invalid_cursor");
  return { userId: decoded.u, lastSequence: BigInt(decoded.s) };
}
```

Treat `sync_retention_watermarks.last_purged_sequence` as an exclusive lower bound. Empty pull is valid only when it is zero; otherwise return `409 cursor_expired`. When the watermark is greater than zero, a signed cursor with `lastSequence <= last_purged_sequence` also expires; the initial signed zero cursor remains valid while the watermark is zero. Query authorized recipient rows in sequence order, incrementally serialize the strict response, and stop before either 200 items or 921,600 bytes; set the cursor to the final included sequence and compute `hasMore` from the next authorized row.

The first bootstrap request creates a UUID snapshot ID and signs a token containing that ID, user ID, `cutoffSequence=max(sequence)` for that recipient (or the watermark when empty), and an empty stable sort key. Each page reads the caller's current authorized entities ordered by `(entityType,entityId)`, applies role-based redaction and solution-release policy, and stops at 200/900 KiB. Later pages use the signed last sort key and the same snapshot ID/cutoff. Every response carries that snapshot ID and cutoff cursor; the final response has `nextPageToken:null,complete:true`. The cursor encodes the original cutoff, never scan completion time. Concurrent creates may appear in both bootstrap and pull, and concurrent deletes may appear only as later tombstones; clients upsert by type/ID/revision, so duplicates are harmless and gaps are forbidden.

Membership activation emits the membership and currently published assignments as new outbox changes. It does not expose raw pre-membership attempts; future user-scoped evidence is projected while membership is active. Removal or explicit sharing withdrawal emits a membership tombstone and stops future class projections.

The retention worker claims recipients with `FOR UPDATE SKIP LOCKED`, then examines each recipient's rows strictly in sequence order. It deletes only the contiguous oldest prefix whose `purge_after<=now` and stops at the first retained row, even if a later row is independently eligible. It updates the watermark to the final deleted sequence in the same transaction and therefore never advances past any undeleted row. Tombstones are purged only after their corresponding outbox rows have crossed every recipient watermark.

- [ ] **Step 4: Verify pull pagination, retention, and isolation**

Run: `pnpm --dir server test:unit -- tests/unit/cursor.test.ts`

Run: `pnpm --dir server test:integration -- tests/integration/sync-pull.test.ts`

Run: `pnpm --dir server test:integration -- tests/integration/sync-bootstrap.test.ts`

Expected: pull/bootstrap are strict and below 900 KiB, no cross-recipient data is exposed, restart/resume is stable, retention advances only across deleted rows, and every expired-cursor recovery scenario has no gap.

- [ ] **Step 5: Commit sync pull**

```bash
git add server/src/modules/sync server/tests/unit/cursor.test.ts server/tests/integration/sync-pull.test.ts server/tests/integration/sync-bootstrap.test.ts
git commit -m "feat(server): add gap-free sync pull and bootstrap"
```

### Task 11: Implement assignment drafts and immutable publication

**Files:**
- Create: `server/src/modules/assignments/contracts.ts`
- Create: `server/src/modules/assignments/repository.ts`
- Create: `server/src/modules/assignments/service.ts`
- Create: `server/src/modules/assignments/routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/integration/assignments.test.ts`

**Interfaces:**
- Produces: `POST /v1/assignments`, `POST /v1/assignments/:id/publish`, and `POST /v1/assignments/:id/release-solutions`.
- Draft body: `{classId,title,instructions,dueAt,target:{type:"class"|"group"|"student",id},solutionReleasePolicy,questions:[{questionId,contentVersion,points}]}` with 1-20 questions; class targets use the same `classId`, group targets use a group UUID, and student targets use an active student membership UUID in that class. `questionId` is a client/content stable ID, `contentVersion` is a reviewed immutable server UUID, and `points` is 0.001-1000. Publication rejects `assignment_snapshot_too_large` unless the largest fully released role projection is at most 819,200 UTF-8 JSON bytes, guaranteeing one assignment change fits a 900-KiB sync page.
- First publication emits `operation:"create"` with a strict `AssignmentChangePayload` to every active target membership. Later solution release emits `operation:"update"` at the next revision: the pinned prompt bytes and immutable `contentVersion` do not change, but the authorized projection now contains released answer/solution fields and therefore receives a newly computed, different `contentHash`.

- [ ] **Step 1: Write failing draft/publication tests**

```ts
it("freezes a published snapshot and fans it out only to the target", async () => {
  const draft = await createAssignment(owner, classId, groupAId);
  const published = await publishAssignment(ownerReauthenticated, draft.id, draft.revision);
  expect(published.statusCode).toBe(200);
  expect(published.json().status).toBe("published");
  expect(published.json().publishedSnapshot.questions).toEqual(draft.questions);
  expect(await pulledEntity(studentInGroupA, "assignment", draft.id)).toBeDefined();
  expect(await pulledEntity(studentInGroupB, "assignment", draft.id)).toBeUndefined();
  expect((await updatePublishedAssignment(owner, draft.id)).statusCode).toBe(409);
});
```

Add wrong-class group, wrong-class/inactive student membership, cross-teacher, duplicate publish/idempotency, high-strength requirement, empty/21-question list, 819,200-byte boundary and oversized released projection, due date, unreviewed/withdrawn/mismatched content version, and removed-member cases. Add one student-target test proving that another student in the same group receives no assignment change. For each solution policy, assert that student pull contains the pinned `stem/richStemV1` immediately but returns `publishedAnswer:null,publishedSolution:null,publishedRichSolutionV1:null` until release is authorized; teacher payload remains role-authorized and strict. Capture the pre-release projection, then assert the authorized released projection has byte-identical title/stem/rich stem/options/attachments/grading method and the same `contentVersion`, but a different `contentHash` equal to SHA-256 of the released canonical projection with `contentHash` omitted. Also recompute and verify the original pre-release hash, proving neither hash is copied from the source content version.

- [ ] **Step 2: Run the assignment test to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/assignments.test.ts`

Expected: FAIL because assignment routes are absent.

- [ ] **Step 3: Implement draft creation and publish transaction**

```ts
export async function publishAssignment(actor: Actor, id: string, baseRevision: number, context: AssignmentContext) {
  return withTransaction(context.pool, async (tx) => {
    const assignment = await context.repository.lockAssignment(tx, id);
    authorizeOrThrow(actor, "assignment.publish", await context.repository.resourceContext(tx, assignment.classId));
    if (assignment.status !== "draft" || assignment.revision !== baseRevision) throw conflict("revision_conflict");
    const snapshot = canonicalAssignmentSnapshot(assignment);
    const published = await context.repository.publish(tx, id, baseRevision + 1, snapshot, context.now());
    const recipients = await context.repository.activeTargetRecipients(tx, assignment.id);
    await context.syncOutbox.emitMany(tx, recipients, "assignment", published.id, "create", published.revision, snapshot);
    await appendAudit(tx, context.audit("assignment.publish", assignment, published));
    return published;
  });
}
```

Before publication, lock every `question_content_versions` row and require `status='published'`, matching `questionId`, non-withdrawn rights basis, and a stored SHA-256 over the canonical version payload including strict rich-content AST. The assignment snapshot contains exactly `assignmentId,classId,title,instructions,dueAt,target,solutionReleasePolicy,solutionsReleasedAt,questions,publishedAt`; each question entry is exactly `{points,snapshot}`, and `snapshot` is the `AssignmentQuestionSnapshot` contract with `contentVersion`, `contentHash`, plain/rich stem, options, verified attachments, grading method, release policy, and the three published answer/solution fields. Storage retains the complete immutable source snapshot, while the recipient serializer produces a strict projected snapshot and computes `contentHash=SHA-256(canonical projected snapshot with contentHash omitted)`. Therefore a pre-release projection and later released projection have different hashes but the same immutable `contentVersion`; submissions pin the exact projected version/hash seen while answering. Later content-version withdrawal prevents new assignment publication but does not silently mutate an already assigned snapshot; an administrator can explicitly quarantine a snapshot and notify affected teachers if legal or safety review requires it.

`afterSubmit` is evaluated per student after a valid submission, `afterDue` from server time, `teacherRelease` only after the audited release route, and `never` always sets all three published answer/solution fields to null. A release retry with the same idempotency key returns the original revision. A publish retry with the same key returns the original response.

- [ ] **Step 4: Verify assignment behavior**

Run: `pnpm --dir server test:integration -- tests/integration/assignments.test.ts`

Expected: drafts are owner-scoped, publication is immutable/audited, outbox recipients exactly match active targets, and solution release preserves prompt bytes/contentVersion while changing the projection hash exactly as specified.

- [ ] **Step 5: Commit assignments**

```bash
git add server/src/modules/assignments server/src/app.ts server/tests/integration/assignments.test.ts
git commit -m "feat(server): add assignment publication"
```

### Task 12: Implement online submissions and append-only corrections

**Files:**
- Modify: `server/src/modules/assignments/contracts.ts`
- Modify: `server/src/modules/assignments/repository.ts`
- Modify: `server/src/modules/assignments/service.ts`
- Modify: `server/src/modules/assignments/routes.ts`
- Modify: `server/src/modules/sync/service.ts`
- Test: `server/tests/integration/assignments.test.ts`

**Interfaces:**
- Produces: `POST /v1/submissions` with `{entityId,assignmentId,answers,submittedAt}` and `POST /v1/submissions/:id/corrections` with exactly `{entityId,questionId,answer,explanation}`. The sync `CorrectionPayload` is exactly `{submissionId,questionId,answer,explanation}`; one correction always addresses one submitted question.
- Reuses: one domain service for online routes and `submission`/`correction` sync events, preventing divergent validation.
- Limit: each submission has at most 100 corrections. The HTTP route's 101st insertion returns `409 correction_history_limit_reached`; sync uses the same command and returns the same code in that event's conflict while retaining the established batch HTTP response.

- [ ] **Step 1: Add failing ownership and append-only tests**

```ts
it("does not let a correction overwrite the submitted answer or review", async () => {
  const submission = await submit(student, publishedAssignment, "submission-offline-001");
  const correction = await correct(student, submission.id, "correction-offline-001", submission.answers[0].questionId, "42 N", "补充受力方向说明");
  expect(correction.statusCode).toBe(201);
  expect(await storedSubmissionAnswers(submission.id)).toEqual(submission.answers);
  expect(await correctionCount(submission.id)).toBe(1);
  expect((await correct(otherStudent, submission.id, "correction-offline-002", submission.answers[0].questionId, "0", "无权限")).statusCode).toBe(403);
});
```

Add offline/online same-entity deduplication, unpublished/closed assignment, removed membership, wrong target group, unverified attachment, answer with wrong `contentVersion` or stale/mismatched projected `contentHash`, late submission recording, and teacher-decision immutability cases. Reject duplicate `questionId` entries when the submission is created. Submit a valid multi-question assignment, append separate corrections for two question IDs, and assert each stored correction remains attached to the intended submitted answer. Reject a missing, malformed, other-assignment, or otherwise non-submitted correction `questionId` for both HTTP and sync input without inserting a row or changing review state. Seed 99 corrections, race one HTTP correction and one sync correction for distinct IDs, and assert exactly one becomes row 100; the loser receives the stable `correction_history_limit_reached` domain code (HTTP 409 directly or the sync event conflict), replay does not add a row, and the stored count remains exactly 100. Assert the stored submission retains the exact pinned question snapshot associated with each submitted hash.

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/assignments.test.ts`

Expected: FAIL on missing submission/correction behavior.

- [ ] **Step 3: Implement a shared submission command**

```ts
export async function createSubmission(actor: Actor, input: SubmissionCommand, context: AssignmentContext) {
  return withTransaction(context.pool, async (tx) => {
    const assignment = await context.repository.lockPublishedAssignment(tx, input.assignmentId);
    const membership = await context.repository.activeTargetMembership(tx, assignment, actor.userId);
    authorizeOrThrow(actor, "submission.create", { activeMember: Boolean(membership), ownerUserId: actor.userId });
    await context.content.assertAnswersMatchProjectedSnapshots(tx, actor.userId, assignment, input.answers);
    await context.uploads.assertVerifiedOwned(tx, actor.userId, input.answers.flatMap((answer) => answer.attachmentIds));
    const existing = await context.repository.findSubmissionByClientId(tx, membership.id, input.entityId);
    if (existing) return existing;
    const submission = await context.repository.insertSubmission(tx, membership.id, actor.userId, input);
    await context.repository.ensureReviewCase(tx, submission.id, assignment.classId);
    await context.syncOutbox.emitSubmission(tx, actor.userId, assignment.createdBy, submission);
    return submission;
  });
}
```

`assertAnswersMatchProjectedSnapshots` rejects duplicate submitted question IDs and accepts only the canonical pre-release or released projection hash derived from each pinned content version and the student's release state; it never accepts a same-ID local question or arbitrary client hash. This permits offline work begun before a release and submitted afterward while preserving the exact review snapshot. Before inserting a correction, the shared HTTP/sync command locks the owning submission row, checks `COUNT(corrections)<100` under that lock, locates exactly one answer with the supplied `questionId`, and verifies that answer against the assignment's pinned question snapshot/content version; a question appearing only in another submission or assignment is invalid. At the limit it returns `correction_history_limit_reached` before journal/outbox/domain insertion. Corrections persist `question_id`, insert a new row and pull change, and never update `submissions.answers`, `review_cases`, or `review_decisions`. Store whether `submittedAt` is after `dueAt` as derived response metadata without rejecting valid offline work.

- [ ] **Step 4: Verify route/sync parity**

Run: `pnpm --dir server test:integration -- tests/integration/assignments.test.ts tests/integration/sync-push.test.ts`

Expected: online and sync inputs create the same normalized rows, same stable IDs deduplicate within membership scope, and corrections remain append-only, bound to one valid submitted question, and capped at 100 under concurrent writers.

- [ ] **Step 5: Commit submissions**

```bash
git add server/src/modules/assignments server/src/modules/sync/service.ts server/tests/integration/assignments.test.ts server/tests/integration/sync-push.test.ts
git commit -m "feat(server): add submissions and corrections"
```

### Task 13: Implement teacher review, rejudgment, and immutable audit history

**Files:**
- Create: `server/src/modules/reviews/contracts.ts`
- Create: `server/src/modules/reviews/repository.ts`
- Create: `server/src/modules/reviews/service.ts`
- Create: `server/src/modules/reviews/routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/integration/reviews.test.ts`

**Interfaces:**
- Produces: `GET /v1/reviews?classId=&status=&cursor=` returning exactly `{items,nextCursor}`, `GET /v1/reviews/:id` returning the strict role-discriminated `TeacherReviewDetail | StudentReviewDetail` below, and `POST /v1/reviews/:id/decision` accepting exactly the discriminated `ReviewDecisionRequest` and returning exactly `ReviewDecisionResponse` below. The request has no client-supplied total score; the server derives it from `perQuestionScores`.
- `ReviewQueueItem` is exactly `{reviewId,submissionId,assignmentId,membershipId,studentUserId,studentDisplayName,status,score,revision,submittedAt,latestDecisionAt}`. Queue status is `pending|approved|returned|rejudged`; `pending` requires `score:null`, every other status requires a server-derived percentage from 0 through 100, and the list never embeds answers, snapshots, attachments, corrections, automatic issues or decisions.
- Limit: each review case has at most 100 decisions. The 101st attempt returns `409 review_decision_history_limit_reached`; the case head, decision history, audit, and outbox remain unchanged.

```ts
type ReviewStatus = "pending" | "approved" | "returned" | "rejudged";

interface ReviewDecisionRequestBase {
  perQuestionScores: ReviewPerQuestionScoreV1[];
  reason: string;
  annotation: ReviewAnnotationV1;
  baseRevision: number;
}

type ReviewDecisionRequest =
  | (ReviewDecisionRequestBase & { decision: "approve" })
  | (ReviewDecisionRequestBase & { decision: "return" })
  | (ReviewDecisionRequestBase & { decision: "rejudge" });

interface ReviewDecisionResponseBase {
  reviewId: string;
  revision: number;
  score: number;
  perQuestionScores: ReviewPerQuestionScoreV1[];
  decisionId: string;
}

type ReviewDecisionResponse =
  | (ReviewDecisionResponseBase & { decision: "approve"; status: "approved" })
  | (ReviewDecisionResponseBase & { decision: "return"; status: "returned" })
  | (ReviewDecisionResponseBase & { decision: "rejudge"; status: "rejudged" });

interface VerifiedReviewAttachmentV1 {
  uploadId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  status: "verified";
}

interface ReviewAnswerDetailV1 {
  questionId: ClientStableId;
  contentVersion: string;
  contentHash: string;
  points: number;
  snapshot: AssignmentQuestionSnapshot;
  answer: string;
  attachmentRefs: VerifiedReviewAttachmentV1[];
}

interface ReviewCorrectionDetailV1 {
  correctionId: string;
  questionId: ClientStableId;
  answer: string;
  explanation: string;
  createdAt: string;
}

interface AutomaticReviewIssueV1 {
  questionId: ClientStableId;
  code: "unit" | "signDirection" | "significantFigures" | "numericTolerance" | "format" | "notCheckable";
  severity: "info" | "warning";
  location: string;
  reason: string;
  suggestion: string;
}

interface TeacherGradingReferenceV1 {
  questionId: ClientStableId;
  contentVersion: string;
  gradingMethod: "choice" | "numeric" | "text" | "teacherReview";
  answer: string;
  solution: string;
  richSolutionV1: RichContentV1 | null;
}

interface TeacherReviewDecisionBaseV1 {
  decisionId: string;
  revision: number;
  actorUserId: string;
  actorDisplayName: string;
  previousStatus: ReviewStatus;
  previousScore: number | null;
  nextScore: number;
  perQuestionScores: ReviewPerQuestionScoreV1[];
  reason: string;
  annotation: ReviewAnnotationV1;
  decidedAt: string;
}

type TeacherReviewDecisionV1 =
  | (TeacherReviewDecisionBaseV1 & { decision: "approve"; nextStatus: "approved" })
  | (TeacherReviewDecisionBaseV1 & { decision: "return"; nextStatus: "returned" })
  | (TeacherReviewDecisionBaseV1 & { decision: "rejudge"; nextStatus: "rejudged" });

interface StudentReviewDecisionBaseV1 {
  decisionId: string;
  revision: number;
  score: number;
  perQuestionScores: ReviewPerQuestionScoreV1[];
  reason: string;
  annotation: StudentVisibleReviewAnnotationV1;
  decidedAt: string;
}

type StudentReviewDecisionV1 =
  | (StudentReviewDecisionBaseV1 & { decision: "approve"; status: "approved" })
  | (StudentReviewDecisionBaseV1 & { decision: "return"; status: "returned" })
  | (StudentReviewDecisionBaseV1 & { decision: "rejudge"; status: "rejudged" });

interface ReviewDetailBaseV1 {
  reviewId: string;
  submissionId: string;
  assignment: { assignmentId: string; title: string; dueAt: string | null };
  status: ReviewStatus;
  score: number | null;
  perQuestionScores: ReviewPerQuestionScoreV1[] | null;
  revision: number;
  submittedAt: string;
  latestDecisionAt: string | null;
  reviewCreatedAt: string;
  updatedAt: string;
  submittedLate: boolean;
  answers: ReviewAnswerDetailV1[];
  corrections: ReviewCorrectionDetailV1[];
  automaticIssues: AutomaticReviewIssueV1[];
}

interface TeacherReviewDetail extends ReviewDetailBaseV1 {
  view: "teacher";
  membershipId: string;
  student: { userId: string; displayName: string };
  gradingReferences: TeacherGradingReferenceV1[];
  decisions: TeacherReviewDecisionV1[];
}

interface StudentReviewDetail extends ReviewDetailBaseV1 {
  view: "student";
  decisions: StudentReviewDecisionV1[];
}
```

Every object above is `additionalProperties:false`. Detail limits are exact: answers 1—100, points 0.001—1000 with at most three decimals, answer text 30,000 UTF-8 bytes, at most 10 verified attachments per answer, corrections 0—100, automatic issues 0—100, decisions 0—100, fileName 255 characters, mimeType 120, location/reason/suggestion 1,000 characters each. `perQuestionScores` is a strict 1—100 item array; each item is exactly `{questionId,scoreEarned,pointsPossible}`, IDs are unique and cover every submitted answer exactly once, `pointsPossible` equals that answer's pinned assignment points, and both numeric fields have at most three decimals with `0≤scoreEarned≤pointsPossible`. The positive denominator is the sum of pinned points. The server converts decimals to integer millipoints and derives `score=roundHalfUp(100000×ΣscoreEarnedMilli/ΣpointsPossibleMilli)/1000`; it never accepts a client total score. Thus every stored/output decision score is a deterministic 0—100 percentage with at most three decimals. At the review head, `pending` requires `score:null,perQuestionScores:null`; `approved|returned|rejudged` require the latest decision's non-null score and complete score array. `ReviewAnnotationV1` is exactly `{overallComment,items}`; `overallComment` is student-visible, null or at most 1,000 characters, items is 0—50, and each item is exactly `{questionId,category,visibility,location,comment}` with a non-null `questionId` belonging to exactly one current submitted answer, location null or at most 500 characters, and a non-empty comment of at most 1,000 characters. Unknown annotation keys, null/foreign/ambiguous question IDs, and a client-supplied total `score` fail validation. `reason` is a non-empty student-visible explanation of at most 1,000 characters and is included unchanged in the student decision DTO; internal identifiers, moderation notes, or staff-only commentary must not be placed there and are accepted only as an annotation item with `visibility:"teacherOnly"`. `StudentVisibleReviewAnnotationV1` uses the same shape but only permits `visibility:"student"`; the server filters every `teacherOnly` item before validating/serializing the student projection. The decision DTOs are strict discriminated unions: approve has only `approved`, return only `returned`, and rejudge only `rejudged`; `pending` is impossible after a decision. Every answer `snapshot` is byte-for-byte the student's pinned projection and must validate its submitted `contentHash`; it is never replaced by a teacher projection. Every correction carries a `questionId` that must match exactly one answer and pinned snapshot in this detail; serialization fails closed on orphaned or ambiguous legacy rows. Teacher-only `gradingReferences` are resolved from the same immutable `contentVersion`, contain the reviewed answer/solution separately, and have exactly one entry per answer. The student DTO omits `membershipId`, `student`, `gradingReferences`, every actor ID/name and teacher-only before-state fields; solution visibility for students continues only through the assignment release projection, never through review detail. Both views contain only the caller-authorized review, safe automatic feedback and verified metadata, never password/session/device fields or raw storage keys. Corrections sort by `(createdAt,correctionId)` and decisions by `(revision,decisionId)`; no old row is overwritten. Attachment bytes are obtained only through the separately authorized short-lived download route; metadata is not an authorization grant.
- Emits: append-only `review_decisions`, updated review-case head, audit before/after, and `reviewDecision` pull changes to student and owner teacher in one transaction.

- [ ] **Step 1: Write failing decision-history tests**

```ts
it("appends a rejudgment without rewriting the first decision", async () => {
  const approved = await decide(ownerReauthenticated, reviewId, { decision: "approve", perQuestionScores: [{ questionId: q1, scoreEarned: 32, pointsPossible: 40 }, { questionId: q2, scoreEarned: 48, pointsPossible: 60 }], reason: "建模正确，单位书写需要继续保持。", annotation: { overallComment: null, items: [] }, baseRevision: 1 });
  const rejudged = await decide(ownerReauthenticated, reviewId, { decision: "rejudge", perQuestionScores: [{ questionId: q1, scoreEarned: 36, pointsPossible: 40 }, { questionId: q2, scoreEarned: 54, pointsPossible: 60 }], reason: "复核计算步骤后修正计分。", annotation: { overallComment: null, items: [{ questionId: q2, category: "单位", visibility: "student", location: "第 2 步", comment: "单位换算应计入该步得分。" }] }, baseRevision: 2 });
  expect(rejudged.statusCode).toBe(200);
  expect(approved.json()).toMatchObject({ decision: "approve", status: "approved", score: 80 });
  expect(rejudged.json()).toMatchObject({ decision: "rejudge", status: "rejudged", score: 90 });
  expect(await decisionScores(reviewId)).toEqual([80, 90]);
  expect(await auditActions(reviewId)).toEqual(["review.approve", "review.rejudge"]);
});
```

Add queue pagination/status filtering, strict teacher/student detail unions, student-view rejection of teacher-only identity/before-state/grading-reference fields, exact pinned snapshot hash plus same-version teacher grading reference, exact annotation keys and limits, duplicate/oversized detail arrays, submission-to-review ID discoverability, stale revision, missing/student-visible reason, ordinary-strength session, non-owner/cross-class teacher, owning versus other student detail, return-for-redo, retry idempotency, and teacher precedence over pushed temporary status. Table-test the decision/status union (`approve→approved`, `return→returned`, `rejudge→rejudged`) and reject `pending`, mismatched outcome pairs, a client total `score`, duplicate/missing/foreign score question IDs, wrong `pointsPossible`, negative/over-point earned values, more than three decimals, zero denominator, and non-finite values. Verify deterministic weighted rounding at half-thousandth boundaries and exact 0/100 endpoints. Reject null/foreign annotation question IDs; prove `reason` is present unchanged in the student DTO while `teacherOnly` annotation items are absent there. Seed 99 decisions and race two valid high-strength decisions at the same next revision using distinct idempotency keys; exactly one becomes decision 100 and updates the head/outbox/audit, while the other receives `409 review_decision_history_limit_reached`, and retry/count remain stable. For a multi-question submission with corrections on two answers, assert every `ReviewCorrectionDetailV1.questionId` matches exactly one returned answer/pinned snapshot, the ordering remains `(createdAt,correctionId)`, and an orphaned/ambiguous legacy correction causes fail-closed serialization rather than reassignment. Assert that a teacher can obtain `reviewId` and `baseRevision` from queue/detail before deciding and that no route requires guessing a review ID from a submission ID.

- [ ] **Step 2: Run review tests to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/reviews.test.ts`

Expected: FAIL because review routes are absent.

- [ ] **Step 3: Implement append-only review decisions**

```ts
export async function decideReview(actor: Actor, reviewId: string, input: ReviewDecisionRequest, context: ReviewContext) {
  return withTransaction(context.pool, async (tx) => {
    const before = await context.repository.lockCase(tx, reviewId);
    authorizeOrThrow(actor, "review.decide", await context.repository.resourceContext(tx, before.classId));
    if (await context.repository.countDecisions(tx, reviewId) >= 100) throw conflict("review_decision_history_limit_reached");
    if (before.revision !== input.baseRevision) throw conflict("revision_conflict");
    const grading = await validateAndNormalizePerQuestionScores(tx, before.submissionId, input.perQuestionScores);
    await assertStudentVisibleReason(input.reason);
    await assertAnnotationQuestionIds(tx, before.submissionId, input.annotation);
    const next = transitionReview(before, input.decision, grading.score, grading.perQuestionScores);
    const decision = await context.repository.insertDecision(tx, actor.userId, before, next, input, grading);
    await context.repository.updateCaseHead(tx, before.id, next);
    await context.syncOutbox.emitReviewDecision(tx, before, decision);
    await appendAudit(tx, context.audit(`review.${input.decision}`, before, next, input.reason));
    return { reviewId, revision: next.revision, decision: input.decision, status: next.status, score: grading.score, perQuestionScores: grading.perQuestionScores, decisionId: decision.id };
  });
}
```

`validateAndNormalizePerQuestionScores` loads the unique submitted answers and their pinned assignment points under the locked review case, requires exact set equality, exact `pointsPossible`, and the numeric bounds above, then parses each value to integer millipoints and applies the documented half-up formula. It stores the canonical per-question array and derived percentage; no client total is accepted. `transitionReview` is an exhaustive decision switch returning only the corresponding non-pending status. Count-before-revision ordering makes the capacity error stable after row 100 even for a stale concurrent request. Queue and detail queries join `review_cases`, `submissions`, target membership, assignment snapshot, corrections, and decisions under one centralized class-owner policy. Pagination cursors are signed and class-bound. Student detail returns only the student's own case and student-visible decisions; `reason` is always included, while teacher-only annotations designated internal are never serialized to students. `emitReviewDecision` uses the exact strict discriminated DTO from Immutable Client Contracts, including `reviewId`, `submissionId`, `revision`, `decision`, matching `status`, derived `score`, canonical `perQuestionScores`, and `decidedAt`.

- [ ] **Step 4: Verify review authority and history**

Run: `pnpm --dir server test:integration -- tests/integration/reviews.test.ts tests/integration/sync-pull.test.ts`

Expected: decisions and audit are append-only and capped at 100, stale writes fail below the cap, scores are deterministic weighted percentages, outcome/status pairs are exact, teacher result wins, and pull exposes student-safe ordered decisions only to authorized recipients.

- [ ] **Step 5: Commit review and rejudgment**

```bash
git add server/src/modules/reviews server/src/app.ts server/tests/integration/reviews.test.ts server/tests/integration/sync-pull.test.ts
git commit -m "feat(server): add review and rejudgment audit"
```

### Task 14: Implement CSV/XLSX exam-record import jobs

**Files:**
- Create: `server/src/modules/exam-import/contracts.ts`
- Create: `server/src/modules/exam-import/repository.ts`
- Create: `server/src/modules/exam-import/service.ts`
- Create: `server/src/modules/exam-import/routes.ts`
- Create: `server/src/workers/exam-import-worker.ts`
- Test: `server/tests/integration/exam-import.test.ts`

**Interfaces:**
- Produces: `POST /v1/exam-records/import` with `{classId,uploadId}` and response `{batchId,status:"queued"}`.
- Input columns are exactly `studentNumber`, `examName`, `occurredOn`, `score`, and `maxScore`; XLSX reads the first visible worksheet only and caps at 10,000 data rows.

- [ ] **Step 1: Write failing row-validation tests**

```ts
it("keeps valid, duplicate, invalid, and unmatched rows distinguishable", async () => {
  const batch = await queueExamImport(owner, classId, verifiedWorkbookId);
  await runExamImportJob(batch.batchId);
  expect(await importRowStatuses(batch.batchId)).toEqual([
    "valid",
    "duplicate",
    "invalid",
    "unmatched",
  ]);
  expect(await examRecordCount(batch.batchId)).toBe(1);
});
```

Add wrong class, unverified/wrong-purpose upload, formula-cell rejection, date parsing, score above maximum, duplicate student number, 10,001-row rejection, CSV UTF-8, and no overwrite of application attempts.

- [ ] **Step 2: Run import tests to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/exam-import.test.ts`

Expected: FAIL because import service/worker are absent.

- [ ] **Step 3: Implement deterministic parsing and append-only evidence creation**

```ts
export function validateExamRow(row: RawExamRow): ValidatedExamRow | RowError {
  if (!row.studentNumber.trim()) return { code: "student_number_required" };
  if (!row.examName.trim() || row.examName.length > 160) return { code: "exam_name_invalid" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.occurredOn)) return { code: "occurred_on_invalid" };
  const score = Number(row.score);
  const maxScore = Number(row.maxScore);
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore) {
    return { code: "score_invalid" };
  }
  return { studentNumber: row.studentNumber.trim(), examName: row.examName.trim(), occurredOn: row.occurredOn, score, maxScore };
}
```

The worker streams CSV, reads XLSX values without evaluating formulas, persists every row status, and inserts `exam_records.source='import'` only for unique valid matched rows. It writes per-student `examRecord` pull changes and a completion audit event in the same final transaction.

- [ ] **Step 4: Verify imports**

Run: `pnpm --dir server test:integration -- tests/integration/exam-import.test.ts`

Expected: row outcomes are stable, only valid rows create evidence, no existing attempt is updated, and rerunning the job is idempotent.

- [ ] **Step 5: Commit exam import**

```bash
git add server/src/modules/exam-import server/src/workers/exam-import-worker.ts server/tests/integration/exam-import.test.ts
git commit -m "feat(server): add validated exam imports"
```

### Task 15: Implement signed uploads and post-upload verification

**Files:**
- Create: `server/src/infrastructure/object-storage.ts`
- Create: `server/src/modules/uploads/contracts.ts`
- Create: `server/src/modules/uploads/repository.ts`
- Create: `server/src/modules/uploads/service.ts`
- Create: `server/src/modules/uploads/routes.ts`
- Create: `server/src/workers/upload-verification-worker.ts`
- Test: `server/tests/unit/upload-policy.test.ts`
- Test: `server/tests/integration/uploads.test.ts`

**Interfaces:**
- Produces: `POST /v1/uploads/presign` with `{purpose,fileName,mimeType,sizeBytes,sha256Hex}` and `{uploadId,method:"PUT",url,headers,expiresAt}`; `POST /v1/uploads/:id/complete` returns `{uploadId,status:"verifying"}`; `GET /v1/uploads/:id` returns exactly `{uploadId,status,failureCode,verifiedAt}` where status is `presigned|uploaded|verifying|verified|rejected|deleted` and unavailable fields are `null`.
- `GET /v1/uploads/:id/download` accepts exactly the `UploadDownloadQuery` strict union: `{contextType:"own"}`, `{contextType:"assignment"|"review"|"questionContent",contextId:string}`, or `{contextType:"questionContentReview",contextId:string}`. It returns exactly `{uploadId,method:"GET",url,expiresAt}` with `Cache-Control:no-store`; URL expiry is 60 seconds. `own` requires upload ownership. `assignment`, `review`, and published `questionContent` retain their existing exact reference plus resource-role authorization. `questionContentReview` interprets `contextId` only as a canonical `contentVersion`, first requires an administrator high-strength session, then requires the verified upload to occur in that exact version's review-detail attachment set. Teacher/student/parent callers, guessed or malformed version IDs, non-referenced attachments, and inaccessible objects return 404 without revealing existence; an ordinary-strength administrator returns `403 reauthentication_required` before lookup. Missing `contextId` where required, a `contextId` on `own`, mixed/unknown fields, non-verified/quarantined/deleted objects, removed membership, unreleased content, wrong class, or forged context fail closed. The response never exposes bucket/key, credentials or a reusable authorization token.
- Produces an injected `UploadContextAuthorizers` interface with one exact method per non-own context. Task 15 tests `questionContentReview` against an inert/fake callback; Task 22 supplies the real content-version reference authorizer through the composition root, so uploads never import the later question-content module.
- Policies: feedback images 10 MiB; submission images/PDF 30 MiB; exam CSV/XLSX 10 MiB; administrator account-import CSV/XLSX 10 MiB; `reportArtifact`, `credentialArtifact`, and `privacyExport` are worker-only even though their verified metadata uses the uploads table.

- [ ] **Step 1: Write failing policy and verification tests**

```ts
it("does not trust declared MIME before signature verification", async () => {
  const signed = await presign(student, {
    purpose: "feedbackAttachment",
    fileName: "screen.png",
    mimeType: "image/png",
    sizeBytes: maliciousPdfBytes.length,
    sha256Hex: sha256Hex(maliciousPdfBytes),
  });
  await putSignedObject(signed, maliciousPdfBytes, "image/png");
  await completeUpload(student, signed.uploadId);
  await runVerificationJob(signed.uploadId);
  expect(await getUploadStatus(student, signed.uploadId)).toEqual({
    uploadId: signed.uploadId,
    status: "rejected",
    failureCode: "file_signature_mismatch",
    verifiedAt: null,
  });
});
```

Add size mismatch, checksum mismatch, wrong owner status read, cross-user status denial, expired upload URL, unsupported extension, wrong purpose, verified happy paths, truthful polling transitions `verifying -> verified|rejected`, strict response fields, and an assertion that unverified objects cannot attach to feedback/submissions. Download tests cover all five context types, 60-second expiry/no-store, assignment solution-release redaction, same-class but unreferenced object, removed member, cross-class review, and unchanged published `questionContent` authorization. For `questionContentReview`, prove a high-strength administrator can download an actually referenced verified draft attachment using `contextId=contentVersion`, while ordinary-strength administrator, teacher, student, parent, guessed/malformed version, other-version attachment, same-version non-referenced attachment, unverified object, and unknown/mixed query fields fail with the exact policy above. Also cover withdrawn/quarantined published content and object-state races; metadata visibility alone must not authorize bytes.

- [ ] **Step 2: Run upload tests to verify failure**

Run: `pnpm --dir server test:unit -- tests/unit/upload-policy.test.ts`

Run: `pnpm --dir server test:integration -- tests/integration/uploads.test.ts`

Expected: FAIL because upload modules are absent.

- [ ] **Step 3: Implement constrained SigV4 PUT and verification**

```ts
export async function presignUpload(actor: Actor, input: PresignInput, context: UploadContext): Promise<PresignResponse> {
  assertUploadPolicy(actor, input);
  const uploadId = context.ids.uuid();
  const objectKey = `${actor.userId}/${input.purpose}/${uploadId}`;
  await context.repository.insertPresigned({
    id: uploadId,
    ownerUserId: actor.userId,
    purpose: input.purpose,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    sha256Hex: input.sha256Hex,
    objectKey,
    expiresAt: addSeconds(context.now(), 600),
  });
  const command = new PutObjectCommand({
    Bucket: context.bucket,
    Key: objectKey,
    ContentType: input.mimeType,
    ChecksumSHA256: Buffer.from(input.sha256Hex, "hex").toString("base64"),
    Metadata: { uploadid: uploadId },
  });
  const url = await getSignedUrl(context.s3, command, { expiresIn: 600 });
  return { uploadId, method: "PUT", url, headers: { "content-type": input.mimeType, "x-amz-checksum-sha256": Buffer.from(input.sha256Hex, "hex").toString("base64") }, expiresAt: addSeconds(context.now(), 600).toISOString() };
}
```

The verifier obtains object metadata and a bounded stream, rejects size/checksum mismatch, detects content using `file-type`, allows CSV only after UTF-8/text control-byte checks, and transitions `verifying -> verified|rejected` atomically. Rejected objects are deleted from the bucket after the database state commits. The status route reads only the owner's row, never exposes object keys or signed URLs, and maps the internal rejection code to the stable public `failureCode` required by client polling. The download route authorizes before resolving an object key, then signs one exact GET object without redirects; it does not reuse the upload PUT signer or accept a client-provided key/URL. Its `questionContentReview` authorizer reuses the same administrator high-strength and version lookup policy as Task 22 review detail, then performs an exact `(contentVersion,uploadId,verified metadata)` reference match; it never falls back to upload ownership or published-content authorization.

- [ ] **Step 4: Verify upload trust boundary**

Run: `pnpm --dir server test:unit -- tests/unit/upload-policy.test.ts`

Run: `pnpm --dir server test:integration -- tests/integration/uploads.test.ts`

Expected: only policy-compliant, checksum-valid, signature-valid objects reach `verified`; all attachment consumers reject other states, and every download context requires an exact authorized reference with the dedicated draft-review boundary preserved.

- [ ] **Step 5: Commit uploads**

```bash
git add server/src/infrastructure/object-storage.ts server/src/modules/uploads server/src/workers/upload-verification-worker.ts server/tests/unit/upload-policy.test.ts server/tests/integration/uploads.test.ts
git commit -m "feat(server): add verified signed uploads"
```

### Task 16: Dispatch database outbox rows to idempotent BullMQ workers

**Files:**
- Create: `server/src/infrastructure/queues.ts`
- Create: `server/src/modules/jobs/repository.ts`
- Create: `server/src/modules/jobs/dispatcher.ts`
- Modify: `server/src/worker-main.ts`
- Test: `server/tests/integration/jobs.test.ts`

**Interfaces:**
- Produces: `dispatchBatch(limit: 100): Promise<number>`, `runRetentionBatch(now,limit): Promise<RetentionResult>`, and queues `verify-upload`, `send-feedback`, `generate-report`, `import-exam`, `import-accounts`, and `delete-account` with deterministic job ID `<topic>-<outboxUuid>`.

- [ ] **Step 1: Write the failing crash/retry test**

```ts
it("re-dispatches a claimed row without duplicating the BullMQ job", async () => {
  const row = await insertJobOutbox("generateReport", reportId);
  await dispatcher.dispatchBatch(100);
  await markOutboxPendingAsIfDispatcherCrashed(row.id);
  await dispatcher.dispatchBatch(100);
  expect(await queueJobCount(`generateReport-${row.id}`)).toBe(1);
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/jobs.test.ts`

Expected: FAIL because dispatcher and queues are absent.

- [ ] **Step 3: Implement claim and deterministic enqueue**

```ts
export async function dispatchBatch(limit = 100): Promise<number> {
  const rows = await repository.claimWithSkipLocked(limit);
  for (const row of rows) {
    try {
      await queues[row.topic].add(row.topic, row.payload, { jobId: `${row.topic}-${row.id}`, attempts: 5, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: false, removeOnFail: false });
      await repository.markDispatched(row.id);
    } catch (error) {
      await repository.releaseWithBackoff(row.id, publicErrorCode(error));
    }
  }
  return rows.length;
}
```

`claimWithSkipLocked` uses `FOR UPDATE SKIP LOCKED`, increments attempts, and recovers `dispatching` rows older than 5 minutes. Domain requests insert their aggregate row and `job_outbox` row in one PostgreSQL transaction. A scheduled retention loop calls the Task 10 purge transaction in bounded batches, exports purged counts/watermark lag metrics, and does not share a transaction or lock order with BullMQ dispatch. Extend the integration test with two retention workers racing and prove the watermark cannot advance beyond an eligible row that was not deleted.

- [ ] **Step 4: Verify outbox recovery**

Run: `pnpm --dir server test:integration -- tests/integration/jobs.test.ts`

Expected: one queue job per outbox UUID after retry and multi-dispatcher races.

- [ ] **Step 5: Commit queue infrastructure**

```bash
git add server/src/infrastructure/queues.ts server/src/modules/jobs server/src/worker-main.ts server/tests/integration/jobs.test.ts
git commit -m "feat(server): dispatch transactional jobs"
```

### Task 17: Queue feedback and deliver real email status

**Files:**
- Create: `server/src/modules/feedback/contracts.ts`
- Create: `server/src/modules/feedback/repository.ts`
- Create: `server/src/modules/feedback/service.ts`
- Create: `server/src/modules/feedback/routes.ts`
- Create: `server/src/workers/feedback-worker.ts`
- Test: `server/tests/integration/feedback.test.ts`

**Interfaces:**
- Produces: `POST /v1/feedback` body `{category,description,currentPage,contact,appVersion,systemType,redactedLogs,attachmentIds,confirmed:true}` and response `{feedbackId,status:"queued"}`; `GET /v1/feedback/:id` response `{feedbackId,status,attemptCount,sentAt,lastErrorCode}` where public `status` is exactly `queued|retrying|sent|failed`.

- [ ] **Step 1: Write failing truthful-status test**

```ts
it("does not report sent until SMTP succeeds", async () => {
  const created = await submitFeedback(student, validConfirmedFeedback());
  expect(created.body).toEqual({ feedbackId: expect.any(String), status: "queued" });
  smtp.failNext("ETIMEDOUT");
  await runFeedbackJob(created.body.feedbackId);
  expect((await getFeedback(student, created.body.feedbackId)).body.status).toBe("retrying");
  await runFeedbackJob(created.body.feedbackId);
  expect((await getFeedback(student, created.body.feedbackId)).body.status).toBe("sent");
  expect(smtp.lastMessage.to).toBe("luo865265@gmail.com");
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/feedback.test.ts`

Expected: FAIL because feedback routes and worker are absent.

- [ ] **Step 3: Implement fixed-recipient delivery**

```ts
const FEEDBACK_RECIPIENT = "luo865265@gmail.com" as const;
export async function sendFeedbackJob(job: Job<{ feedbackId: string }>, deps: FeedbackWorkerDeps) {
  const feedback = await deps.repository.lockForDelivery(job.data.feedbackId);
  if (feedback.status === "sent") return;
  await deps.repository.markDeliverySending(feedback.id);
  const info = await deps.mailer.sendMail({
    to: FEEDBACK_RECIPIENT,
    from: deps.config.smtpFrom,
    messageId: `<feedback-${feedback.id}@physics-studio.invalid>`,
    subject: `[物理研习室反馈 ${feedback.id}] ${feedback.category}`,
    text: renderFeedbackText(feedback),
    attachments: await deps.attachments.forVerifiedFeedback(feedback.id),
  });
  await deps.repository.markSent(feedback.id, info.messageId, deps.now());
}
```

Reject `confirmed!==true`, unverified/foreign attachments, more than 3 attachments, description outside 10-10,000 bytes, and logs containing configured secret/token patterns. SMTP errors store only a stable error code, retry exponentially, and never expose credentials or raw stack traces.

- [ ] **Step 4: Verify feedback privacy and state**

Run: `pnpm --dir server test:integration -- tests/integration/feedback.test.ts`

Expected: queued/retrying/sent/failed are truthful; only the fixed recipient is used; another user cannot read the record.

- [ ] **Step 5: Commit feedback delivery**

```bash
git add server/src/modules/feedback server/src/workers/feedback-worker.ts server/tests/integration/feedback.test.ts
git commit -m "feat(server): queue feedback email"
```

### Task 18: Generate authorized report artifacts in background jobs

**Files:**
- Create: `server/src/modules/reports/contracts.ts`
- Create: `server/src/modules/reports/repository.ts`
- Create: `server/src/modules/reports/service.ts`
- Create: `server/src/modules/reports/routes.ts`
- Create: `server/src/workers/report-worker.ts`
- Test: `server/tests/integration/reports.test.ts`

**Interfaces:**
- Produces: `POST /v1/reports` with `{reportType,format,scopeType,scopeId}` and `{reportId,status:"queued"}`; `GET /v1/reports/:id` with `{reportId,status,failureCode,downloadUrl,downloadExpiresAt}`.

- [ ] **Step 1: Write the failing authorization/artifact test**

```ts
it("returns a download only after an authorized artifact completes", async () => {
  const job = await createReport(owner, { reportType: "classLearningSummary", format: "csv", scopeType: "class", scopeId: classId });
  expect((await getReport(owner, job.reportId)).body.downloadUrl).toBeNull();
  await runReportJob(job.reportId);
  expect((await getReport(owner, job.reportId)).body).toMatchObject({ status: "completed", downloadUrl: expect.stringMatching(/^http/), downloadExpiresAt: expect.any(String) });
  expect((await getReport(otherTeacher, job.reportId)).statusCode).toBe(403);
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/reports.test.ts`

Expected: FAIL because report routes/worker are absent.

- [ ] **Step 3: Implement deterministic JSON/CSV generation**

```ts
export async function generateReport(jobId: string, deps: ReportWorkerDeps): Promise<void> {
  const job = await deps.repository.lockQueued(jobId);
  if (job.status === "completed") return;
  await deps.repository.markRunning(job.id, deps.now());
  const rows = await deps.repository.authorizedRows(job);
  const bytes = job.format === "csv" ? encodeUtf8Csv(rows) : Buffer.from(JSON.stringify({ schemaVersion: 1, rows }), "utf8");
  const upload = await deps.artifacts.putVerified(job.requestedBy, job.id, bytes, job.format === "csv" ? "text/csv" : "application/json");
  await deps.repository.complete(job.id, upload.id, rows.length, deps.now());
}
```

Student reports are self-only, parent reports require an active guardian link, teachers require class ownership, and only administrators may request `auditExport`. Download URLs expire after 300 seconds and are generated only at GET time.

- [ ] **Step 4: Verify reports**

Run: `pnpm --dir server test:integration -- tests/integration/reports.test.ts`

Expected: jobs are idempotent, artifacts are verified, permissions are enforced at create and read time, and queued/failed jobs have null download fields.

- [ ] **Step 5: Commit reports**

```bash
git add server/src/modules/reports server/src/workers/report-worker.ts server/tests/integration/reports.test.ts
git commit -m "feat(server): add report jobs"
```

### Task 19: Add readiness, protected metrics, Docker development, and AI isolation

**Files:**
- Create: `server/src/infrastructure/metrics.ts`
- Create: `server/src/modules/health/routes.ts`
- Create: `server/Dockerfile`
- Create: `server/Dockerfile.ai`
- Create: `server/compose.yaml`
- Modify: `server/src/app.ts`
- Modify: `server/src/main.ts`
- Modify: `server/src/worker-main.ts`
- Modify: `server/README.md`
- Test: `server/tests/integration/health.test.ts`
- Test: `server/tests/integration/security.test.ts`

**Interfaces:**
- Produces: exact `GET /health/live`, `GET /health/ready`, and protected/internal `GET /metrics` contracts.
- Development ports: business API `8790`, AI gateway `8787`, PostgreSQL host `54329`, Redis host `63799`, MinIO API `9000`, MinIO console `9001`, Mailpit SMTP `1025`, Mailpit UI `8025`.

- [ ] **Step 1: Write failing health/metrics/isolation tests**

```ts
it("separates liveness, readiness, and protected metrics", async () => {
  expect((await app.inject({ method: "GET", url: "/health/live" })).statusCode).toBe(200);
  postgres.failHealthcheck();
  expect((await app.inject({ method: "GET", url: "/health/ready" })).statusCode).toBe(503);
  expect((await app.inject({ method: "GET", url: "/metrics" })).statusCode).toBe(401);
  expect((await app.inject({ method: "GET", url: "/metrics", headers: { authorization: `Bearer ${metricsToken}` } })).headers["content-type"]).toContain("text/plain");
  expect(businessEnvironmentKeys()).not.toContain("OPENAI_API_KEY");
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/health.test.ts tests/integration/security.test.ts`

Expected: FAIL on readiness/metrics and container isolation assertions.

- [ ] **Step 3: Implement probes, metrics, containers, and operator documentation**

```ts
app.get("/health/ready", async (_request, reply) => {
  const checks = await readinessWithOneSecondDeadline(deps);
  const ready = Object.values(checks).every((value) => value === "up");
  return reply.code(ready ? 200 : 503).send({ status: ready ? "ready" : "not_ready", checks });
});

app.get("/metrics", { preHandler: requireMetricsTokenOrDevelopmentLoopback }, async (_request, reply) => {
  reply.type(metricsRegistry.contentType);
  return metricsRegistry.metrics();
});
```

Expose request count/duration by normalized route/status, active PostgreSQL pool counts, Redis/queue connectivity, queue depth, job failures, sync accepted/conflict counts, outbox lag/watermark age, retention deletions, bootstrap counts, and feedback/report status counts; never label by user, class, entity, request ID, IP, or token. `server/Dockerfile` uses `node:24.15.0-bookworm-slim`, runs the compiled business app as a non-root user, and contains no OpenAI environment. `server/Dockerfile.ai` copies only `physics-ai-gateway.mjs`, keeps port 8787 and its existing environment. `server/compose.yaml` defines health-checked `business-api`, `worker`, `postgres`, `redis`, `minio`, a one-shot bucket/CORS initializer restricted to the two packaged-app origins plus localhost development, and `mailpit`; it uses `postgres:17.5-bookworm`, `redis:7.4.2-alpine`, `minio/minio:RELEASE.2025-04-22T22-12-26Z`, and `axllent/mailpit:v1.27.8`. The `ai-gateway` service is in the opt-in `ai` profile and no business/worker environment contains `OPENAI_API_KEY`.

Document these exact commands in `server/README.md`:

```powershell
docker compose -f .\server\compose.yaml up -d postgres redis minio mailpit
pnpm --dir .\server install
pnpm --dir .\server migrate:up
pnpm --dir .\server dev
pnpm --dir .\server dev:worker
docker compose -f .\server\compose.yaml --profile ai up -d ai-gateway
```

- [ ] **Step 4: Run the server baseline verification before lifecycle extensions**

Run: `pnpm --dir server typecheck`

Run: `pnpm --dir server test:unit`

Run: `pnpm --dir server test:integration`

Run: `pnpm --dir server build`

Run: `docker compose -f server/compose.yaml config`

Expected: all commands exit 0 for Tasks 1-19; auth and sync success shapes exactly match the immutable contracts; live/ready/metrics tests pass; no test contacts OpenAI or real SMTP; `server/physics-ai-gateway.mjs` has no diff. Task 23 remains the final real Compose API verification after Tasks 20-22.

- [ ] **Step 5: Commit verified server documentation and development environment**

```bash
git add server/src/infrastructure/metrics.ts server/src/modules/health server/src/app.ts server/src/main.ts server/src/worker-main.ts server/Dockerfile server/Dockerfile.ai server/compose.yaml server/README.md server/tests/integration/health.test.ts server/tests/integration/security.test.ts
git commit -m "chore(server): add observability and docker development"
```

### Task 20: Add bulk account provisioning, first-change enforcement, disable, reset, and recovery

**Files:**
- Create: `server/src/modules/accounts/contracts.ts`
- Create: `server/src/modules/accounts/repository.ts`
- Create: `server/src/modules/accounts/service.ts`
- Create: `server/src/modules/accounts/routes.ts`
- Create: `server/src/workers/account-import-worker.ts`
- Modify: `server/src/modules/auth/service.ts`
- Modify: `server/src/modules/auth/routes.ts`
- Modify: `server/src/worker-main.ts`
- Test: `server/tests/integration/accounts.test.ts`

**Interfaces:**
- `POST /v1/admin/account-imports` accepts exactly `{uploadId,classId:null|string,defaultRole:"student"|"teacher"|"parent"}` and returns `{batchId,status:"queued"}`. Parent batches require `classId:null`; guardian links are created only through the explicit guardian-link workflow, never inferred from an account spreadsheet.
- `GET /v1/admin/account-imports/:id` returns exactly `{batchId,status,totalRows,createdRows,failedRows,errors,credentialArtifactId}` with `credentialArtifactId:null|string`; errors contain row number and stable code only.
- `POST /v1/admin/users/:id/disable|enable|reset-credential` accepts exactly `{reason}` and returns a strict user/reset status without plaintext credentials.
- `GET /v1/admin/credential-artifacts/:id/download` requires a high-strength session, marks the artifact consumed, and streams it through the API without exposing an object URL; a second request returns `410 credential_artifact_consumed`.

- [ ] **Step 1: Write failing account lifecycle tests**

Cover verified CSV/XLSX only, 1-5,000 rows per batch, duplicate normalized login, invalid role, optional student/teacher class/group membership, rejection of parent class inference, partial-row reporting without partial fields, two workers racing, no plaintext credential in PostgreSQL/logs/API status, one-time credential artifact download, first-login route restriction, forced password change, session revocation, disable/enable, administrator reset, expired temporary credential, and attempts by non-administrators. Prove an idempotent retry does not create a second account or second artifact.

- [ ] **Step 2: Run the tests to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/accounts.test.ts`

Expected: FAIL because account lifecycle modules are absent.

- [ ] **Step 3: Implement transactional provisioning and recovery**

The worker parses the already verified upload with the same bounded CSV/XLSX safety rules as exam import. For each valid row it locks the normalized login, creates the user and Argon2id hash for a cryptographically random one-time credential, sets `must_change_password=true` and `temporary_expires_at=now+ACCOUNT_TEMP_CREDENTIAL_TTL_HOURS`, optionally creates a pending membership, and records only row status/error codes. Login rejects an expired temporary credential even when its hash matches. Plaintext credentials exist only while the worker streams an AES-256-GCM artifact encrypted with `CREDENTIAL_ARTIFACT_KEY`; IV and authentication tag accompany ciphertext, but the key never enters PostgreSQL, BullMQ, logs, or object metadata. The download route locks and marks the artifact consumed before decrypting and API-streaming it; it never returns a reusable S3 URL. Expiry deletes any unconsumed artifact.

Disable sets `status='disabled'`, records `disabled_at`, revokes every refresh family/Redis session, stops future class projections, and appends the supplied reason to audit. Enable restores account eligibility but never restores sessions and does not clear a pending first-change requirement. Reset increments credential version, replaces the password hash with a new one-time credential, sets `must_change_password=true` with a fresh temporary expiry, revokes all sessions, and creates a new one-time artifact. Successful password change clears `temporary_expires_at`. V1 recovery is administrator-mediated only; do not invent email, SMS, security-question, or self-service identity proof.

- [ ] **Step 4: Verify the complete lifecycle**

Run: `pnpm --dir server test:integration -- tests/integration/auth.test.ts tests/integration/accounts.test.ts tests/integration/security.test.ts`

Expected: account batches are bounded and auditable, temporary credentials are one-time, first password change is mandatory, and disabled/reset accounts cannot reuse old sessions.

- [ ] **Step 5: Commit account lifecycle support**

```bash
git add server/src/modules/accounts server/src/modules/auth server/src/workers/account-import-worker.ts server/src/worker-main.ts server/tests/integration/accounts.test.ts
git commit -m "feat(server): add managed account lifecycle"
```

### Task 21: Add self export, deletion and authorization withdrawal, plus parent summaries

**Files:**
- Create: `server/src/modules/privacy/contracts.ts`
- Create: `server/src/modules/privacy/repository.ts`
- Create: `server/src/modules/privacy/service.ts`
- Create: `server/src/modules/privacy/routes.ts`
- Create: `server/src/modules/parent-summary/contracts.ts`
- Create: `server/src/modules/parent-summary/service.ts`
- Create: `server/src/modules/parent-summary/routes.ts`
- Create: `server/src/workers/account-deletion-worker.ts`
- Modify: `server/src/worker-main.ts`
- Test: `server/tests/integration/privacy.test.ts`
- Test: `server/tests/integration/parent-summary.test.ts`

**Interfaces:**
- `POST /v1/privacy/exports` accepts exactly `{format:"json"}` and returns `{exportId,status:"queued"}`. `GET /v1/privacy/exports/:id` returns exactly `{exportId,status,failureCode,downloadUrl,downloadExpiresAt}`. Its public `status` is exactly `queued|processing|ready|failed|expired`, mapped from internal `queued|running|completed|failed|expired` as `queued→queued`, `running→processing`, `completed→ready`, `failed→failed`, and `expired→expired`. `failureCode` is non-null only for `failed`; `downloadUrl` and `downloadExpiresAt` are non-null only for a non-expired `ready` artifact. The route rejects unknown path/query fields, is owner-only, and never serializes internal status names or storage keys. The export excludes other students, secrets, password hashes, tokens, raw audit IP hashes, and teacher-internal annotations.
- `POST /v1/privacy/deletion-requests` accepts exactly `{confirmed:true}` and returns `{requestId,status:"gracePeriod",graceEndsAt}`. It does not collect a deletion reason. Grace is 30 days; cancellation is allowed only while status is `gracePeriod`. `POST /v1/privacy/deletion-requests/:id/cancel` returns exactly `{requestId,status:"cancelled",cancelledAt}`. v1 intentionally has no deletion-status GET route: clients may display only these acknowledged states and must not infer the internal worker states `processing|completed|failed`; adding remote terminal-state tracking later requires a separately specified privacy-preserving read contract.
- Membership and guardian withdrawal endpoints return exactly `{id,status:"withdrawn",effectiveAt}` and are immediately authorization-effective.
- Parent summary returns exactly `{studentId,periodStart,periodEnd,learningMinutes,reviewDue,reviewCompleted,assignmentDue,assignmentCompleted,knowledgeModules:[{knowledgePointId,label,evidenceLevel,latestEvidenceAt}],generatedAt}`. `evidenceLevel` is `insufficient|needsWork|basic|transfer`; no rank, raw answer, detailed error text, device data, or another class is included.

- [ ] **Step 1: Write failing privacy and parent-boundary tests**

Cover self export contents/checksums, export ownership, exact deletion request/cancel responses, rejection of cancellation outside `gracePeriod`, absence of an undeclared deletion-status GET route, worker retry, immediate revocation of ordinary sessions, restricted cancellation login, denial of every non-lifecycle route while pending, table-by-table deletion or irreversible pseudonymization, idempotent worker replay, membership withdrawal stopping future projections, guardian withdrawal immediately denying summaries, linked versus unlinked parent, period bounds, and strict absence of raw attempts/answers/rankings. Table-test every internal-to-public export status mapping, exact five-field export GET responses, nullability by status, expired-link removal, owner denial, malformed IDs, unknown query fields, and absence of internal storage/status fields. Prove retained append-only audit rows have `actor_id=NULL` and no reversible identity field after final deletion.

- [ ] **Step 2: Run the tests to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/privacy.test.ts tests/integration/parent-summary.test.ts`

Expected: FAIL because privacy and parent-summary routes are absent.

- [ ] **Step 3: Implement explicit retention and authorization changes**

Export uses a repeatable-read snapshot and writes a manifest plus data files with per-file SHA-256/size/MIME into a verified artifact. A total mapping function converts the five internal states to the five public states before strict response validation; it has no default branch that passes an internal value through. When an artifact or signed URL expires, the repository atomically records `expired` and serialization returns null download fields, so an old URL is never refreshed by a status read. A deletion request revokes all ordinary sessions immediately and marks the account `deletionPending` through the live request; subsequent login receives only a restricted cancellation session, not business access. The worker starts only after `grace_ends_at`; cancellation removes the pending restriction without reviving old sessions. The worker deletes refresh/password data, feedback contact, uploads owned solely by the account, memberships, links, profiles, learning entities, sync state, and private reports in FK-safe batches. If no shared row references the user, the user row is deleted. If published assignments/content or required audit integrity still reference it, the user row is retained only as an irreversible pseudonymous principal with disabled status, fixed non-identifying display text, no credential/login/session/contact, and no reactivation path; audit actor links are set null where the schema permits. Record completion without claiming deletion before the transaction succeeds.

Membership withdrawal is the student's self-service equivalent of removal and emits a membership tombstone. Guardian withdrawal revokes the exact link. Parent summary computes only aggregate modules under a live link and rechecks authorization at serialization time.

- [ ] **Step 4: Verify export, deletion, withdrawal, and summaries**

Run: `pnpm --dir server test:integration -- tests/integration/privacy.test.ts tests/integration/parent-summary.test.ts tests/integration/sync-pull.test.ts`

Expected: users can export and withdraw authorization, deletion status is truthful, and parents receive only authorized summaries.

- [ ] **Step 5: Commit privacy and parent capabilities**

```bash
git add server/src/modules/privacy server/src/modules/parent-summary server/src/workers/account-deletion-worker.ts server/src/worker-main.ts server/tests/integration/privacy.test.ts server/tests/integration/parent-summary.test.ts
git commit -m "feat(server): add privacy lifecycle and parent summaries"
```

### Task 22: Add reviewed, versioned question content and immutable release policy

**Files:**
- Create: `server/src/modules/question-content/contracts.ts`
- Create: `server/src/modules/question-content/repository.ts`
- Create: `server/src/modules/question-content/service.ts`
- Create: `server/src/modules/question-content/routes.ts`
- Modify: `server/src/app.ts`
- Modify: `server/src/modules/assignments/contracts.ts`
- Modify: `server/src/modules/assignments/service.ts`
- Test: `server/tests/integration/question-content.test.ts`
- Test: `server/tests/integration/assignments.test.ts`
- Modify: `server/tests/integration/uploads.test.ts`

**Interfaces:**
- `POST /v1/question-content` accepts the strict draft body below and returns exactly `{contentVersion,questionId,status:"draft",createdAt}` with status 201. `contentVersion` is the server-generated canonical UUID used by every later lookup/review; callers never derive or guess it.
- `GET /v1/question-content/review-queue?status=&cursor=` requires an administrator high-strength session and returns exactly `{items:QuestionContentReviewQueueItem[],nextCursor:string|null}` with at most 100 rows. `status` is required and must be one of `draft|published|withdrawn`; first-page cursor is omitted, later cursors are signed, administrator-bound, status-filter-bound, and rejected when malformed, tampered, cross-user, or cross-filter. Rows use stable `(created_at DESC,content_version DESC)` ordering and contain the server `contentVersion` needed to open detail.
- `GET /v1/question-content/:id/review-detail` requires an administrator high-strength session, treats `:id` as `contentVersion`, and returns exactly `QuestionContentReviewDetailV1`, including only verified attachment metadata and the complete append-only content-review history. Register `/review-queue` and `/:id/review-detail` before the generic `/:id` published-detail route. Every queue/detail object and nested creator/source/option/attachment/history object is a `StrictObject` with `additionalProperties:false`; queue length is at most 100, attachments at most 10, and review history at most 100.
- `GET /v1/question-content?status=published&cursor=` is teacher/administrator-only and returns exactly `{items:PublishedQuestionVersionSummary[],nextCursor:string|null}` with at most 100 items. `status` is required and must be the literal `published`; `cursor` is optional only on the first page, signed, user-bound, and rejected when malformed, tampered, or issued to another user. Unknown query fields fail validation.
- `GET /v1/question-content/:id` is teacher/administrator-only, treats `:id` as the canonical UUID `contentVersion`, and returns exactly one `PublishedQuestionVersionDetail`. Its strict path schema rejects unknown path fields and malformed IDs. Both GET routes expose only approved, currently published, non-withdrawn, non-quarantined versions whose attachment references are verified; students receive question content only through an authorized assignment projection.
- Teacher content creation accepts strict `{questionId,title,stem,richStemV1,options,attachmentRefs,gradingMethod,answer,solution,richSolutionV1,knowledgePointIds,source:{title,url,rightsBasis}}`; it creates a draft version and never overwrites an older version. Every attachment reference must resolve at creation to an authorized verified `questionContent` upload, and the version stores its immutable verified fileName/MIME/size/SHA-256 metadata. The two rich fields use the exact `RichContentV1` AST contract, while plain text remains separately escaped fallback content.
- Content review is administrator-only with a high-strength session in v1 and accepts exactly `{decision:"approve"|"reject"|"withdraw"|"quarantine",reason}`. It returns exactly `QuestionContentReviewResponse`, including the content identity, resulting status/source hash, and appended review identity, so a client never guesses a result ID. Valid transitions are `draft→published` for approve, `draft→rejected` for reject, `published→withdrawn` for withdraw, and `published|withdrawn→quarantined` for quarantine; every other transition returns `409 invalid_content_transition`. Approval computes the canonical SHA-256 and freezes the immutable published version; rejection remains unavailable to assignment publication.
- Withdrawal/quarantine is append-only and affects new use. Existing assignment snapshots remain byte-identical but can be marked unavailable to students only through an explicit audited quarantine notification, never by silently swapping content.

- [ ] **Step 1: Write failing version and release-policy tests**

Cover the exact four-field draft-create response, immutable versions, changed stem or rich AST producing a new version/hash, AST depth/node/text limits, unknown nodes/fields, attempted raw HTML/MathML/style/event/URL input, missing rights basis, unverified/wrong-purpose/cross-user attachment references, unauthorized or ordinary-strength review access, assignment pinning, first assignment sync operation `create`, byte-identical stem/rich stem after later edit, all four solution policies, teacher release idempotency, student-specific `afterSubmit`, clock-based `afterDue`, never-release, quarantine notification, and strict pull DTOs below 900 KiB. For the administrator review queue/detail, test all three status filters, empty and 100-row pages, stable pagination, signed-cursor tampering/cross-user/cross-filter replay, malformed IDs, unknown query/response/nested fields, strict verified attachment metadata, complete ordered audit history, and discovery of `contentVersion` from create response and queue before every detail/review call. Using that discovered version, test `questionContentReview` download of an actually referenced verified draft attachment and prove ordinary-strength administrator, teacher/student/parent, guessed version, another version's upload, and same-version non-reference return the exact Task 15 outcomes; published `questionContent` behavior remains unchanged. Assert rejected/quarantined rows are excluded from the specified queue filters but remain obtainable by an authorized administrator through a known transition response's `contentVersion`; teacher/student/parent requests and ordinary-strength administrator sessions are denied. Assert each approve/reject/withdraw/quarantine call returns the exact strict `QuestionContentReviewResponse` and its `reviewId`, status, and source-hash nullability match the appended history row. For the published-content GET routes, test teacher/administrator success, student and unrelated-role denial, required literal `status=published`, malformed/unknown query and path fields, 100-item pagination, stable order, signed-cursor tampering and cross-user replay, exact summary/detail keys, and `contentVersion` round-trip from list to detail to assignment creation. Prove draft, rejected, withdrawn, quarantined, or attachment-unverified versions are absent from list and return not found from detail without revealing their state. The assignment review detail's `questionSnapshot` must validate against the identical assignment snapshot schema, not a looser review-only object.

- [ ] **Step 2: Run the tests to verify failure**

Run: `pnpm --dir server test:integration -- tests/integration/question-content.test.ts tests/integration/assignments.test.ts tests/integration/uploads.test.ts`

Expected: FAIL because versioned content storage and publication do not exist.

- [ ] **Step 3: Implement immutable content versions**

Canonical source hashing uses UTF-8 JSON with fixed key order and normalized line endings across `title,stem,richStemV1,options,attachmentRefs,gradingMethod,answer,solution,richSolutionV1,knowledgePointIds,source`; it does not normalize mathematical symbols or rewrite authored text. Every rich block and recursive AST node is validated before hashing; arbitrary HTML/MathML strings are rejected rather than sanitized into the AST. Draft creation, review decision, publication, withdrawal, and quarantine each append audit events. Each review transaction locks the content-version row, checks the current-to-next transition, inserts `question_content_reviews` with exact previous/next status, updates the version head, and returns the inserted review receipt atomically. The content-review repository paginates only the requested draft/published/withdrawn status, binds that status and administrator ID into the signed cursor, and loads detail/history plus verified attachment metadata in bounded queries. Authorization and high-strength checks run before lookup; the strict response validator runs before serialization. Task 22 supplies the real `questionContentReview` callback to Task 15's injected `UploadContextAuthorizers` interface; the callback runs the same high-strength administrator/detail authorization and exact verified attachment-reference query, avoiding a module import cycle or ownership fallback. The published-content repository applies approval/publication/quarantine and verified-attachment predicates before pagination or lookup, orders list rows by `(published_at DESC, content_version DESC)`, and generates the next signed cursor from the final returned row. Routes authorize before lookup and validate strict TypeBox query, path, and response schemas so hidden versions are not distinguishable from absent ones. Assignment publication accepts the listed/detail `contentVersion`, resolves it again under the same approved-version rules, stores the complete source snapshot, and emits role-filtered projected copies whose `contentHash` is recomputed over the exact projected `AssignmentQuestionSnapshot` excluding the hash field itself. Release evaluation occurs at serialization for each recipient and never trusts a client submission flag or clock.

- [ ] **Step 4: Verify content integrity and visibility**

Run: `pnpm --dir server test:integration -- tests/integration/question-content.test.ts tests/integration/assignments.test.ts tests/integration/uploads.test.ts tests/integration/sync-pull.test.ts`

Expected: create/review responses expose exact server identities, administrator review queue/detail forms a strict discoverable audit loop, published list/detail exposes only eligible immutable versions, every assigned projection is hash-pinned, solutions appear only under the declared policy, and later content changes cannot alter an existing assignment.

- [ ] **Step 5: Commit versioned content**

```bash
git add server/src/modules/question-content server/src/modules/assignments server/src/app.ts server/tests/integration/question-content.test.ts server/tests/integration/assignments.test.ts server/tests/integration/uploads.test.ts
git commit -m "feat(server): add versioned assignment content"
```

### Task 23: Run real Compose API and exported-protocol E2E

**Files:**
- Create: `server/tests/e2e/compose-api-contract.test.ts`
- Create: `server/tests/fixtures/account-import.csv`
- Create: `server/tests/fixtures/protocol-v1-fixtures.ts`
- Modify: `server/package.json`
- Modify: `server/compose.yaml`
- Modify: `server/README.md`

**Interfaces:**
- `pnpm --dir server test:e2e` targets the real Compose business API, worker, PostgreSQL, Redis, MinIO, and Mailpit. It does not replace the API with an in-memory fake and never contacts OpenAI or public SMTP.
- The E2E drives only public HTTP routes and validates requests/responses with server-exported strict schemas plus `server/tests/fixtures/protocol-v1-fixtures.ts`. It must not import root application files, unpublished Windows/Android schemas, packaged binaries, or generated client implementations.
- Packaged Windows/Android cross-client E2E is deferred to the later cloud/client deployment plan after both clients exist. It is not a dependency of this backend implementation and is not part of the backend source-completion gate.

- [ ] **Step 1: Write the failing real Compose API contract E2E**

Cover account import and first password change; login/refresh/logout; class/invite/approval; two-class user evidence projection; dynamically byte-bounded push; concurrent remote assignment between push and pull proving push cursor cannot skip it; retention purge, `cursor_expired`, multi-page bootstrap with concurrent mutation and no gap; exact draft-content creation identity followed by administrator high-strength content review queue/detail/decision discovery; strict published-content list/detail and version selection; versioned assignment publication and solution release with unchanged prompt bytes/contentVersion but recomputed projection hash; offline submission replay and per-question corrections for a multi-question assignment, including rejection of a foreign question ID and the concurrent 100/101 history boundary; role-discriminated submission review queue/detail/decision with complete per-question weighted scores, exact decision/status outcomes, student-visible reason, teacher-only annotation filtering, and concurrent 100/101 decision boundary; upload status polling and authorized 60-second downloads for all five contexts, including high-strength administrator-only draft `questionContentReview` reference checks while published `questionContent` authorization remains unchanged; feedback queued then Mailpit-sent; parent summary; all five public privacy-export states; and authorization withdrawal. Assert every mutable non-exempt call uses one stable `Idempotency-Key` across retry. Validate each wire body against the server-owned protocol fixture and the exported route response schema, including rejection of unknown fields.

- [ ] **Step 2: Run it and confirm the expected failure**

Run: `docker compose -f server/compose.yaml up -d --build --wait`

Run: `pnpm --dir server test:e2e`

Expected: FAIL until all real services, routes, workers, migrations, and exported server contracts are wired.

- [ ] **Step 3: Complete deterministic protocol fixtures and real service wiring**

Add a `test:e2e` script that uses published Compose ports from environment, resets only its dedicated test database/bucket, waits for `/health/ready`, and captures sanitized container logs on failure. Create exactly one bootstrap administrator through the documented `create-user --password-stdin` path, then seed every other account/content row through public/admin APIs; do not use direct production-table shortcuts except the isolated database reset. `protocol-v1-fixtures.ts` builds canonical valid/invalid HTTP examples from exports in `server/src/modules/*/contracts.ts`; a fixture-parity assertion validates every canonical response through the same strict TypeBox schema before it is used in E2E. The fixture contains values, not a second independently maintained schema. Mail assertions query Mailpit's local test API; object assertions use MinIO. AI remains an opt-in profile and `OPENAI_API_KEY` is absent.

- [ ] **Step 4: Run the complete verification sequence**

Run: `pnpm --dir server typecheck`

Run: `pnpm --dir server test:unit`

Run: `pnpm --dir server test:integration`

Run: `pnpm --dir server build`

Run: `docker compose -f server/compose.yaml up -d --build --wait`

Run: `pnpm --dir server test:e2e`

Run: `docker compose -f server/compose.yaml down -v`

Expected: unit/integration/build and real Compose API/exported-protocol E2E all exit 0. This demonstrates functional protocol behavior only; packaged cross-client verification remains deferred, and this does not establish the 50,000-user capacity claim.

- [ ] **Step 5: Commit real API contract E2E**

```bash
git add server/package.json server/compose.yaml server/README.md server/tests/e2e server/tests/fixtures
git commit -m "test(server): add real compose api contract e2e"
```

## Appendix: Remaining Exact Migration Contracts

These migration definitions complete the contract introduced before Task 1. They remain normative and may be formatted during implementation but not weakened.

### `002_classes.ts`

```ts
import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE classes (
      id uuid PRIMARY KEY,
      owner_teacher_id uuid NOT NULL REFERENCES users(id),
      name varchar(120) NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
      grade text NOT NULL CHECK (grade IN ('八年级','九年级','高一','高二','高三')),
      subject varchar(40) NOT NULL DEFAULT '物理' CHECK (subject = '物理'),
      school_label varchar(120) CHECK (school_label IS NULL OR char_length(trim(school_label)) BETWEEN 1 AND 120),
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX classes_owner_idx ON classes(owner_teacher_id, status);
    ALTER TABLE audit_events ADD CONSTRAINT audit_events_class_fk
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL;
    CREATE TABLE class_groups (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      name varchar(80) NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (class_id, name)
    );
    CREATE TABLE memberships (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      group_id uuid REFERENCES class_groups(id) ON DELETE SET NULL,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_role text NOT NULL CHECK (member_role IN ('student','teacher')),
      student_number varchar(40),
      status text NOT NULL CHECK (status IN ('pending','active','removed')),
      joined_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((status = 'active' AND joined_at IS NOT NULL) OR status <> 'active')
    );
    CREATE UNIQUE INDEX memberships_live_user_class_idx
      ON memberships(class_id, user_id) WHERE status <> 'removed';
    CREATE INDEX memberships_roster_idx ON memberships(class_id, status, group_id, student_number);
    CREATE TABLE invites (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      code_hash bytea NOT NULL UNIQUE CHECK (octet_length(code_hash) = 32),
      expires_at timestamptz NOT NULL,
      max_uses integer NOT NULL CHECK (max_uses BETWEEN 1 AND 1000),
      used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= max_uses),
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','exhausted','expired')),
      created_by uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX invites_class_idx ON invites(class_id, status, expires_at);
    CREATE TABLE guardian_links (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      parent_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
      granted_by uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz,
      UNIQUE (class_id, parent_user_id, student_user_id)
    );
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE guardian_links;
    DROP TABLE invites;
    DROP TABLE memberships;
    DROP TABLE class_groups;
    ALTER TABLE audit_events DROP CONSTRAINT audit_events_class_fk;
    DROP TABLE classes;
  `);
}
```

### `003_learning_sync.ts`

```ts
import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE student_profiles (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      display_name varchar(80) NOT NULL,
      grade text NOT NULL CHECK (grade IN ('八年级','九年级','高一','高二','高三')),
      curriculum_version varchar(80) NOT NULL,
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, client_entity_id)
    );
    CREATE TABLE attempts (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      profile_id uuid NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
      question_id varchar(160) NOT NULL CHECK (question_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      session_client_id varchar(160) NOT NULL CHECK (session_client_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      assignment_id uuid,
      knowledge_point_ids jsonb NOT NULL CHECK (jsonb_typeof(knowledge_point_ids) = 'array'),
      question_type text NOT NULL CHECK (question_type IN ('choice','numeric','shortAnswer','proof','experiment','modeling')),
      model_family_id varchar(160) CHECK (model_family_id IS NULL OR model_family_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      variant_role text NOT NULL CHECK (variant_role IN ('diagnostic','core','near','far','counter','review')),
      difficulty text NOT NULL CHECK (difficulty IN ('基础','进阶','挑战')),
      started_at timestamptz NOT NULL,
      completed_at timestamptz NOT NULL CHECK (completed_at >= started_at),
      active_duration_seconds integer NOT NULL CHECK (active_duration_seconds BETWEEN 0 AND 86400),
      hint_view_count integer NOT NULL CHECK (hint_view_count BETWEEN 0 AND 100),
      max_hint_level integer NOT NULL CHECK (max_hint_level BETWEEN 0 AND 5),
      confidence_before smallint CHECK (confidence_before BETWEEN 1 AND 5),
      confidence_after smallint CHECK (confidence_after BETWEEN 1 AND 5),
      final_answer text NOT NULL CHECK (octet_length(final_answer) <= 30000),
      grading_status text NOT NULL CHECK (grading_status IN ('pending','correct','partial','incorrect')),
      score numeric(6,3) CHECK (score BETWEEN 0 AND 100),
      verification_issues jsonb NOT NULL CHECK (jsonb_typeof(verification_issues) = 'array'),
      primary_error_type text CHECK (primary_error_type IS NULL OR primary_error_type IN ('审题','概念','建模','规律适用条件','计算','单位','方向或符号','图像或实验','表达','猜测作答')),
      secondary_error_types jsonb NOT NULL CHECK (jsonb_typeof(secondary_error_types) = 'array'),
      reflection text NOT NULL CHECK (octet_length(reflection) <= 10000),
      self_explanation text NOT NULL CHECK (octet_length(self_explanation) <= 10000),
      model_evidence jsonb NOT NULL CHECK (jsonb_typeof(model_evidence) = 'object'),
      model_score numeric(6,3) CHECK (model_score BETWEEN 0 AND 100),
      teacher_review_status text NOT NULL CHECK (teacher_review_status IN ('notRequired','pending','approved','returned')),
      teacher_reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (owner_user_id, client_entity_id)
    );
    CREATE INDEX attempts_profile_created_idx ON attempts(profile_id, created_at DESC);
    CREATE TABLE hint_events (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      attempt_id uuid NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
      level integer NOT NULL CHECK (level BETWEEN 1 AND 5),
      opened_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (owner_user_id, client_entity_id)
    );
    CREATE TABLE transfer_attempts (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      profile_id uuid NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
      source_question_id varchar(160) NOT NULL CHECK (source_question_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      variant_id varchar(160) NOT NULL CHECK (variant_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      variant_type text NOT NULL CHECK (variant_type IN ('near','far','counter')),
      response text NOT NULL CHECK (octet_length(response) <= 30000),
      grading_status text NOT NULL CHECK (grading_status IN ('pending','correct','partial','incorrect')),
      verification_method text NOT NULL CHECK (verification_method IN ('automatic','teacher')),
      review_comment text NOT NULL DEFAULT '' CHECK (octet_length(review_comment) <= 5000),
      reviewed_by uuid REFERENCES users(id),
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (owner_user_id, client_entity_id)
    );
    CREATE TABLE review_schedules (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      profile_id uuid NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
      question_id varchar(160) NOT NULL CHECK (question_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      knowledge_point_ids jsonb NOT NULL CHECK (jsonb_typeof(knowledge_point_ids) = 'array'),
      due_at timestamptz NOT NULL,
      interval_days numeric(9,4) NOT NULL CHECK (interval_days BETWEEN 0 AND 3650),
      ease_factor numeric(5,3) NOT NULL CHECK (ease_factor BETWEEN 1.000 AND 5.000),
      repetition integer NOT NULL CHECK (repetition BETWEEN 0 AND 10000),
      lapses integer NOT NULL CHECK (lapses BETWEEN 0 AND 10000),
      last_rating smallint CHECK (last_rating BETWEEN 0 AND 3),
      last_reviewed_at timestamptz,
      source_attempt_id uuid REFERENCES attempts(id) ON DELETE SET NULL,
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (owner_user_id, client_entity_id),
      UNIQUE (profile_id, question_id)
    );
    CREATE TABLE sync_inbound_events (
      event_id uuid PRIMARY KEY,
      actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id varchar(64) NOT NULL CHECK (device_id ~ '^[0-9a-f]{64}$'),
      scope_type text NOT NULL CHECK (scope_type IN ('user','membership')),
      scope_id uuid NOT NULL,
      entity_type varchar(40) NOT NULL,
      entity_id varchar(160) NOT NULL CHECK (entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      operation text NOT NULL CHECK (operation IN ('create','update','delete')),
      base_revision integer NOT NULL CHECK (base_revision >= 0),
      payload jsonb NOT NULL,
      idempotency_key varchar(128) NOT NULL,
      request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
      client_created_at timestamptz NOT NULL,
      accepted_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (actor_id, idempotency_key)
    );
    CREATE TABLE sync_entity_heads (
      scope_type text NOT NULL CHECK (scope_type IN ('user','membership')),
      scope_id uuid NOT NULL,
      entity_type varchar(40) NOT NULL,
      entity_id varchar(160) NOT NULL CHECK (entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision integer NOT NULL CHECK (revision > 0),
      payload jsonb NOT NULL,
      payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
      deleted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (scope_type, scope_id, entity_type, entity_id)
    );
    CREATE TABLE sync_tombstones (
      scope_type text NOT NULL CHECK (scope_type IN ('user','membership')),
      scope_id uuid NOT NULL,
      entity_type varchar(40) NOT NULL,
      entity_id varchar(160) NOT NULL CHECK (entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision integer NOT NULL CHECK (revision > 0),
      deleted_at timestamptz NOT NULL,
      purge_after timestamptz NOT NULL CHECK (purge_after > deleted_at),
      PRIMARY KEY (scope_type, scope_id, entity_type, entity_id)
    );
    CREATE INDEX sync_tombstones_purge_idx ON sync_tombstones(purge_after);
    CREATE TABLE sync_outbox (
      sequence bigserial PRIMARY KEY,
      change_id uuid NOT NULL,
      recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id uuid REFERENCES classes(id) ON DELETE CASCADE,
      event_id uuid NOT NULL,
      entity_type varchar(40) NOT NULL,
      entity_id varchar(160) NOT NULL CHECK (entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      operation text NOT NULL CHECK (operation IN ('create','update','delete')),
      revision integer NOT NULL CHECK (revision > 0),
      payload jsonb NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      purge_after timestamptz NOT NULL,
      UNIQUE (recipient_user_id, change_id)
    );
    CREATE INDEX sync_outbox_pull_idx ON sync_outbox(recipient_user_id, sequence);
    CREATE INDEX sync_outbox_purge_idx ON sync_outbox(purge_after);
    CREATE TABLE sync_retention_watermarks (
      recipient_user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_purged_sequence bigint NOT NULL DEFAULT 0 CHECK (last_purged_sequence >= 0),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE sync_retention_watermarks;
    DROP TABLE sync_outbox;
    DROP TABLE sync_tombstones;
    DROP TABLE sync_entity_heads;
    DROP TABLE sync_inbound_events;
    DROP TABLE review_schedules;
    DROP TABLE transfer_attempts;
    DROP TABLE hint_events;
    DROP TABLE attempts;
    DROP TABLE student_profiles;
  `);
}
```

### `004_assignments_reviews.ts`

```ts
import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE assignments (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      created_by uuid NOT NULL REFERENCES users(id),
      title varchar(160) NOT NULL,
      instructions text NOT NULL CHECK (octet_length(instructions) <= 30000),
      due_at timestamptz,
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      published_snapshot jsonb,
      published_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE assignment_targets (
      id uuid PRIMARY KEY,
      assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      group_id uuid REFERENCES class_groups(id) ON DELETE CASCADE,
      membership_id uuid REFERENCES memberships(id) ON DELETE CASCADE,
      CHECK (num_nonnulls(group_id, membership_id) <= 1)
    );
    CREATE UNIQUE INDEX assignment_targets_class_unique_idx
      ON assignment_targets(assignment_id, class_id) WHERE group_id IS NULL AND membership_id IS NULL;
    CREATE UNIQUE INDEX assignment_targets_group_unique_idx
      ON assignment_targets(assignment_id, class_id, group_id) WHERE group_id IS NOT NULL;
    CREATE UNIQUE INDEX assignment_targets_student_unique_idx
      ON assignment_targets(assignment_id, class_id, membership_id) WHERE membership_id IS NOT NULL;
    CREATE TABLE submissions (
      id uuid PRIMARY KEY,
      assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      membership_id uuid NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
      student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'array'),
      status text NOT NULL CHECK (status IN ('submitted','underReview','returned','accepted')),
      submitted_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (membership_id, client_entity_id)
    );
    CREATE INDEX submissions_review_idx ON submissions(assignment_id, status, submitted_at);
    CREATE TABLE corrections (
      id uuid PRIMARY KEY,
      submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      question_id varchar(160) NOT NULL CHECK (question_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      answer text NOT NULL CHECK (octet_length(answer) <= 30000),
      explanation text NOT NULL CHECK (octet_length(explanation) <= 30000),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (student_user_id, client_entity_id)
    );
    CREATE INDEX corrections_submission_question_idx
      ON corrections(submission_id, question_id, created_at, id);
    CREATE TABLE review_cases (
      id uuid PRIMARY KEY,
      submission_id uuid NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      status text NOT NULL CHECK (status IN ('pending','approved','returned','rejudged')),
      current_score numeric(6,3) CHECK (current_score BETWEEN 0 AND 100),
      current_per_question_scores jsonb CHECK (current_per_question_scores IS NULL OR jsonb_typeof(current_per_question_scores) = 'array'),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (
        (status = 'pending' AND current_score IS NULL AND current_per_question_scores IS NULL) OR
        (status IN ('approved','returned','rejudged') AND current_score IS NOT NULL AND current_per_question_scores IS NOT NULL)
      )
    );
    CREATE TABLE review_decisions (
      id uuid PRIMARY KEY,
      review_id uuid NOT NULL REFERENCES review_cases(id) ON DELETE CASCADE,
      actor_id uuid NOT NULL REFERENCES users(id),
      revision integer NOT NULL CHECK (revision > 1),
      decision text NOT NULL CHECK (decision IN ('approve','return','rejudge')),
      previous_status text NOT NULL CHECK (previous_status IN ('pending','approved','returned','rejudged')),
      next_status text NOT NULL CHECK (next_status IN ('approved','returned','rejudged')),
      previous_score numeric(6,3) CHECK (previous_score BETWEEN 0 AND 100),
      next_score numeric(6,3) NOT NULL CHECK (next_score BETWEEN 0 AND 100),
      per_question_scores jsonb NOT NULL CHECK (jsonb_typeof(per_question_scores) = 'array'),
      reason varchar(1000) NOT NULL CHECK (char_length(trim(reason)) BETWEEN 1 AND 1000),
      annotation jsonb NOT NULL CHECK (jsonb_typeof(annotation) = 'object'),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (
        (decision = 'approve' AND next_status = 'approved') OR
        (decision = 'return' AND next_status = 'returned') OR
        (decision = 'rejudge' AND next_status = 'rejudged')
      ),
      CHECK (
        (previous_status = 'pending' AND previous_score IS NULL) OR
        (previous_status <> 'pending' AND previous_score IS NOT NULL)
      ),
      UNIQUE (review_id, revision)
    );
    CREATE INDEX review_decisions_case_idx ON review_decisions(review_id, created_at);
    ALTER TABLE attempts ADD CONSTRAINT attempts_assignment_fk
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL;
    CREATE TABLE exam_import_batches (
      id uuid PRIMARY KEY,
      class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      upload_id uuid NOT NULL,
      created_by uuid NOT NULL REFERENCES users(id),
      status text NOT NULL CHECK (status IN ('queued','processing','needsCorrection','completed','failed')),
      total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
      valid_rows integer NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
      invalid_rows integer NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    );
    CREATE TABLE exam_import_rows (
      id uuid PRIMARY KEY,
      batch_id uuid NOT NULL REFERENCES exam_import_batches(id) ON DELETE CASCADE,
      row_number integer NOT NULL CHECK (row_number > 0),
      student_number varchar(40),
      matched_user_id uuid REFERENCES users(id),
      exam_name varchar(160),
      occurred_on date,
      score numeric(8,3),
      max_score numeric(8,3),
      status text NOT NULL CHECK (status IN ('valid','duplicate','invalid','unmatched')),
      errors jsonb NOT NULL CHECK (jsonb_typeof(errors) = 'array'),
      UNIQUE (batch_id, row_number)
    );
    CREATE TABLE exam_records (
      id uuid PRIMARY KEY,
      batch_id uuid REFERENCES exam_import_batches(id) ON DELETE RESTRICT,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_entity_id varchar(160) NOT NULL CHECK (client_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      profile_id uuid NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
      student_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exam_name varchar(160) NOT NULL,
      occurred_on date NOT NULL,
      score numeric(8,3) NOT NULL,
      max_score numeric(8,3) NOT NULL CHECK (max_score > 0 AND score BETWEEN 0 AND max_score),
      source text NOT NULL CHECK (source IN ('manual','import')),
      knowledge_point_scores jsonb NOT NULL CHECK (jsonb_typeof(knowledge_point_scores) = 'array'),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((source = 'import' AND batch_id IS NOT NULL) OR (source = 'manual' AND batch_id IS NULL))
    );
    CREATE UNIQUE INDEX exam_records_client_entity_idx
      ON exam_records(owner_user_id, client_entity_id);
    CREATE UNIQUE INDEX exam_records_import_unique_idx
      ON exam_records(batch_id, student_user_id, exam_name, occurred_on) WHERE batch_id IS NOT NULL;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TABLE exam_records;
    DROP TABLE exam_import_rows;
    DROP TABLE exam_import_batches;
    ALTER TABLE attempts DROP CONSTRAINT attempts_assignment_fk;
    DROP TABLE review_decisions;
    DROP TABLE review_cases;
    DROP TABLE corrections;
    DROP TABLE submissions;
    DROP TABLE assignment_targets;
    DROP TABLE assignments;
  `);
}
```

### `005_jobs_files_feedback_reports.ts`

```ts
import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE uploads (
      id uuid PRIMARY KEY,
      owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose text NOT NULL CHECK (purpose IN ('feedbackAttachment','submissionAttachment','examImport','reportArtifact')),
      object_key varchar(500) NOT NULL UNIQUE,
      original_name varchar(180) NOT NULL,
      declared_mime varchar(120) NOT NULL,
      detected_mime varchar(120),
      declared_bytes bigint NOT NULL CHECK (declared_bytes BETWEEN 1 AND 31457280),
      actual_bytes bigint,
      sha256_hex char(64) NOT NULL CHECK (sha256_hex ~ '^[0-9a-f]{64}$'),
      status text NOT NULL CHECK (status IN ('presigned','uploaded','verifying','verified','rejected','deleted')),
      rejection_code varchar(80),
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      verified_at timestamptz
    );
    CREATE TABLE job_outbox (
      id uuid PRIMARY KEY,
      topic text NOT NULL CHECK (topic IN ('verifyUpload','sendFeedback','generateReport','importExam','importAccounts','deleteAccount')),
      aggregate_id uuid NOT NULL,
      payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dispatching','dispatched','failed')),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      available_at timestamptz NOT NULL DEFAULT now(),
      locked_at timestamptz,
      last_error varchar(1000),
      created_at timestamptz NOT NULL DEFAULT now(),
      dispatched_at timestamptz,
      UNIQUE (topic, aggregate_id)
    );
    CREATE INDEX job_outbox_claim_idx ON job_outbox(status, available_at, created_at);
    CREATE TABLE feedback (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category text NOT NULL CHECK (category IN ('bug','content','account','sync','suggestion','other')),
      description text NOT NULL CHECK (octet_length(description) BETWEEN 10 AND 10000),
      current_page varchar(200) NOT NULL,
      contact varchar(200),
      app_version varchar(40) NOT NULL,
      system_type text NOT NULL CHECK (system_type IN ('windows','android')),
      redacted_logs jsonb NOT NULL CHECK (jsonb_typeof(redacted_logs) = 'array'),
      status text NOT NULL CHECK (status IN ('queued','sent','retrying','failed')),
      created_at timestamptz NOT NULL DEFAULT now(),
      sent_at timestamptz
    );
    CREATE TABLE feedback_attachments (
      feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
      upload_id uuid NOT NULL REFERENCES uploads(id) ON DELETE RESTRICT,
      PRIMARY KEY (feedback_id, upload_id)
    );
    CREATE TABLE email_deliveries (
      id uuid PRIMARY KEY,
      feedback_id uuid NOT NULL UNIQUE REFERENCES feedback(id) ON DELETE CASCADE,
      recipient varchar(254) NOT NULL CHECK (recipient = 'luo865265@gmail.com'),
      message_id varchar(255) NOT NULL UNIQUE,
      status text NOT NULL CHECK (status IN ('queued','sending','sent','retrying','failed')),
      attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      last_error_code varchar(120),
      next_attempt_at timestamptz,
      sent_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE report_jobs (
      id uuid PRIMARY KEY,
      requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      report_type text NOT NULL CHECK (report_type IN ('studentLearningSummary','classLearningSummary','auditExport')),
      format text NOT NULL CHECK (format IN ('json','csv')),
      scope_type text NOT NULL CHECK (scope_type IN ('student','class','audit')),
      scope_id uuid,
      status text NOT NULL CHECK (status IN ('queued','running','completed','failed')),
      failure_code varchar(120),
      created_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      completed_at timestamptz
    );
    CREATE TABLE report_artifacts (
      id uuid PRIMARY KEY,
      report_job_id uuid NOT NULL UNIQUE REFERENCES report_jobs(id) ON DELETE CASCADE,
      upload_id uuid NOT NULL UNIQUE REFERENCES uploads(id) ON DELETE RESTRICT,
      row_count integer NOT NULL CHECK (row_count >= 0),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE exam_import_batches ADD CONSTRAINT exam_import_batches_upload_fk
      FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE RESTRICT;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE exam_import_batches DROP CONSTRAINT exam_import_batches_upload_fk;
    DROP TABLE report_artifacts;
    DROP TABLE report_jobs;
    DROP TABLE email_deliveries;
    DROP TABLE feedback_attachments;
    DROP TABLE feedback;
    DROP TABLE job_outbox;
    DROP TABLE uploads;
  `);
}
```

### `006_account_privacy_content.ts`

```ts
import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE uploads DROP CONSTRAINT uploads_purpose_check;
    ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check
      CHECK (purpose IN ('feedbackAttachment','submissionAttachment','examImport','reportArtifact','accountImport','credentialArtifact','privacyExport'));
    ALTER TABLE uploads DROP CONSTRAINT uploads_declared_bytes_check;
    ALTER TABLE uploads ADD CONSTRAINT uploads_declared_bytes_check
      CHECK (declared_bytes BETWEEN 1 AND 1073741824);

    CREATE TABLE account_import_batches (
      id uuid PRIMARY KEY,
      source_upload_id uuid NOT NULL REFERENCES uploads(id) ON DELETE RESTRICT,
      created_by uuid NOT NULL REFERENCES users(id),
      class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
      default_role text NOT NULL CHECK (default_role IN ('student','teacher','parent')),
      status text NOT NULL CHECK (status IN ('queued','processing','needsCorrection','completed','failed')),
      total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows BETWEEN 0 AND 5000),
      created_rows integer NOT NULL DEFAULT 0 CHECK (created_rows BETWEEN 0 AND total_rows),
      failed_rows integer NOT NULL DEFAULT 0 CHECK (failed_rows BETWEEN 0 AND total_rows),
      errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(errors) = 'array'),
      created_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    );
    CREATE TABLE account_import_rows (
      id uuid PRIMARY KEY,
      batch_id uuid NOT NULL REFERENCES account_import_batches(id) ON DELETE CASCADE,
      row_number integer NOT NULL CHECK (row_number > 0),
      login_normalized varchar(120),
      created_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      status text NOT NULL CHECK (status IN ('created','invalid','duplicate','failed')),
      error_code varchar(120),
      UNIQUE (batch_id, row_number)
    );
    CREATE TABLE credential_artifacts (
      id uuid PRIMARY KEY,
      created_by uuid NOT NULL REFERENCES users(id),
      batch_id uuid UNIQUE REFERENCES account_import_batches(id) ON DELETE CASCADE,
      target_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      upload_id uuid NOT NULL UNIQUE REFERENCES uploads(id) ON DELETE RESTRICT,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (num_nonnulls(batch_id, target_user_id) = 1)
    );
    ALTER TABLE account_import_batches ADD COLUMN credential_artifact_id uuid UNIQUE
      REFERENCES credential_artifacts(id) ON DELETE SET NULL;

    CREATE TABLE privacy_export_jobs (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      format text NOT NULL CHECK (format = 'json'),
      status text NOT NULL CHECK (status IN ('queued','running','completed','failed','expired')),
      upload_id uuid UNIQUE REFERENCES uploads(id) ON DELETE RESTRICT,
      failure_code varchar(120),
      created_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      expires_at timestamptz
    );
    CREATE INDEX privacy_export_owner_idx ON privacy_export_jobs(user_id, created_at DESC);
    CREATE TABLE account_deletion_requests (
      id uuid PRIMARY KEY,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      status text NOT NULL CHECK (status IN ('gracePeriod','cancelled','processing','completed','failed')),
      grace_ends_at timestamptz NOT NULL,
      requested_at timestamptz NOT NULL DEFAULT now(),
      cancelled_at timestamptz,
      processing_started_at timestamptz,
      completed_at timestamptz,
      failure_code varchar(120)
    );
    CREATE UNIQUE INDEX account_deletion_live_idx ON account_deletion_requests(user_id)
      WHERE user_id IS NOT NULL AND status IN ('gracePeriod','processing');

    CREATE TABLE question_content_versions (
      id uuid PRIMARY KEY,
      question_id varchar(160) NOT NULL CHECK (question_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
      version integer NOT NULL CHECK (version > 0),
      title varchar(300) NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 300),
      stem text NOT NULL CHECK (octet_length(stem) BETWEEN 1 AND 60000),
      rich_stem_v1 jsonb CHECK (rich_stem_v1 IS NULL OR jsonb_typeof(rich_stem_v1) = 'array'),
      options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array'),
      attachment_refs jsonb NOT NULL CHECK (jsonb_typeof(attachment_refs) = 'array'),
      grading_method text NOT NULL CHECK (grading_method IN ('choice','numeric','text','teacherReview')),
      answer text NOT NULL CHECK (octet_length(answer) BETWEEN 1 AND 30000),
      solution text NOT NULL CHECK (octet_length(solution) BETWEEN 1 AND 60000),
      rich_solution_v1 jsonb CHECK (rich_solution_v1 IS NULL OR jsonb_typeof(rich_solution_v1) = 'array'),
      knowledge_point_ids jsonb NOT NULL CHECK (jsonb_typeof(knowledge_point_ids) = 'array'),
      source jsonb NOT NULL CHECK (jsonb_typeof(source) = 'object'),
      content_sha256 char(64) CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'),
      status text NOT NULL CHECK (status IN ('draft','published','rejected','withdrawn','quarantined')),
      created_by uuid NOT NULL REFERENCES users(id),
      published_at timestamptz,
      withdrawn_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (question_id, version),
      CHECK ((status = 'published' AND content_sha256 IS NOT NULL AND published_at IS NOT NULL) OR status <> 'published')
    );
    CREATE TABLE question_content_reviews (
      id uuid PRIMARY KEY,
      content_version_id uuid NOT NULL REFERENCES question_content_versions(id) ON DELETE CASCADE,
      actor_id uuid NOT NULL REFERENCES users(id),
      decision text NOT NULL CHECK (decision IN ('approve','reject','withdraw','quarantine')),
      previous_status text NOT NULL CHECK (previous_status IN ('draft','published','rejected','withdrawn','quarantined')),
      next_status text NOT NULL CHECK (next_status IN ('draft','published','rejected','withdrawn','quarantined')),
      reason varchar(1000) NOT NULL CHECK (char_length(trim(reason)) BETWEEN 1 AND 1000),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (
        (decision = 'approve' AND previous_status = 'draft' AND next_status = 'published') OR
        (decision = 'reject' AND previous_status = 'draft' AND next_status = 'rejected') OR
        (decision = 'withdraw' AND previous_status = 'published' AND next_status = 'withdrawn') OR
        (decision = 'quarantine' AND previous_status IN ('published','withdrawn') AND next_status = 'quarantined')
      )
    );
    CREATE INDEX question_content_reviews_version_idx
      ON question_content_reviews(content_version_id, created_at);
    ALTER TABLE assignments ADD COLUMN solution_release_policy text NOT NULL DEFAULT 'afterSubmit'
      CHECK (solution_release_policy IN ('afterSubmit','afterDue','teacherRelease','never'));
    ALTER TABLE assignments ADD COLUMN solutions_released_at timestamptz;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE assignments DROP COLUMN solutions_released_at;
    ALTER TABLE assignments DROP COLUMN solution_release_policy;
    DROP TABLE question_content_reviews;
    DROP TABLE question_content_versions;
    DROP TABLE account_deletion_requests;
    DROP TABLE privacy_export_jobs;
    ALTER TABLE account_import_batches DROP COLUMN credential_artifact_id;
    DROP TABLE credential_artifacts;
    DROP TABLE account_import_rows;
    DROP TABLE account_import_batches;
    ALTER TABLE uploads DROP CONSTRAINT uploads_declared_bytes_check;
    ALTER TABLE uploads ADD CONSTRAINT uploads_declared_bytes_check
      CHECK (declared_bytes BETWEEN 1 AND 31457280);
    ALTER TABLE uploads DROP CONSTRAINT uploads_purpose_check;
    ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check
      CHECK (purpose IN ('feedbackAttachment','submissionAttachment','examImport','reportArtifact'));
  `);
}
```

## Completion Gate

The backend implementation is source-complete only after all 23 tasks pass the exact commands above, including the real Compose API/exported-protocol gate in Task 23. Packaged Windows/Android cross-client E2E is explicitly deferred to the later cloud/client deployment plan and is not required to declare this backend source complete. The result must be described as “具备生产部署与压测能力，容量尚未完成生产验证”; this plan does not establish the 50,000-user/5,000-active-user capacity claim.
