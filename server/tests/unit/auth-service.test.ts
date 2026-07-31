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
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("insert into refresh_sessions")) {
        storedTokenHash = values[5] as Buffer;
        return { rows: [{ id: values[0] }], rowCount: 1 };
      }
      if (sql.includes("from users where users.id")) {
        return {
          rows: [{
            id: userId,
            role: "student",
            display_name: "单元测试学生",
            status: "active",
            must_change_password: false,
            deletion_pending: false,
          }],
          rowCount: 1,
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
    return { service, redis, query, sessions, storedTokenHash: () => storedTokenHash };
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
