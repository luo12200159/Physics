import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { ApiErrorBodySchema } from "../../common/errors.js";
import {
  AuthResponseSchema,
  ChangePasswordRequestSchema,
  ChangePasswordResponseSchema,
  LoginRequestSchema,
  ReauthenticateRequestSchema,
  ReauthenticateResponseSchema,
  RefreshRequestSchema,
  type ChangePasswordRequest,
  type LoginRequest,
  type ReauthenticateRequest,
  type RefreshRequest,
} from "./contracts.js";
import {
  extractBearerToken,
  type AuthenticatedSession,
  type AuthService,
} from "./service.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
  }

  interface FastifyRequest {
    authSession: AuthenticatedSession | null;
  }
}

export function registerAuthRoutes(app: FastifyInstance, service: AuthService): void {
  app.decorateRequest("authSession", null);
  app.decorate("authenticate", async (request) => {
    const token = extractBearerToken(request.headers.authorization);
    const routeIdentity = `${request.method.toUpperCase()} ${request.routeOptions.url}`;
    request.authSession = await service.authenticateAccessToken(
      token,
      routeIdentity,
      request.mutationIdempotency ?? undefined,
    );
  });

  app.post<{ Body: LoginRequest }>("/v1/auth/login", {
    schema: {
      body: LoginRequestSchema,
      response: {
        200: AuthResponseSchema,
        400: ApiErrorBodySchema,
        401: ApiErrorBodySchema,
        429: ApiErrorBodySchema,
        500: ApiErrorBodySchema,
        503: ApiErrorBodySchema,
      },
    },
  }, async (request, reply) => {
    const response = await service.login(request.body, { ip: request.ip });
    return reply.status(200).send(response);
  });

  app.post<{ Body: RefreshRequest }>("/v1/auth/refresh", {
    schema: {
      body: RefreshRequestSchema,
      response: {
        200: AuthResponseSchema,
        400: ApiErrorBodySchema,
        401: ApiErrorBodySchema,
        429: ApiErrorBodySchema,
        500: ApiErrorBodySchema,
        503: ApiErrorBodySchema,
      },
    },
  }, async (request, reply) => {
    const response = await service.refresh(request.body, { ip: request.ip });
    return reply.status(200).send(response);
  });

  app.post<{ Body: RefreshRequest }>("/v1/auth/logout", {
    schema: {
      body: RefreshRequestSchema,
      response: {
        400: ApiErrorBodySchema,
        401: ApiErrorBodySchema,
        409: ApiErrorBodySchema,
        500: ApiErrorBodySchema,
        503: ApiErrorBodySchema,
      },
    },
  }, async (request, reply) => {
    await service.logout(request.body, {
      ip: request.ip,
      requestId: String(request.id),
      idempotency: request.mutationIdempotency!,
    });
    return reply.status(204).send();
  });

  app.post<{ Body: ReauthenticateRequest }>("/v1/auth/reauthenticate", {
    preHandler: app.authenticate,
    schema: {
      body: ReauthenticateRequestSchema,
      response: {
        200: ReauthenticateResponseSchema,
        400: ApiErrorBodySchema,
        401: ApiErrorBodySchema,
        403: ApiErrorBodySchema,
        429: ApiErrorBodySchema,
        500: ApiErrorBodySchema,
        503: ApiErrorBodySchema,
      },
    },
  }, async (request, reply) => {
    const response = await service.reauthenticate(request.authSession!, request.body, {
      ip: request.ip,
    });
    return reply.status(200).send(response);
  });

  app.post<{ Body: ChangePasswordRequest }>("/v1/auth/change-password", {
    preHandler: app.authenticate,
    schema: {
      body: ChangePasswordRequestSchema,
      response: {
        200: ChangePasswordResponseSchema,
        400: ApiErrorBodySchema,
        401: ApiErrorBodySchema,
        403: ApiErrorBodySchema,
        409: ApiErrorBodySchema,
        500: ApiErrorBodySchema,
        503: ApiErrorBodySchema,
      },
    },
  }, async (request, reply) => {
    const response = await service.changePassword(request.authSession!, request.body, {
      ip: request.ip,
      requestId: String(request.id),
      idempotency: request.mutationIdempotency!,
    });
    return reply.status(200).send(response);
  });
}
