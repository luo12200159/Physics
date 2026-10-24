import { randomUUID } from "node:crypto";

import { Type } from "@sinclair/typebox";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyRequest, type preHandlerHookHandler } from "fastify";
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
import { registerClassRoutes } from "./modules/classes/routes.js";
import type { OwnerCapabilityService } from "./modules/classes/owner-capability.js";
import type { ClassesService } from "./modules/classes/service.js";
import { registerInviteRoutes } from "./modules/invites/routes.js";
import type { InvitesService } from "./modules/invites/service.js";
import { registerLearningRoutes } from "./modules/learning/routes.js";
import type { LearningService } from "./modules/learning/service.js";
import { APP_VERSION } from "./version.js";

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
  classService?: ClassesService;
  ownerCapabilityService?: OwnerCapabilityService;
  inviteService?: InvitesService;
  learningService?: LearningService;
}

declare module "fastify" {
  interface FastifyInstance {
    deps: AppDependencies;
    authenticateOrOwnerCapability: preHandlerHookHandler;
  }

  interface FastifyRequest {
    mutationIdempotency: MutationIdempotency | null;
  }
}

const mutableMethods = new Set(["POST", "PATCH", "DELETE"]);
const idempotencyExemptRoutes = new Set([
  "POST /v1/auth/login",
  "POST /v1/auth/register",
  "POST /v1/auth/refresh",
  "POST /v1/auth/reauthenticate",
  // Anonymous class creation has no authenticated actor/idempotency row. The
  // generated owner capability is the idempotent recovery handle.
  "POST /v1/classes/anonymous",
  "POST /v1/invites/join-anonymous",
]);

const LiveResponseSchema = StrictObject({
  status: Type.Literal("ok"),
  service: Type.Literal("physics-studio-business"),
  version: Type.Literal(APP_VERSION),
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
          "req.body.code",
          "req.body.ownerCapability",
          "ownerCapability",
          "password",
          "currentPassword",
          "newPassword",
          "accessToken",
          "refreshToken",
          "code",
          "*.password",
          "*.currentPassword",
          "*.newPassword",
          "*.accessToken",
          "*.refreshToken",
          "*.code",
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

  const allowedOrigins = new Set(deps.config.corsAllowedOrigins);
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Accept",
      "Authorization",
      "Content-Type",
      "Idempotency-Key",
      "X-Physics-Studio-Client",
    ],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 600,
  });

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
    version: APP_VERSION,
  }));

  if ((deps.classService || deps.inviteService) && !deps.authService) {
    throw new TypeError("Class and invite routes require an authentication service");
  }
  if (deps.learningService && !deps.authService) {
    throw new TypeError("Learning routes require an authentication service");
  }
  if (deps.authService) registerAuthRoutes(app, deps.authService);
  app.decorate("authenticateOrOwnerCapability", async (request, reply) => {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Owner ")) {
      const capability = authorization.slice("Owner ".length).trim();
      if (!deps.ownerCapabilityService || capability.length === 0) {
        throw new ApiError(401, "invalid_owner_capability", "Owner capability is invalid or expired");
      }
      request.authSession = await deps.ownerCapabilityService.authenticate(capability);
      return;
    }
    if (!deps.authService) {
      throw new ApiError(401, "authentication_required", "Authentication is required");
    }
    // The normal bearer path remains the existing auth service, including
    // refresh-session replay and idempotency checks.
    await app.authenticate(request, reply, () => undefined);
  });
  if (deps.classService) registerClassRoutes(app, deps.classService);
  if (deps.inviteService) registerInviteRoutes(app, deps.inviteService);
  if (deps.learningService) registerLearningRoutes(app, deps.learningService);

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
