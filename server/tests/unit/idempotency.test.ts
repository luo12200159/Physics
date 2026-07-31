import { describe, expect, it, vi } from "vitest";

import type { PoolClient } from "pg";

import { ApiError } from "../../src/common/errors.js";
import {
  canonicalJson,
  canonicalRequestHash,
  executeIdempotently,
  requireMutationIdempotency,
  type ExecuteIdempotencyInput,
} from "../../src/common/idempotency.js";

interface StoredResponse {
  request_hash: Buffer;
  response_status: number;
  response_body: unknown;
}

function makeMemoryTransaction() {
  let stored: StoredResponse | undefined;
  const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
    if (sql.includes("select request_hash")) return { rows: stored ? [stored] : [] };
    if (sql.includes("insert into api_idempotency")) {
      stored = {
        request_hash: values[3] as Buffer,
        response_status: values[4] as number,
        response_body: JSON.parse(values[5] as string) as unknown,
      };
    }
    return { rows: [] };
  });
  return {
    tx: { query } as unknown as PoolClient,
    stored: () => stored,
  };
}

function input(requestHash: Buffer, key = "stable-key-00001"): ExecuteIdempotencyInput {
  return {
    actorId: "00000000-0000-4000-8000-000000000001",
    routeKey: "POST /v1/classes",
    key,
    requestHash,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  };
}

describe("mutation idempotency", () => {
  it("hashes semantically identical object key order identically", () => {
    const first = canonicalRequestHash({
      method: "post",
      path: "/v1/classes",
      body: { grade: "九年级", name: "一班" },
    });
    const second = canonicalRequestHash({
      method: "POST",
      path: "/v1/classes",
      body: { name: "一班", grade: "九年级" },
    });
    expect(first.equals(second)).toBe(true);
  });

  it("retains special JSON keys without prototype mutation", () => {
    const value = JSON.parse('{"__proto__":{"polluted":true},"name":"一班"}') as unknown;
    expect(canonicalJson(value)).toBe('{"__proto__":{"polluted":true},"name":"一班"}');
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("rejects a missing or malformed mutation key with the stable public code", () => {
    for (const header of [undefined, "short", "contains space key"]) {
      const request = {
        headers: header === undefined ? {} : { "idempotency-key": header },
        method: "POST",
        url: "/v1/classes",
        routeOptions: { url: "/v1/classes" },
        body: { name: "一班" },
      } as unknown as Parameters<typeof requireMutationIdempotency>[0];
      try {
        requireMutationIdempotency(request);
        throw new Error("expected idempotency validation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ statusCode: 400, code: "idempotency_key_required" });
      }
    }
  });

  it("returns the original response and rejects a changed request body", async () => {
    const memory = makeMemoryTransaction();
    const firstHash = canonicalRequestHash({ method: "POST", path: "/v1/classes", body: { name: "一班" } });
    const changedHash = canonicalRequestHash({ method: "POST", path: "/v1/classes", body: { name: "二班" } });
    const work = vi.fn(async () => ({ statusCode: 201, body: { id: "class-1" } }));

    expect(await executeIdempotently(memory.tx, input(firstHash), work)).toEqual({
      statusCode: 201,
      body: { id: "class-1" },
      replayed: false,
    });
    expect(await executeIdempotently(memory.tx, input(firstHash), work)).toEqual({
      statusCode: 201,
      body: { id: "class-1" },
      replayed: true,
    });
    expect(work).toHaveBeenCalledTimes(1);
    await expect(executeIdempotently(memory.tx, input(changedHash), work)).rejects.toMatchObject({
      statusCode: 409,
      code: "idempotency_mismatch",
    });
  });

  it("stores a 204 as JSON null for an empty external body", async () => {
    const memory = makeMemoryTransaction();
    const requestHash = canonicalRequestHash({ method: "DELETE", path: "/v1/classes/1", body: null });
    const result = await executeIdempotently(
      memory.tx,
      { ...input(requestHash, "stable-key-20400"), routeKey: "DELETE /v1/classes/:id" },
      async () => ({ statusCode: 204, body: null }),
    );
    expect(result).toEqual({ statusCode: 204, body: null, replayed: false });
    expect(memory.stored()?.response_body).toBeNull();
  });
});
