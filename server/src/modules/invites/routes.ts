import type { FastifyInstance } from "fastify";

import { ApiErrorBodySchema } from "../../common/errors.js";
import type { Actor } from "../authorization/policy.js";
import type { AuthenticatedSession } from "../auth/service.js";
import {
  ClassIdParamsSchema,
  ClassListQuerySchema,
  type ClassIdParams,
  type ClassListQuery,
} from "../classes/contracts.js";
import {
  CreateInviteRequestSchema,
  InviteCreatedSchema,
  InviteIdParamsSchema,
  InviteListResponseSchema,
  JoinInviteRequestSchema,
  JoinInviteResponseSchema,
  RevokeInviteResponseSchema,
  type CreateInviteRequest,
  type InviteIdParams,
  type JoinInviteRequest,
} from "./contracts.js";
import type { InvitesService } from "./service.js";

function actorFrom(session: AuthenticatedSession): Actor {
  return {
    userId: session.userId,
    role: session.role,
    sessionStrength: session.sessionStrength,
  };
}

const ErrorResponses = {
  400: ApiErrorBodySchema,
  401: ApiErrorBodySchema,
  403: ApiErrorBodySchema,
  404: ApiErrorBodySchema,
  409: ApiErrorBodySchema,
  429: ApiErrorBodySchema,
  500: ApiErrorBodySchema,
  503: ApiErrorBodySchema,
};

export function registerInviteRoutes(app: FastifyInstance, service: InvitesService): void {
  app.post<{ Params: ClassIdParams; Body: CreateInviteRequest }>("/v1/classes/:classId/invites", {
    preHandler: app.authenticate,
    schema: {
      params: ClassIdParamsSchema,
      body: CreateInviteRequestSchema,
      response: { 201: InviteCreatedSchema, ...ErrorResponses },
    },
  }, async (request, reply) => {
    const response = await service.createInvite(
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

  app.post<{ Body: JoinInviteRequest }>("/v1/invites/join", {
    preHandler: app.authenticate,
    schema: {
      body: JoinInviteRequestSchema,
      response: { 201: JoinInviteResponseSchema, ...ErrorResponses },
    },
  }, async (request, reply) => {
    const response = await service.joinInvite(actorFrom(request.authSession!), request.body, {
      ip: request.ip,
      requestId: String(request.id),
      idempotency: request.mutationIdempotency!,
    });
    return reply.status(201).send(response);
  });

  app.get<{ Params: ClassIdParams; Querystring: ClassListQuery }>("/v1/classes/:classId/invites", {
    preHandler: app.authenticate,
    schema: {
      params: ClassIdParamsSchema,
      querystring: ClassListQuerySchema,
      response: { 200: InviteListResponseSchema, ...ErrorResponses },
    },
  }, async (request, reply) => {
    const response = await service.listInvites(
      actorFrom(request.authSession!),
      request.params.classId,
      request.query.cursor ?? null,
    );
    return reply.status(200).send(response);
  });

  app.delete<{ Params: InviteIdParams }>("/v1/invites/:inviteId", {
    preHandler: app.authenticate,
    schema: {
      params: InviteIdParamsSchema,
      response: { 200: RevokeInviteResponseSchema, ...ErrorResponses },
    },
  }, async (request, reply) => {
    const response = await service.revokeInvite(
      actorFrom(request.authSession!),
      request.params.inviteId,
      {
        ip: request.ip,
        requestId: String(request.id),
        idempotency: request.mutationIdempotency!,
      },
    );
    return reply.status(200).send(response);
  });
}
