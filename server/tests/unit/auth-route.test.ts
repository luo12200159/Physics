import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedSession, AuthService } from "../../src/modules/auth/service.js";
import { buildTestApp } from "../helpers/test-app.js";

const USER = {
  id: "30000000-0000-4000-8000-000000000002",
  role: "student" as const,
  displayName: "测试学生",
  status: "active" as const,
  mustChangePassword: false,
  deletionPending: false,
};
const REFRESH_TOKEN = `r1.30000000-0000-4000-8000-000000000001.${"a".repeat(43)}`;
const ROTATED_REFRESH_TOKEN = `r1.30000000-0000-4000-8000-000000000003.${"b".repeat(43)}`;
const AUTHORIZATION = "Bearer header.payload.signature";
const IDEMPOTENCY_KEY = "auth-route-test-0001";

const AUTHENTICATED_SESSION: AuthenticatedSession = {
  userId: USER.id,
  role: USER.role,
  familyId: "30000000-0000-4000-8000-000000000004",
  deviceId: "c".repeat(64),
  sessionStrength: "password",
  jti: "30000000-0000-4000-8000-000000000005",
  issuedAt: 1_800_000_000,
  expiresAt: 1_800_000_900,
  reauthenticatedUntil: null,
  user: USER,
    positiveSessionStatus: "active",
    replayOnly: false,
};

function makeService(overrides: Record<string, unknown> = {}): AuthService {
  return {
    login: vi.fn(async () => ({
      accessToken: "x".repeat(80),
      refreshToken: REFRESH_TOKEN,
      user: USER,
    })),
    refresh: vi.fn(async () => ({
      accessToken: "y".repeat(80),
      refreshToken: ROTATED_REFRESH_TOKEN,
      user: USER,
    })),
    logout: vi.fn(async () => undefined),
    reauthenticate: vi.fn(async () => ({
      accessToken: "z".repeat(80),
      user: USER,
    })),
    changePassword: vi.fn(async () => ({ user: USER })),
    authenticateAccessToken: vi.fn(async () => AUTHENTICATED_SESSION),
    ...overrides,
  } as unknown as AuthService;
}

