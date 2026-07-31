import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";

import { canonicalRequestHash, executeIdempotently } from "../../src/common/idempotency.js";
import { runMigrations } from "../../src/cli/migrate.js";
import { createPool, withTransaction } from "../../src/infrastructure/db.js";
import { appendAudit, hashAuditIp } from "../../src/modules/audit/repository.js";
import { startPostgres } from "../helpers/containers.js";

describe("shared security persistence", () => {
  const database = startPostgres();
  const previousDatabaseUrl = process.env.DATABASE_URL;
  let pool: Pool;

  beforeAll(async () => {
    await database.start();
    process.env.DATABASE_URL = database.connectionString();
    await runMigrations("up");
    pool = createPool(database.connectionString());
  });

  afterAll(async () => {
    await pool?.end();
    await database.stop();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("replays an identical mutation, rejects changed content, and persists JSON null for 204", async () => {
    const actorId = randomUUID();
    await pool.query(
      "insert into users(id, role, display_name) values ($1, 'teacher', '安全测试教师')",
      [actorId],
    );
    const originalHash = canonicalRequestHash({
      method: "POST",
      path: "/v1/classes",
      body: { name: "一班", grade: "九年级" },
    });
    const changedHash = canonicalRequestHash({
      method: "POST",
      path: "/v1/classes",
      body: { name: "二班", grade: "九年级" },
    });
    let executions = 0;
    const mutation = async () => {
      executions += 1;
      return { statusCode: 201, body: { classId: randomUUID() } };
    };
    const common = {
      actorId,
      routeKey: "POST /v1/classes",
      key: "integration-class-create-0001",
      expiresAt: new Date(Date.now() + 60_000),
    };

    const first = await withTransaction(pool, async (tx) => executeIdempotently(
      tx,
      { ...common, requestHash: originalHash },
      mutation,
    ));
    const replay = await withTransaction(pool, async (tx) => executeIdempotently(
      tx,
      { ...common, requestHash: originalHash },
      mutation,
    ));
    expect(replay).toEqual({ ...first, replayed: true });
    expect(executions).toBe(1);
    await expect(withTransaction(pool, async (tx) => executeIdempotently(
      tx,
      { ...common, requestHash: changedHash },
      mutation,
    ))).rejects.toMatchObject({ statusCode: 409, code: "idempotency_mismatch" });

    const emptyHash = canonicalRequestHash({ method: "DELETE", path: "/v1/classes/1", body: null });
    const empty = await withTransaction(pool, async (tx) => executeIdempotently(
      tx,
      {
        actorId,
        routeKey: "DELETE /v1/classes/:id",
        key: "integration-class-delete-204",
        requestHash: emptyHash,
        expiresAt: new Date(Date.now() + 60_000),
      },
      async () => ({ statusCode: 204, body: null }),
    ));
    expect(empty).toEqual({ statusCode: 204, body: null, replayed: false });
    const stored = await pool.query<{ sql_null: boolean; json_null: boolean }>(
      `select response_body is null as sql_null,
              response_body = 'null'::jsonb as json_null
         from api_idempotency where actor_id = $1 and idempotency_key = $2`,
      [actorId, "integration-class-delete-204"],
    );
    expect(stored.rows[0]).toEqual({ sql_null: false, json_null: true });
  });

  it("serializes concurrent requests for the same actor, route, and key", async () => {
    const actorId = randomUUID();
    await pool.query(
      "insert into users(id, role, display_name) values ($1, 'teacher', '并发测试教师')",
      [actorId],
    );
    const requestHash = canonicalRequestHash({
      method: "POST",
      path: "/v1/classes",
      body: { name: "并发班", grade: "九年级" },
    });
    const input = {
      actorId,
      routeKey: "POST /v1/classes",
      key: "integration-concurrent-create-0001",
      requestHash,
      expiresAt: new Date(Date.now() + 60_000),
    };
    let executions = 0;
    const work = async () => {
      executions += 1;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      return { statusCode: 201, body: { classId: randomUUID() } };
    };
    const results = await Promise.all([
      withTransaction(pool, async (tx) => executeIdempotently(tx, input, work)),
      withTransaction(pool, async (tx) => executeIdempotently(tx, input, work)),
    ]);
    expect(executions).toBe(1);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(results[0]?.body).toEqual(results[1]?.body);
  });

  it("stores a denied audit event with an HMAC IP and never the raw address", async () => {
    const actorId = randomUUID();
    await pool.query(
      "insert into users(id, role, display_name) values ($1, 'teacher', '审计测试教师')",
      [actorId],
    );
    const auditKey = "integration-audit-key-at-least-32-characters";
    const ipHash = hashAuditIp(auditKey, "::ffff:127.0.0.1");
    expect(ipHash.equals(hashAuditIp(auditKey, "127.0.0.1"))).toBe(true);
    await withTransaction(pool, async (tx) => appendAudit(tx, {
      actorId,
      actorRole: "teacher",
      action: "class.read",
      resourceType: "class",
      resourceId: randomUUID(),
      classId: null,
      result: "denied",
      beforeState: null,
      afterState: null,
      reason: "resource_forbidden",
      requestId: randomUUID(),
      ipHash,
    }));
    const row = await pool.query<{ result: string; ip_hash: Buffer; serialized: string }>(
      "select result, ip_hash, row_to_json(audit_events)::text as serialized from audit_events where actor_id = $1",
      [actorId],
    );
    expect(row.rows[0]?.result).toBe("denied");
    expect(row.rows[0]?.ip_hash.equals(ipHash)).toBe(true);
    expect(row.rows[0]?.serialized).not.toContain("127.0.0.1");
  });
});
