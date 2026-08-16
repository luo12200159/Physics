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
  JoinInviteAnonymousRequestSchema,
  JoinInviteAnonymousResponseSchema,
  JoinInviteRequestSchema,
  JoinInviteResponseSchema,
  RevokeInviteResponseSchema,
  type CreateInviteRequest,
  type InviteIdParams,
  type JoinInviteAnonymousRequest,
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
    preHandler: app.authenticateOrOwnerCapability,
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

  // Student entry is intentionally separate from the authenticated join
  // route. The invite code grants only a pending student membership; the
  // service creates a scoped student session and never a teacher capability.
  app.post<{ Body: JoinInviteAnonymousRequest }>("/v1/invites/join-anonymous", {
    schema: {
      body: JoinInviteAnonymousRequestSchema,
      response: { 201: JoinInviteAnonymousResponseSchema, ...ErrorResponses },
    },
  }, async (request, reply) => {
    const response = await service.joinInviteAnonymous(request.body, {
      ip: request.ip,
      requestId: String(request.id),
      idempotency: request.mutationIdempotency ?? {
        routeKey: "POST /v1/invites/join-anonymous",
        key: `anonymous-${String(request.id)}`,
        requestHash: Buffer.alloc(32),
      },
    });
    return reply.status(201).send(response);
  });

  app.get<{ Params: ClassIdParams; Querystring: ClassListQuery }>("/v1/classes/:classId/invites", {
    preHandler: app.authenticateOrOwnerCapability,
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
    preHandler: app.authenticateOrOwnerCapability,
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
