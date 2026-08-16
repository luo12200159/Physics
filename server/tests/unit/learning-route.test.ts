import { describe, expect, it, vi } from "vitest";

import type { AuthService, AuthenticatedSession } from "../../src/modules/auth/service.js";
import type { LearningService } from "../../src/modules/learning/service.js";
import { buildTestApp } from "../helpers/test-app.js";

const CLASS_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const TEACHER_SESSION: AuthenticatedSession = {
  userId: "33333333-3333-4333-8333-333333333333",
  role: "teacher",
  sessionStrength: "reauthenticated",
  familyId: "44444444-4444-4444-8444-444444444444",
  deviceId: "a".repeat(64),
  jti: "55555555-5555-4555-8555-555555555555",
  issuedAt: 1,
  expiresAt: 2,
  reauthenticatedUntil: null,
  user: {
    id: "33333333-3333-4333-8333-333333333333",
    role: "teacher",
    displayName: "QA教师",
    status: "active",
    mustChangePassword: false,
    deletionPending: false,
  },
  positiveSessionStatus: "active",
  replayOnly: false,
};

function authService(): AuthService {
  return {
    authenticateAccessToken: vi.fn(async () => TEACHER_SESSION),
  } as unknown as AuthService;
}

describe("learning route registration", () => {
  it("requires idempotency for learning writes and keeps the route behind auth", async () => {
    const syncLearning = vi.fn(async () => ({
      profileId: PROFILE_ID,
      accepted: 0,
      duplicates: 0,
      conflicts: [],
      lastAcceptedAt: null,
    }));
    const app = await buildTestApp({
      authService: authService(),
      learningService: { syncLearning } as unknown as LearningService,
    });
    const body = {
      deviceId: "b".repeat(64),
      profile: {
        clientEntityId: "profile-local-1",
        displayName: "学生",
        grade: "高一",
        curriculumVersion: "2026",
      },
      attempts: [],
    };
    const missingKey = await app.inject({
      method: "POST",
      url: `/v1/classes/${CLASS_ID}/learning/sync`,
      headers: { authorization: "Bearer header.payload.signature" },
      payload: body,
    });
    expect(missingKey.statusCode).toBe(400);
    expect(syncLearning).not.toHaveBeenCalled();

    const response = await app.inject({
      method: "POST",
      url: `/v1/classes/${CLASS_ID}/learning/sync`,
      headers: {
        authorization: "Bearer header.payload.signature",
        "idempotency-key": "learning-route-test-0001",
      },
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ profileId: PROFILE_ID, accepted: 0 });
    expect(syncLearning).toHaveBeenCalledOnce();
    await app.close();
  });
});
