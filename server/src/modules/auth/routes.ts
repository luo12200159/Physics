import type { FastifyInstance, preHandlerHookHandler } from "fastify";

import { ApiErrorBodySchema } from "../../common/errors.js";
import { AuthResponseSchema, LoginRequestSchema, type LoginRequest } from "./contracts.js";
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
    request.authSession = await service.authenticateAccessToken(token, routeIdentity);
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
}
