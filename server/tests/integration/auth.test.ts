import { decodeJwt } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

import { runMigrations } from "../../src/cli/migrate.js";
import { createPool } from "../../src/infrastructure/db.js";
import { createRedis } from "../../src/infrastructure/redis.js";
import { hashPassword } from "../../src/modules/auth/password.js";
import { createAuthService, type AuthService } from "../../src/modules/auth/service.js";
import { startPostgres, startRedis } from "../helpers/containers.js";
import { buildTestApp } from "../helpers/test-app.js";

describe("password login and bearer authentication", () => {
  const database = startPostgres();
  const cache = startRedis();
  const previousDatabaseUrl = process.env.DATABASE_URL;
  let pool: Pool;
  let redis: Redis;
  let service: AuthService;
  let app: FastifyInstance;

  const activeUserId = "10000000-0000-4000-8000-000000000001";
  const passwordChangeUserId = "10000000-0000-4000-8000-000000000002";
  const deletionUserId = "10000000-0000-4000-8000-000000000003";
  const disabledUserId = "10000000-0000-4000-8000-000000000004";
  const password = "Correct Horse Battery Staple 2026";

  beforeAll(async () => {
    await Promise.all([database.start(), cache.start()]);
    process.env.DATABASE_URL = database.connectionString();
    await runMigrations("up");
    pool = createPool(database.connectionString());
    redis = createRedis(cache.connectionString());
    await redis.ping();
    const passwordHash = await hashPassword(password);
    await pool.query(
      `insert into users(id, role, display_name, status, must_change_password, disabled_at) values
       ($1, 'student', '正常学生', 'active', false, null),
       ($2, 'student', '待改密学生', 'active', true, null),
       ($3, 'student', '待删除学生', 'active', false, null),
       ($4, 'student', '停用学生', 'disabled', false, now())`,
      [activeUserId, passwordChangeUserId, deletionUserId, disabledUserId],
    );
    await pool.query(
      `insert into password_credentials(user_id, login_normalized, password_hash) values
       ($1, 'student-001', $5),
       ($2, 'student-change', $5),
       ($3, 'student-delete', $5),
       ($4, 'student-disabled', $5)`,
      [activeUserId, passwordChangeUserId, deletionUserId, disabledUserId, passwordHash],
    );
    await pool.query(
      `insert into account_deletion_requests(id, user_id, status, grace_ends_at)
       values ('10000000-0000-4000-8000-000000000099', $1, 'gracePeriod', now() + interval '30 days')`,
      [deletionUserId],
    );
    service = createAuthService({
      pool,
      redis,
      jwtSecret: "integration-jwt-secret-at-least-32-characters",
      auditIpKey: "integration-audit-key-at-least-32-characters",
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 2_592_000,
    });
  }, 120_000);

  beforeEach(async () => {
    app = await buildTestApp({ authService: service });
  });

  afterAll(async () => {
    await redis?.quit();
    await pool?.end();
    await Promise.all([database.stop(), cache.stop()]);
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  async function login(login: string, loginPassword = password) {
    return app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        login,
        password: loginPassword,
        deviceId: "A".repeat(64),
        deviceName: "Windows classroom PC",
      },
    });
  }

  it("returns the immutable login response and creates a matching positive session", async () => {
    const response = await login("student-001");
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(["accessToken", "refreshToken", "user"]);
    expect(Object.keys(body.user).sort()).toEqual([
      "deletionPending",
      "displayName",
      "id",
      "mustChangePassword",
      "role",
      "status",
    ]);
    expect(body.user).toEqual({
      id: activeUserId,
      role: "student",
      displayName: "正常学生",
      status: "active",
      mustChangePassword: false,
      deletionPending: false,
    });
    const claims = decodeJwt(body.accessToken);
    expect(claims.deviceId).toBe("a".repeat(64));
    const session = await redis.get(`auth:session:${String(claims.sid)}`);
    expect(JSON.parse(session!)).toEqual({
      userId: activeUserId,
      deviceId: "a".repeat(64),
      status: "active",
    });
    await expect(service.authenticateAccessToken(body.accessToken, "GET /v1/account/self"))
      .resolves.toMatchObject({ userId: activeUserId, role: "student" });
    const stored = await pool.query<{ bytes: number }>(
      "select octet_length(token_hash)::integer as bytes from refresh_sessions where family_id = $1",
      [claims.sid],
    );
    expect(stored.rows[0]?.bytes).toBe(32);
  });

  it("self-registers a teacher account and immediately issues a valid session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        login: "teacher-public-registration",
        displayName: "注册教师",
        role: "teacher",
        password: "A distinct teacher password 2026!",
        deviceId: "B".repeat(64),
        deviceName: "Teacher Android",
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    const body = response.json();
    expect(body.user).toMatchObject({ role: "teacher", displayName: "注册教师" });
    await expect(service.authenticateAccessToken(body.accessToken, "GET /v1/classes"))
      .resolves.toMatchObject({ role: "teacher" });
    const stored = await pool.query<{ role: string; login_normalized: string }>(
      `select users.role, credentials.login_normalized
         from users join password_credentials credentials on credentials.user_id = users.id
        where users.id = $1`,
      [body.user.id],
    );
    expect(stored.rows[0]).toEqual({ role: "teacher", login_normalized: "teacher-public-registration" });
  });

  it("uses the same public failure for an unknown login, wrong password, and disabled account", async () => {
    const responses = await Promise.all([
      login("unknown-student"),
      login("student-001", "wrong password"),
      login("student-disabled"),
    ]);
    for (const response of responses) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        code: "invalid_credentials",
        message: "Login or password is incorrect",
      });
    }
  });

  it("enforces password-change and deletion-pending lifecycle gates", async () => {
    const change = (await login("student-change")).json();
    await expect(service.authenticateAccessToken(change.accessToken, "GET /v1/classes"))
      .rejects.toMatchObject({ statusCode: 403, code: "password_change_required" });
    await expect(service.authenticateAccessToken(change.accessToken, "GET /v1/account/self"))
      .resolves.toMatchObject({ user: { mustChangePassword: true } });

    const deletion = (await login("student-delete")).json();
    await expect(service.authenticateAccessToken(deletion.accessToken, "GET /v1/classes"))
      .rejects.toMatchObject({ statusCode: 403, code: "deletion_pending" });
    await expect(service.authenticateAccessToken(
      deletion.accessToken,
      "POST /v1/privacy/deletion-requests/:id/cancel",
    )).resolves.toMatchObject({ user: { deletionPending: true } });
  });
});
