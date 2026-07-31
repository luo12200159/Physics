import { describe, expect, it, vi } from "vitest";

import type { AuthService } from "../../src/modules/auth/service.js";
import { buildTestApp } from "../helpers/test-app.js";

describe("login route contract", () => {
  it("is idempotency-exempt, rejects unknown input, and serializes only fixed response fields", async () => {
    const login = vi.fn(async () => ({
      accessToken: "x".repeat(80),
      refreshToken: `r1.30000000-0000-4000-8000-000000000001.${"a".repeat(43)}`,
      user: {
        id: "30000000-0000-4000-8000-000000000002",
        role: "student" as const,
        displayName: "路由测试学生",
        status: "active" as const,
        mustChangePassword: false,
        deletionPending: false,
      },
    }));
    const authService = {
      login,
      authenticateAccessToken: vi.fn(),
    } as unknown as AuthService;
    const app = await buildTestApp({ authService });

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
});
