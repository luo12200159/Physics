import { decodeJwt } from "jose";
import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/cli/migrate.js";
import { createPool } from "../../src/infrastructure/db.js";
import { createRedis } from "../../src/infrastructure/redis.js";
import type { AuthResponse, ReauthenticateResponse } from "../../src/modules/auth/contracts.js";
import { hashPassword } from "../../src/modules/auth/password.js";
import { createAuthService, type AuthService } from "../../src/modules/auth/service.js";
import { startPostgres, startRedis } from "../helpers/containers.js";
import { buildTestApp } from "../helpers/test-app.js";

describe("authentication session lifecycle", () => {
  const database = startPostgres();
  const cache = startRedis();
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const baseNow = new Date("2026-07-31T12:00:00.000Z");
  const password = "Correct Horse Battery Staple 2026";
  const replacementPassword = "Longer replacement password 2026!";

  const refreshUserId = "20000000-0000-4000-8000-000000000001";
  const logoutUserId = "20000000-0000-4000-8000-000000000002";
  const reauthUserId = "20000000-0000-4000-8000-000000000003";
  const passwordChangeUserId = "20000000-0000-4000-8000-000000000004";

  let now = new Date(baseNow);
  let pool: Pool;
  let redis: Redis;
  let service: AuthService;
  let app: FastifyInstance;

  beforeAll(async () => {
    await Promise.all([database.start(), cache.start()]);
    process.env.DATABASE_URL = database.connectionString();
    await runMigrations("up");
    pool = createPool(database.connectionString());
    redis = createRedis(cache.connectionString());
    await redis.ping();

    const passwordHash = await hashPassword(password);
    await pool.query(
      `insert into users(id, role, display_name, status, must_change_password) values
       ($1, 'student', 'Refresh Student', 'active', false),
       ($2, 'student', 'Logout Student', 'active', false),
       ($3, 'student', 'Reauthentication Student', 'active', false),
       ($4, 'student', 'Password Change Student', 'active', true)`,
      [refreshUserId, logoutUserId, reauthUserId, passwordChangeUserId],
    );
    await pool.query(
      `insert into password_credentials(
         user_id, login_normalized, password_hash, credential_version, temporary_expires_at
       ) values
       ($1, 'session-refresh', $5, 1, null),
       ($2, 'session-logout', $5, 1, null),
       ($3, 'session-reauth', $5, 1, null),
       ($4, 'session-password-change', $5, 1, $6)`,
      [
        refreshUserId,
        logoutUserId,
        reauthUserId,
        passwordChangeUserId,
        passwordHash,
        new Date(baseNow.getTime() + 24 * 60 * 60 * 1_000),
      ],
    );

    service = createAuthService({
      pool,
      redis,
      jwtSecret: "integration-session-jwt-secret-at-least-32-characters",
      auditIpKey: "integration-session-audit-key-at-least-32-characters",
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 2_592_000,
      now: () => new Date(now),
    });
  }, 120_000);

  beforeEach(async () => {
    now = new Date(baseNow);
    app = await buildTestApp({ authService: service });
  });

  afterAll(async () => {
    await redis?.quit();
    await pool?.end();
    await Promise.all([database.stop(), cache.stop()]);
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  async function login(
    loginName: string,
    loginPassword = password,
    deviceId = "a".repeat(64),
  ): Promise<{ response: Awaited<ReturnType<FastifyInstance["inject"]>>; body: AuthResponse }> {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        login: loginName,
        password: loginPassword,
        deviceId,
        deviceName: "Integration test device",
      },
    });
    return { response, body: response.json<AuthResponse>() };
  }

  it("rotates a refresh token once and revokes the whole family when the old token is replayed", async () => {
    const first = await login("session-refresh");
    expect(first.response.statusCode).toBe(200);
    const initialClaims = decodeJwt(first.body.accessToken);

    const rotated = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: first.body.refreshToken },
    });
    expect(rotated.statusCode).toBe(200);
    const rotatedBody = rotated.json<AuthResponse>();
    expect(Object.keys(rotatedBody).sort()).toEqual(["accessToken", "refreshToken", "user"]);
    expect(rotatedBody.refreshToken).not.toBe(first.body.refreshToken);
    expect(decodeJwt(rotatedBody.accessToken).sessionStrength).toBe("password");

    const replay = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: first.body.refreshToken },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toMatchObject({ code: "refresh_token_reused" });

    const descendant = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: rotatedBody.refreshToken },
    });
    expect(descendant.statusCode).toBe(401);

    const rows = await pool.query<{ revoked: boolean; revoke_reason: string | null }>(
      `select revoked_at is not null as revoked, revoke_reason
         from refresh_sessions
        where family_id = $1
        order by created_at, id`,
      [initialClaims.sid],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every((row) => row.revoked)).toBe(true);
    expect(rows.rows.every((row) => row.revoke_reason === "refresh_token_reused")).toBe(true);
    expect(await redis.get(`auth:session:${String(initialClaims.sid)}`)).toBeNull();
  });

  it("logs out with an empty 204, invalidates access immediately, and enforces idempotency", async () => {
    const firstFamily = await login("session-logout", password, "b".repeat(64));
    const secondFamily = await login("session-logout", password, "c".repeat(64));
    expect(firstFamily.response.statusCode).toBe(200);
    expect(secondFamily.response.statusCode).toBe(200);
    const familyId = String(decodeJwt(firstFamily.body.accessToken).sid);
    const idempotencyKey = "logout-session-integration-0001";

    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { "idempotency-key": idempotencyKey },
      payload: { refreshToken: firstFamily.body.refreshToken },
    });
    expect(logout.statusCode).toBe(204);
    expect(logout.body).toBe("");
    await expect(service.authenticateAccessToken(
      firstFamily.body.accessToken,
      "GET /v1/account/self",
    )).rejects.toMatchObject({ statusCode: 401, code: "invalid_access_token" });
    expect(await redis.get(`auth:session:${familyId}`)).toBeNull();

    const replay = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { "idempotency-key": idempotencyKey },
      payload: { refreshToken: firstFamily.body.refreshToken },
    });
    expect(replay.statusCode).toBe(204);
    expect(replay.body).toBe("");

    const changedBody = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { "idempotency-key": idempotencyKey },
      payload: { refreshToken: secondFamily.body.refreshToken },
    });
    expect(changedBody.statusCode).toBe(409);
    expect(changedBody.json()).toMatchObject({ code: "idempotency_mismatch" });

    const persisted = await pool.query<{ response_body: unknown }>(
      `select response_body
         from api_idempotency
        where actor_id = $1 and route_key = 'POST /v1/auth/logout'
          and idempotency_key = $2`,
      [logoutUserId, idempotencyKey],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]?.response_body).toBeNull();
  });

  it("issues reauthentication strength for exactly 600 seconds without returning a refresh token", async () => {
    const initial = await login("session-reauth", password, "d".repeat(64));
    expect(initial.response.statusCode).toBe(200);
    const initialClaims = decodeJwt(initial.body.accessToken);

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/reauthenticate",
      headers: { authorization: `Bearer ${initial.body.accessToken}` },
      payload: { password },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<ReauthenticateResponse>();
    expect(Object.keys(body).sort()).toEqual(["accessToken", "user"]);
    expect("refreshToken" in body).toBe(false);

    const elevatedClaims = decodeJwt(body.accessToken);
    expect(elevatedClaims.sub).toBe(reauthUserId);
    expect(elevatedClaims.sid).toBe(initialClaims.sid);
    expect(elevatedClaims.deviceId).toBe(initialClaims.deviceId);
    expect(elevatedClaims.sessionStrength).toBe("reauthenticated");
    expect(elevatedClaims.reauthenticatedUntil).toBe(Number(elevatedClaims.iat) + 600);
    expect(elevatedClaims.exp).toBe(Number(elevatedClaims.iat) + 900);

    const refresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: initial.body.refreshToken },
    });
    expect(refresh.statusCode).toBe(200);
    const refreshedClaims = decodeJwt(refresh.json<AuthResponse>().accessToken);
    expect(refreshedClaims.sessionStrength).toBe("password");
    expect(refreshedClaims.reauthenticatedUntil).toBeUndefined();

    now = new Date(baseNow.getTime() + 599_000);
    await expect(service.authenticateAccessToken(body.accessToken, "GET /v1/account/self"))
      .resolves.toMatchObject({ sessionStrength: "reauthenticated" });
    now = new Date(baseNow.getTime() + 601_000);
    await expect(service.authenticateAccessToken(body.accessToken, "GET /v1/account/self"))
      .resolves.toMatchObject({ sessionStrength: "password" });
  });

  it("changes a temporary password, revokes all families, and requires a fresh login", async () => {
    const firstFamily = await login("session-password-change", password, "e".repeat(64));
    const secondFamily = await login("session-password-change", password, "f".repeat(64));
    expect(firstFamily.response.statusCode).toBe(200);
    expect(secondFamily.response.statusCode).toBe(200);
    expect(firstFamily.body.user.mustChangePassword).toBe(true);
    const familyIds = [
      String(decodeJwt(firstFamily.body.accessToken).sid),
      String(decodeJwt(secondFamily.body.accessToken).sid),
    ];

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/change-password",
      headers: {
        authorization: `Bearer ${firstFamily.body.accessToken}`,
        "idempotency-key": "change-password-integration-0001",
      },
      payload: {
        currentPassword: password,
        newPassword: replacementPassword,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body)).toEqual(["user"]);
    expect(body.user).toMatchObject({
      id: passwordChangeUserId,
      mustChangePassword: false,
    });
    expect("accessToken" in body).toBe(false);
    expect("refreshToken" in body).toBe(false);

    const credential = await pool.query<{
      credential_version: number;
      temporary_expires_at: Date | null;
      must_change_password: boolean;
    }>(
      `select credentials.credential_version, credentials.temporary_expires_at,
              users.must_change_password
         from password_credentials credentials
         join users on users.id = credentials.user_id
        where credentials.user_id = $1`,
      [passwordChangeUserId],
    );
    expect(credential.rows[0]).toEqual({
      credential_version: 2,
      temporary_expires_at: null,
      must_change_password: false,
    });

    const sessions = await pool.query<{ total: string; revoked: string }>(
      `select count(*)::text as total,
              count(*) filter (where revoked_at is not null)::text as revoked
         from refresh_sessions where user_id = $1`,
      [passwordChangeUserId],
    );
    expect(sessions.rows[0]).toEqual({ total: "2", revoked: "2" });
    for (const familyId of familyIds) {
      expect(await redis.get(`auth:session:${familyId}`)).toBeNull();
    }
    await expect(service.authenticateAccessToken(firstFamily.body.accessToken))
      .rejects.toMatchObject({ statusCode: 401, code: "invalid_access_token" });
    await expect(service.authenticateAccessToken(secondFamily.body.accessToken))
      .rejects.toMatchObject({ statusCode: 401, code: "invalid_access_token" });

    const oldPassword = await login("session-password-change", password, "1".repeat(64));
    expect(oldPassword.response.statusCode).toBe(401);
    expect(oldPassword.response.json()).toMatchObject({ code: "invalid_credentials" });

    const freshLogin = await login(
      "session-password-change",
      replacementPassword,
      "2".repeat(64),
    );
    expect(freshLogin.response.statusCode).toBe(200);
    expect(freshLogin.body.user.mustChangePassword).toBe(false);
  });
});
