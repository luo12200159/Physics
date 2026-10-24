import type { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";

import { ApiErrorBodySchema } from "../../common/errors.js";
import type { Actor } from "../authorization/policy.js";
import type { AuthenticatedSession } from "../auth/service.js";
import {
  AssignmentListResponseSchema,
  AssignmentParamsSchema,
  AssignmentRequestSchema,
  AssignmentViewSchema,
  ClassLearningParamsSchema,
  ClassLearningSummarySchema,
  ExamSyncResponseSchema,
  ReportSnapshotListResponseSchema,
  ReportSnapshotRequestSchema,
  ReportSnapshotViewSchema,
  ReviewCaseListResponseSchema,
  ReviewCaseParamsSchema,
  ReviewCaseViewSchema,
  ReviewDecisionRequestSchema,
  SubmissionRequestSchema,
  SubmissionListResponseSchema,
  SubmissionViewSchema,
  SyncExamRecordsRequestSchema,
  SyncLearningRequestSchema,
  SyncVariantSetsRequestSchema,
  VariantSetListResponseSchema,
  VariantSetSyncResponseSchema,
  LearningSyncResponseSchema,
  type AssignmentParams,
  type AssignmentRequest,
  type ClassLearningParams,
  type ReportSnapshotRequest,
  type ReviewCaseParams,
  type ReviewDecisionRequest,
  type SubmissionRequest,
  type SyncExamRecordsRequest,
  type SyncLearningRequest,
  type SyncVariantSetsRequest,
} from "./contracts.js";
import type { LearningService } from "./service.js";

function actorFrom(session: AuthenticatedSession): Actor {
  return {
    userId: session.userId,
    role: session.role,
    sessionStrength: session.sessionStrength,
  };
}

function errors() {
  return {
    400: ApiErrorBodySchema,
    401: ApiErrorBodySchema,
    403: ApiErrorBodySchema,
    404: ApiErrorBodySchema,
    409: ApiErrorBodySchema,
    429: ApiErrorBodySchema,
    500: ApiErrorBodySchema,
    503: ApiErrorBodySchema,
  };
}

export function registerLearningRoutes(app: FastifyInstance, service: LearningService): void {
  app.post<{ Params: ClassLearningParams; Body: SyncLearningRequest }>("/v1/classes/:classId/learning/sync", {
    preHandler: app.authenticate,
    schema: {
      params: ClassLearningParamsSchema,
      body: SyncLearningRequestSchema,
      response: { 200: LearningSyncResponseSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.syncLearning(
      actorFrom(request.authSession!),
      request.params.classId,
      request.body,
      { ip: request.ip, requestId: String(request.id), idempotency: request.mutationIdempotency! },
    );
    return reply.status(200).send(response);
  });

  app.post<{ Params: ClassLearningParams; Body: SyncExamRecordsRequest }>("/v1/classes/:classId/learning/exams", {
    preHandler: app.authenticate,
    schema: {
      params: ClassLearningParamsSchema,
      body: SyncExamRecordsRequestSchema,
      response: { 200: ExamSyncResponseSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.syncExamRecords(
      actorFrom(request.authSession!),
      request.params.classId,
      request.body,
      { ip: request.ip, requestId: String(request.id), idempotency: request.mutationIdempotency! },
    );
    return reply.status(200).send(response);
  });

  app.post<{ Params: ClassLearningParams; Body: SyncVariantSetsRequest }>("/v1/classes/:classId/variant-sets/sync", {
    preHandler: app.authenticateOrOwnerCapability,
    schema: {
      params: ClassLearningParamsSchema,
      body: SyncVariantSetsRequestSchema,
      response: { 200: VariantSetSyncResponseSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.syncVariantSets(
      actorFrom(request.authSession!),
      request.params.classId,
      request.body,
      { ip: request.ip, requestId: String(request.id), idempotency: request.mutationIdempotency! },
    );
    return reply.status(200).send(response);
  });

  app.get<{ Params: ClassLearningParams }>("/v1/classes/:classId/variant-sets", {
    preHandler: app.authenticateOrOwnerCapability,
    schema: {
      params: ClassLearningParamsSchema,
      response: { 200: VariantSetListResponseSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.listVariantSets(actorFrom(request.authSession!), request.params.classId);
    return reply.status(200).send(response);
  });

  app.post<{ Params: ClassLearningParams; Body: AssignmentRequest }>("/v1/classes/:classId/assignments", {
    preHandler: app.authenticateOrOwnerCapability,
    schema: {
      params: ClassLearningParamsSchema,
      body: AssignmentRequestSchema,
      response: { 201: AssignmentViewSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.createAssignment(
      actorFrom(request.authSession!),
      request.params.classId,
      request.body,
      { ip: request.ip, requestId: String(request.id), idempotency: request.mutationIdempotency! },
    );
    return reply.status(201).send(response);
  });

  app.get<{ Params: ClassLearningParams }>("/v1/classes/:classId/assignments", {
    preHandler: app.authenticateOrOwnerCapability,
    schema: {
      params: ClassLearningParamsSchema,
      response: { 200: AssignmentListResponseSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.listAssignments(actorFrom(request.authSession!), request.params.classId);
    return reply.status(200).send(response);
  });

  app.post<{ Params: AssignmentParams; Body: SubmissionRequest }>("/v1/assignments/:assignmentId/submissions", {
    preHandler: app.authenticate,
    schema: {
      params: AssignmentParamsSchema,
      body: SubmissionRequestSchema,
      response: { 201: SubmissionViewSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.submitAssignment(
      actorFrom(request.authSession!),
      request.params.assignmentId,
      request.body,
      { ip: request.ip, requestId: String(request.id), idempotency: request.mutationIdempotency! },
    );
    return reply.status(201).send(response);
  });

  app.get<{ Params: AssignmentParams }>("/v1/assignments/:assignmentId/submissions/me", {
    preHandler: app.authenticate,
    schema: {
      params: AssignmentParamsSchema,
      response: { 200: SubmissionListResponseSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.listOwnSubmissions(actorFrom(request.authSession!), request.params.assignmentId);
    return reply.status(200).send(response);
  });

  app.get<{ Params: ClassLearningParams }>("/v1/classes/:classId/assignment-submissions/me", {
    preHandler: app.authenticate,
    schema: {
      params: ClassLearningParamsSchema,
      response: { 200: SubmissionListResponseSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.listOwnClassSubmissions(actorFrom(request.authSession!), request.params.classId);
    return reply.status(200).send(response);
  });

  app.get<{ Params: ClassLearningParams }>("/v1/classes/:classId/assignment-submissions", {
    preHandler: app.authenticateOrOwnerCapability,
    schema: {
      params: ClassLearningParamsSchema,
      response: { 200: SubmissionListResponseSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.listClassSubmissions(actorFrom(request.authSession!), request.params.classId);
    return reply.status(200).send(response);
  });

  app.get<{ Params: ClassLearningParams }>("/v1/classes/:classId/review-cases", {
    preHandler: app.authenticateOrOwnerCapability,
    schema: {
      params: ClassLearningParamsSchema,
      response: { 200: ReviewCaseListResponseSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.listReviewCases(actorFrom(request.authSession!), request.params.classId);
    return reply.status(200).send(response);
  });

  app.patch<{ Params: ReviewCaseParams; Body: ReviewDecisionRequest }>("/v1/review-cases/:reviewId", {
    preHandler: app.authenticateOrOwnerCapability,
    schema: {
      params: ReviewCaseParamsSchema,
      body: ReviewDecisionRequestSchema,
      response: { 200: ReviewCaseViewSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.decideReviewCase(
      actorFrom(request.authSession!),
      request.params.reviewId,
      request.body,
      { ip: request.ip, requestId: String(request.id), idempotency: request.mutationIdempotency! },
    );
    return reply.status(200).send(response);
  });

  app.get<{ Params: ClassLearningParams }>("/v1/classes/:classId/learning/summary", {
    preHandler: app.authenticateOrOwnerCapability,
    schema: {
      params: ClassLearningParamsSchema,
      response: { 200: ClassLearningSummarySchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.classLearningSummary(actorFrom(request.authSession!), request.params.classId);
    return reply.status(200).send(response);
  });

  app.post<{ Params: ClassLearningParams; Body: ReportSnapshotRequest }>("/v1/classes/:classId/learning/report-snapshots", {
    preHandler: app.authenticate,
    schema: {
      params: ClassLearningParamsSchema,
      body: ReportSnapshotRequestSchema,
      response: { 200: ReportSnapshotViewSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.saveReportSnapshot(
      actorFrom(request.authSession!),
      request.params.classId,
      request.body,
      { ip: request.ip, requestId: String(request.id), idempotency: request.mutationIdempotency! },
    );
    return reply.status(200).send(response);
  });

  app.get<{ Params: ClassLearningParams & { profileClientEntityId: string } }>(
    "/v1/classes/:classId/learning/report-snapshots/:profileClientEntityId",
    {
      preHandler: app.authenticate,
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["classId", "profileClientEntityId"],
          properties: {
            classId: ClassLearningParamsSchema.properties.classId,
            profileClientEntityId: Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$" }),
          },
        },
        response: { 200: ReportSnapshotListResponseSchema, ...errors() },
      },
    },
    async (request, reply) => {
      const response = await service.listReportSnapshots(
        actorFrom(request.authSession!),
        request.params.classId,
        request.params.profileClientEntityId,
      );
      return reply.status(200).send(response);
    },
  );
}
