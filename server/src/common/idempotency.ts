import { createHash, timingSafeEqual } from "node:crypto";

import type { FastifyRequest } from "fastify";
import type { PoolClient } from "pg";

import { ApiError } from "./errors.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface CanonicalRequest {
  method: string;
  path: string;
  body: unknown;
}

export interface MutationIdempotency {
  key: string;
  routeKey: string;
  requestHash: Buffer;
}

export interface ExecuteIdempotencyInput extends MutationIdempotency {
  actorId: string;
  expiresAt: Date;
}

export interface IdempotentResponse<T extends JsonValue> {
  statusCode: number;
  body: T | null;
}

export interface IdempotentResult<T extends JsonValue> extends IdempotentResponse<T> {
  replayed: boolean;
}

interface StoredResponse<T extends JsonValue> {
  request_hash: Buffer;
  response_status: number;
  response_body: T | null;
}

function canonicalize(value: unknown, seen: WeakSet<object>): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON cannot contain a non-finite number");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`Canonical JSON cannot contain ${typeof value}`);
  }
  if (seen.has(value)) throw new TypeError("Canonical JSON cannot contain circular references");
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => canonicalize(item, seen));
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON accepts only plain objects and arrays");
    }
    const result = Object.create(null) as { [key: string]: JsonValue };
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize((value as Record<string, unknown>)[key], seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, new WeakSet<object>()));
}

export function canonicalRequestHash(request: CanonicalRequest): Buffer {
  const canonical = canonicalJson({
    body: request.body,
    method: request.method.toUpperCase(),
    path: request.path,
  });
  return createHash("sha256").update(canonical, "utf8").digest();
}

function canonicalRequestTarget(rawUrl: string): string {
  const url = new URL(rawUrl, "https://idempotency.invalid");
  url.searchParams.sort();
  return `${url.pathname}${url.search}`;
}

export function requireMutationIdempotency(
  request: Pick<FastifyRequest, "headers" | "method" | "url" | "routeOptions" | "body">,
): MutationIdempotency {
  const header = request.headers["idempotency-key"];
  if (typeof header !== "string" || !/^[\x21-\x7E]{16,128}$/.test(header)) {
    throw new ApiError(
      400,
      "idempotency_key_required",
      "A valid Idempotency-Key header is required",
    );
  }
  const method = request.method.toUpperCase();
  const path = canonicalRequestTarget(request.url);
  return {
    key: header,
    routeKey: `${method} ${request.routeOptions.url}`,
    requestHash: canonicalRequestHash({ method, path, body: request.body ?? null }),
  };
}

function validateExecutionInput(input: ExecuteIdempotencyInput): Date {
  if (input.requestHash.length !== 32) throw new TypeError("requestHash must be 32 bytes");
  if (input.routeKey.length < 1 || input.routeKey.length > 120) {
    throw new TypeError("routeKey must contain between 1 and 120 characters");
  }
  if (!/^[\x21-\x7E]{16,128}$/.test(input.key)) {
    throw new TypeError("idempotency key is invalid");
  }
  const expiresAt = input.expiresAt;
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new TypeError("expiresAt must be a future date");
  }
  return expiresAt;
}

export async function executeIdempotently<T extends JsonValue>(
  tx: PoolClient,
  input: ExecuteIdempotencyInput,
  work: () => Promise<IdempotentResponse<T>>,
): Promise<IdempotentResult<T>> {
  const expiresAt = validateExecutionInput(input);
  const lockIdentity = `${input.actorId}\u0000${input.routeKey}\u0000${input.key}`;
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [lockIdentity]);
  await tx.query(
    `delete from api_idempotency
       where actor_id = $1 and route_key = $2 and idempotency_key = $3 and expires_at <= now()`,
    [input.actorId, input.routeKey, input.key],
  );
  const stored = await tx.query<StoredResponse<T>>(
    `select request_hash, response_status, response_body
       from api_idempotency
      where actor_id = $1 and route_key = $2 and idempotency_key = $3
      for update`,
    [input.actorId, input.routeKey, input.key],
  );
  const existing = stored.rows[0];
  if (existing) {
    if (existing.request_hash.length !== 32 || !timingSafeEqual(existing.request_hash, input.requestHash)) {
      throw new ApiError(
        409,
        "idempotency_mismatch",
        "Idempotency-Key was already used for a different request",
      );
    }
    return {
      statusCode: existing.response_status,
      body: existing.response_body,
      replayed: true,
    };
  }

  const response = await work();
  if (!Number.isInteger(response.statusCode) || response.statusCode < 200 || response.statusCode > 299) {
    throw new TypeError("Idempotent response status must be between 200 and 299");
  }
  if (response.statusCode === 204 && response.body !== null) {
    throw new TypeError("A 204 idempotent response must use a null internal body");
  }
  const serializedBody = canonicalJson(response.body);
  await tx.query(
    `insert into api_idempotency(
       actor_id, route_key, idempotency_key, request_hash,
       response_status, response_body, expires_at
     ) values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      input.actorId,
      input.routeKey,
      input.key,
      input.requestHash,
      response.statusCode,
      serializedBody,
      expiresAt,
    ],
  );
  return { ...response, replayed: false };
}
