import type { FastifyInstance } from "fastify";

import { ApiErrorBodySchema } from "../../common/errors.js";
import type { Actor } from "../authorization/policy.js";
import type { AuthenticatedSession } from "../auth/service.js";
import {
  ClassIdParamsSchema,
  ClassListQuerySchema,
  ClassListResponseSchema,
  ClassViewSchema,
  CreateClassRequestSchema,
  CreateGroupRequestSchema,
  GroupListResponseSchema,
  GroupViewSchema,
  MembershipIdParamsSchema,
  MembershipViewSchema,
  RosterResponseSchema,
  UpdateMembershipRequestSchema,
  type ClassIdParams,
  type ClassListQuery,
  type CreateClassRequest,
  type CreateGroupRequest,
  type MembershipIdParams,
  type UpdateMembershipRequest,
} from "./contracts.js";
import type { ClassesService } from "./service.js";

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

export function registerClassRoutes(app: FastifyInstance, service: ClassesService): void {
  app.post<{ Body: CreateClassRequest }>("/v1/classes", {
    preHandler: app.authenticate,
    schema: {
      body: CreateClassRequestSchema,
      response: { 201: ClassViewSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.createClass(
      actorFrom(request.authSession!),
      request.body,
      {
        ip: request.ip,
        requestId: String(request.id),
        idempotency: request.mutationIdempotency!,
      },
    );
    return reply.status(201).send(response);
  });

  app.get<{ Querystring: ClassListQuery }>("/v1/classes", {
    preHandler: app.authenticate,
    schema: {
      querystring: ClassListQuerySchema,
      response: { 200: ClassListResponseSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.listClasses(
      actorFrom(request.authSession!),
      request.query.cursor ?? null,
    );
    return reply.status(200).send(response);
  });

  app.post<{ Params: ClassIdParams; Body: CreateGroupRequest }>("/v1/classes/:classId/groups", {
    preHandler: app.authenticate,
    schema: {
      params: ClassIdParamsSchema,
      body: CreateGroupRequestSchema,
      response: { 201: GroupViewSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.createGroup(
      actorFrom(request.authSession!),
      request.params.classId,
      request.body,
      {
        ip: request.ip,
        requestId: String(request.id),
        idempotency: request.mutationIdempotency!,
      },
    );
    return reply.status(201).send(response);
  });

  app.get<{ Params: ClassIdParams; Querystring: ClassListQuery }>("/v1/classes/:classId/groups", {
    preHandler: app.authenticate,
    schema: {
      params: ClassIdParamsSchema,
      querystring: ClassListQuerySchema,
      response: { 200: GroupListResponseSchema, ...errors() },
    },
  }, async (request, reply) => {
    const response = await service.listGroups(
      actorFrom(request.authSession!),
      request.params.classId,
      request.query.cursor ?? null,
    );
    return reply.status(200).send(response);
  });

  const rosterOptions = {
    preHandler: app.authenticate,
    schema: {
      params: ClassIdParamsSchema,
      querystring: ClassListQuerySchema,
      response: { 200: RosterResponseSchema, ...errors() },
    },
  };
  app.get<{ Params: ClassIdParams; Querystring: ClassListQuery }>(
    "/v1/classes/:classId/members",
    rosterOptions,
    async (request, reply) => {
      const response = await service.getRoster(
        actorFrom(request.authSession!),
        request.params.classId,
        request.query.cursor ?? null,
      );
      return reply.status(200).send(response);
    },
  );
  app.get<{ Params: ClassIdParams; Querystring: ClassListQuery }>(
    "/v1/classes/:classId/roster",
    rosterOptions,
    async (request, reply) => {
      const response = await service.getRoster(
        actorFrom(request.authSession!),
        request.params.classId,
        request.query.cursor ?? null,
      );
      return reply.status(200).send(response);
    },
  );

  app.patch<{ Params: MembershipIdParams; Body: UpdateMembershipRequest }>(
    "/v1/memberships/:membershipId",
    {
      preHandler: app.authenticate,
      schema: {
        params: MembershipIdParamsSchema,
        body: UpdateMembershipRequestSchema,
        response: { 200: MembershipViewSchema, ...errors() },
      },
    },
    async (request, reply) => {
      const response = await service.updateMembership(
        actorFrom(request.authSession!),
        request.params.membershipId,
        request.body,
        {
          ip: request.ip,
          requestId: String(request.id),
          idempotency: request.mutationIdempotency!,
        },
      );
      return reply.status(200).send(response);
    },
  );
}
