import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import { hashPassword } from "../../src/modules/auth/password.js";
import {
  createAuthService,
  extractBearerToken,
  type AuthRedis,
} from "../../src/modules/auth/service.js";

describe("login service", () => {
  const userId = "20000000-0000-4000-8000-000000000001";
  const now = new Date("2030-01-02T03:04:05.000Z");
  const password = "Correct Horse Battery Staple 2026";
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  function fixture() {
    const sessions = new Map<string, string>();
    let storedTokenHash: Buffer | undefined;
    let storedCredentialVersion: unknown;
    let familyActive = true;
    const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
      if (sql.includes("from password_credentials")) {
        return {
          rows: [{
            id: userId,
            role: "student",
            display_name: "单元测试学生",
            status: "active",
            must_change_password: false,
            deletion_pending: false,
            password_hash: passwordHash,
            temporary_expires_at: null,
            credential_version: 1,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("insert into refresh_sessions")) {
        storedTokenHash = values[5] as Buffer;
        storedCredentialVersion = values[9];
        return { rows: [{ id: values[0] }], rowCount: 1 };
      }
      if (sql.includes("from users where users.id")) {
        return {
          rows: familyActive ? [{
            id: userId,
            role: "student",
            display_name: "单元测试学生",
            status: "active",
            must_change_password: false,
            deletion_pending: false,
          }] : [],
          rowCount: familyActive ? 1 : 0,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const pool = { query } as unknown as Pool;
    const redis: AuthRedis = {
      eval: vi.fn(async () => 1),
      set: vi.fn(async (key: string, value: string) => {
        sessions.set(key, value);
        return "OK";
      }),
      get: vi.fn(async (key: string) => sessions.get(key) ?? null),
      del: vi.fn(async (key: string) => sessions.delete(key) ? 1 : 0),
    };
    const service = createAuthService({
      pool,
      redis,
      jwtSecret: "unit-auth-service-secret-at-least-32-characters",
      auditIpKey: "unit-auth-audit-key-at-least-32-characters",
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 2_592_000,
      now: () => new Date(now),
    });
    return {
      service,
      redis,
      query,
      sessions,
      storedTokenHash: () => storedTokenHash,
      storedCredentialVersion: () => storedCredentialVersion,
      revokeDatabaseFamily: () => { familyActive = false; },
    };
  }

  it("creates an exact response, hashed refresh record, and matching positive session", async () => {
    const test = fixture();
    const response = await test.service.login({
      login: "Student-001",
      password,
      deviceId: "A".repeat(64),
      deviceName: "Windows classroom PC",
    }, { ip: "127.0.0.1" });
    expect(Object.keys(response).sort()).toEqual(["accessToken", "refreshToken", "user"]);
    expect(Object.keys(response.user).sort()).toEqual([
      "deletionPending", "displayName", "id", "mustChangePassword", "role", "status",
    ]);
    expect(test.storedTokenHash()).toHaveLength(32);
    expect(test.storedCredentialVersion()).toBe(1);
    expect(test.storedTokenHash()?.toString("hex")).not.toContain(response.refreshToken);
    expect([...test.sessions.values()].map((value) => JSON.parse(value))).toEqual([{
      userId,
      deviceId: "a".repeat(64),
      status: "active",
    }]);
    expect(test.redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:session:/),
      expect.any(String),
      "EX",
      2_592_000,
    );
    await expect(test.service.authenticateAccessToken(response.accessToken, "GET /v1/account/self"))
      .resolves.toMatchObject({ userId, role: "student" });
  });

  it("rejects a bearer token when PostgreSQL marks its family inactive even if Redis is stale", async () => {
    const test = fixture();
    const response = await test.service.login({
      login: "student-001",
      password,
      deviceId: "a".repeat(64),
      deviceName: "Android phone",
    }, { ip: "127.0.0.1" });
    test.revokeDatabaseFamily();
    await expect(test.service.authenticateAccessToken(response.accessToken))
      .rejects.toMatchObject({ statusCode: 401, code: "invalid_access_token" });
    expect(test.sessions.size).toBe(1);
  });

  it("rejects short, numeric, and known-compromised replacement passwords before mutation", async () => {
    const test = fixture();
    const actor = {
      userId,
      role: "student" as const,
      familyId: "20000000-0000-4000-8000-000000000002",
      deviceId: "a".repeat(64),
      sessionStrength: "password" as const,
      jti: "20000000-0000-4000-8000-000000000003",
      issuedAt: 1_800_000_000,
      expiresAt: 1_800_000_900,
      reauthenticatedUntil: null,
      user: {
        id: userId,
        role: "student" as const,
        displayName: "Password policy student",
        status: "active" as const,
        mustChangePassword: true,
        deletionPending: false,
      },
      positiveSessionStatus: "active" as const,
      replayOnly: false,
    };
    const context = {
      ip: "127.0.0.1",
      requestId: "20000000-0000-4000-8000-000000000004",
      idempotency: {
        key: "password-policy-test-0001",
        routeKey: "POST /v1/auth/change-password",
        requestHash: Buffer.alloc(32),
      },
    };
    for (const newPassword of ["short", "123456789012", "password1234"]) {
      await expect(test.service.changePassword(actor, {
        currentPassword: password,
        newPassword,
      }, context)).rejects.toMatchObject({ statusCode: 400, code: "weak_password" });
    }
    expect(test.query).not.toHaveBeenCalled();
  });

  it("fails closed before password work when the shared limiter is unavailable", async () => {
    const test = fixture();
    test.redis.eval = vi.fn(async () => {
      throw new Error("redis unavailable");
    });
    await expect(test.service.login({
      login: "student-001",
      password,
      deviceId: "a".repeat(64),
      deviceName: "Android phone",
    }, { ip: "127.0.0.1" })).rejects.toMatchObject({
      statusCode: 503,
      code: "rate_limit_unavailable",
    });
    expect(test.query).not.toHaveBeenCalled();
  });

  it("rejects the sixth login attempt before database or Argon2 work", async () => {
    const test = fixture();
    test.redis.eval = vi.fn(async () => 6);
    await expect(test.service.login({
      login: "student-001",
      password,
      deviceId: "a".repeat(64),
      deviceName: "Android phone",
    }, { ip: "127.0.0.1" })).rejects.toMatchObject({
      statusCode: 429,
      code: "rate_limit_exceeded",
    });
    expect(test.query).not.toHaveBeenCalled();
  });

  it("accepts only a single Bearer header and no alternate token transport", () => {
    expect(extractBearerToken("Bearer header.payload.signature")).toBe("header.payload.signature");
    expect(() => extractBearerToken(["Bearer a.b.c", "Bearer d.e.f"])).toThrow();
    expect(() => extractBearerToken("Bearer a.b.c, Bearer d.e.f")).toThrow();
    expect(() => extractBearerToken(undefined)).toThrow();
  });
});