describe("authentication route contracts", () => {
  it("keeps login idempotency-exempt, rejects unknown input, and serializes only fixed fields", async () => {
    const login = vi.fn(async () => ({
      accessToken: "x".repeat(80),
      refreshToken: REFRESH_TOKEN,
      user: USER,
      internal: "must not be serialized",
    }));
    const app = await buildTestApp({ authService: makeService({ login }) });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        login: "student-001",
        password: "Correct Horse Battery Staple 2026",
        deviceId: "A".repeat(64),
        deviceName: "Windows classroom PC",
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(Object.keys(response.json()).sort()).toEqual(["accessToken", "refreshToken", "user"]);
    expect(login).toHaveBeenCalledTimes(1);

    const unknown = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        login: "student-001",
        password: "Correct Horse Battery Staple 2026",
        deviceId: "A".repeat(64),
        deviceName: "Windows classroom PC",
        actorId: "should-not-be-trusted",
      },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().code).toBe("validation_error");
    expect(login).toHaveBeenCalledTimes(1);
  });

  it("refreshes without an idempotency key and emits exactly the auth response contract", async () => {
    const refresh = vi.fn(async () => ({
      accessToken: "y".repeat(80),
      refreshToken: ROTATED_REFRESH_TOKEN,
      user: USER,
      sessionFamily: "must not be serialized",
    }));
    const app = await buildTestApp({ authService: makeService({ refresh }) });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: REFRESH_TOKEN },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(Object.keys(response.json()).sort()).toEqual(["accessToken", "refreshToken", "user"]);
    expect(refresh).toHaveBeenCalledWith({ refreshToken: REFRESH_TOKEN }, {
      ip: expect.any(String),
    });
  });

  it("requires idempotency for logout and returns a genuinely empty 204 response", async () => {
    const logout = vi.fn(async () => ({ ignored: true }));
    const app = await buildTestApp({ authService: makeService({ logout }) });

    const missingKey = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      payload: { refreshToken: REFRESH_TOKEN },
    });
    expect(missingKey.statusCode).toBe(400);
    expect(missingKey.json().code).toBe("idempotency_key_required");
    expect(logout).not.toHaveBeenCalled();

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { "idempotency-key": IDEMPOTENCY_KEY },
      payload: { refreshToken: REFRESH_TOKEN },
    });

    expect(response.statusCode, response.body).toBe(204);
    expect(response.body).toBe("");
    expect(response.headers["content-length"]).toBeUndefined();
    expect(logout).toHaveBeenCalledWith({ refreshToken: REFRESH_TOKEN }, {
      ip: expect.any(String),
      requestId: expect.any(String),
      idempotency: expect.objectContaining({
        key: IDEMPOTENCY_KEY,
        routeKey: "POST /v1/auth/logout",
        requestHash: expect.any(Buffer),
      }),
    });
  });

  it("requires Bearer authentication but no idempotency key for reauthentication", async () => {
    const authenticateAccessToken = vi.fn(async () => AUTHENTICATED_SESSION);
    const reauthenticate = vi.fn(async () => ({
      accessToken: "z".repeat(80),
      user: USER,
      refreshToken: "must not be serialized",
    }));
    const app = await buildTestApp({
      authService: makeService({ authenticateAccessToken, reauthenticate }),
    });

    const missingBearer = await app.inject({
      method: "POST",
      url: "/v1/auth/reauthenticate",
      payload: { password: "Correct Horse Battery Staple 2026" },
    });
    expect(missingBearer.statusCode).toBe(401);
    expect(missingBearer.json().code).toBe("invalid_access_token");
    expect(reauthenticate).not.toHaveBeenCalled();

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/reauthenticate",
      headers: { authorization: AUTHORIZATION },
      payload: { password: "Correct Horse Battery Staple 2026" },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(Object.keys(response.json()).sort()).toEqual(["accessToken", "user"]);
    expect(authenticateAccessToken).toHaveBeenCalledWith(
      "header.payload.signature",
      "POST /v1/auth/reauthenticate",
      undefined,
    );
    expect(reauthenticate).toHaveBeenCalledWith(
      AUTHENTICATED_SESSION,
      { password: "Correct Horse Battery Staple 2026" },
      { ip: expect.any(String) },
    );
  });

  it("requires both Bearer authentication and idempotency for password changes", async () => {
    const authenticateAccessToken = vi.fn(async () => AUTHENTICATED_SESSION);
    const changedUser = { ...USER, mustChangePassword: false };
    const changePassword = vi.fn(async () => ({
      user: changedUser,
      accessToken: "must not be serialized",
    }));
    const app = await buildTestApp({
      authService: makeService({ authenticateAccessToken, changePassword }),
    });
    const payload = {
      currentPassword: "Temporary Password 2026",
      newPassword: "A new unique password 2026!",
    };

    const missingKey = await app.inject({
      method: "POST",
      url: "/v1/auth/change-password",
      headers: { authorization: AUTHORIZATION },
      payload,
    });
    expect(missingKey.statusCode).toBe(400);
    expect(missingKey.json().code).toBe("idempotency_key_required");
    expect(authenticateAccessToken).not.toHaveBeenCalled();

    const missingBearer = await app.inject({
      method: "POST",
      url: "/v1/auth/change-password",
      headers: { "idempotency-key": IDEMPOTENCY_KEY },
      payload,
    });
    expect(missingBearer.statusCode).toBe(401);
    expect(missingBearer.json().code).toBe("invalid_access_token");
    expect(changePassword).not.toHaveBeenCalled();

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/change-password",
      headers: {
        authorization: AUTHORIZATION,
        "idempotency-key": IDEMPOTENCY_KEY,
      },
      payload,
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(Object.keys(response.json())).toEqual(["user"]);
    expect(authenticateAccessToken).toHaveBeenCalledWith(
      "header.payload.signature",
      "POST /v1/auth/change-password",
      expect.objectContaining({
        key: IDEMPOTENCY_KEY,
        routeKey: "POST /v1/auth/change-password",
        requestHash: expect.any(Buffer),
      }),
    );
    expect(changePassword).toHaveBeenCalledWith(
      AUTHENTICATED_SESSION,
      payload,
      {
        ip: expect.any(String),
        requestId: expect.any(String),
        idempotency: expect.objectContaining({
          key: IDEMPOTENCY_KEY,
          routeKey: "POST /v1/auth/change-password",
          requestHash: expect.any(Buffer),
        }),
      },
    );
  });
});
