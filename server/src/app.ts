import { randomUUID } from "node:crypto";

import { Type } from "@sinclair/typebox";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

import type { AppConfig } from "./config.js";
import { ApiError, ApiErrorBodySchema, apiErrorBody } from "./common/errors.js";
import {
  requireMutationIdempotency,
  type MutationIdempotency,
} from "./common/idempotency.js";
import { StrictObject } from "./common/schema.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import type { AuthService } from "./modules/auth/service.js";

export interface AppDependencies {
  config: AppConfig;
  postgres: {
    query(text: string, values?: readonly unknown[]): Promise<unknown>;
    close?(): Promise<void>;
  };
  redis: {
    ping(): Promise<string>;
    get(key: string): Promise<string | null>;
    close?(): Promise<void>;
  };
  objectStorage: {
    healthcheck(): Promise<void>;
    close?(): Promise<void>;
  };
  authService?: AuthService;
}

declare module "fastify" {
  interface FastifyInstance {
    deps: AppDependencies;
  }

  interface FastifyRequest {
    mutationIdempotency: MutationIdempotency | null;
  }
}

const mutableMethods = new Set(["POST", "PATCH", "DELETE"]);
const idempotencyExemptRoutes = new Set([
  "POST /v1/auth/login",
  "POST /v1/auth/refresh",
  "POST /v1/auth/reauthenticate",
]);

const LiveResponseSchema = StrictObject({
  status: Type.Literal("ok"),
  service: Type.Literal("physics-studio-business"),
  version: Type.Literal("1.0.0"),
});

function requestId(request: FastifyRequest): string {
  return String(request.id);
}

function isValidationError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "validation" in error;
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.config.nodeEnv === "test" ? false : {
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body.password",
          "req.body.currentPassword",
          "req.body.newPassword",
          "req.body.accessToken",
          "req.body.refreshToken",
          "password",
          "currentPassword",
          "newPassword",
          "accessToken",
          "refreshToken",
          "*.password",
          "*.currentPassword",
          "*.newPassword",
          "*.accessToken",
          "*.refreshToken",
        ],
        censor: "[REDACTED]",
      },
    },
    bodyLimit: 1_048_576,
    genReqId: () => randomUUID(),
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: false,
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.decorate("deps", deps);
  app.decorateRequest("mutationIdempotency", null);

  app.addHook("preHandler", async (request) => {
    const method = request.method.toUpperCase();
    if (!mutableMethods.has(method)) return;
    const requestPath = new URL(request.url, "https://business.invalid").pathname;
    const routeIdentity = `${method} ${requestPath}`;
    if (idempotencyExemptRoutes.has(routeIdentity)) return;
    request.mutationIdempotency = requireMutationIdempotency(request);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send(apiErrorBody(error, requestId(request)));
    }
    if (isValidationError(error)) {
      return reply.status(400).send(apiErrorBody(
        new ApiError(400, "validation_error", "Request validation failed"),
        requestId(request),
      ));
    }
    request.log.error({ err: error }, "unhandled request error");
    return reply.status(500).send(apiErrorBody(
      new ApiError(500, "internal_error", "Internal server error"),
      requestId(request),
    ));
  });

  app.setNotFoundHandler((request, reply) => reply.status(404).send(apiErrorBody(
    new ApiError(404, "not_found", "Resource not found"),
    requestId(request),
  )));

  app.get("/health/live", {
    schema: {
      response: {
        200: LiveResponseSchema,
        400: ApiErrorBodySchema,
        500: ApiErrorBodySchema,
      },
    },
  }, async () => ({
    status: "ok" as const,
    service: "physics-studio-business" as const,
    version: "1.0.0" as const,
  }));

  if (deps.authService) registerAuthRoutes(app, deps.authService);

  app.addHook("onClose", async () => {
    await Promise.allSettled([
      deps.objectStorage.close?.(),
      deps.redis.close?.(),
      deps.postgres.close?.(),
    ]);
  });

  await app.ready();
  return app;
}
