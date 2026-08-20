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

  it("syncs only validated variant sets behind class authorization and idempotency", async () => {
    const updatedAt = "2026-08-20T12:00:00.000Z";
    const variant = (id: string, role: "near" | "reverse") => ({
      id,
      variantRole: role,
      title: role === "near" ? "近迁移" : "逆向迁移",
      content: "一辆小车在水平面上做匀加速直线运动，请根据给定条件求解速度。",
      options: [],
      stage: "高中" as const,
      grade: "高一",
      topic: "匀变速直线运动",
      knowledgePointId: "hs-kinematics-uniform-acceleration",
      questionType: "计算题",
      difficulty: "基础" as const,
      changeSummary: "改变已知量与设问组合",
      relationToParent: "保持同一运动学模型",
      answer: "4 m/s",
      solution: "以小车为研究对象，使用 v=v0+at，统一单位后代入并检验量纲，得到 4 m/s。",
      solutionDetail: { overview: "建立匀变速直线运动模型" },
      validation: { passed: true, checks: ["unit", "dimension"] },
      source: "应用内已审核题模变式" as const,
      approvalStatus: "system-validated" as const,
    });
    const item = {
      clientEntityId: "variant-set-local-1",
      classId: CLASS_ID,
      parentQuestionId: "parent-question-1",
      sourceContentHash: "0123456789abcdef",
      cacheKey: "parent-question-1:0123456789abcdef:variant_generation_v1:1.0.0",
      specVersion: "variant_generation_v1",
      generatorVersion: "1.0.0",
      status: "approved" as const,
      variants: [variant("variant-near-1", "near"), variant("variant-reverse-1", "reverse")],
      updatedAt,
    };
    const syncVariantSets = vi.fn(async () => ({ accepted: 1, duplicates: 0, items: [item] }));
    const listVariantSets = vi.fn(async () => ({ items: [item] }));
    const app = await buildTestApp({
      authService: authService(),
      learningService: { syncVariantSets, listVariantSets } as unknown as LearningService,
    });
    const payload = {
      deviceId: "b".repeat(64),
      sets: [{
        clientEntityId: item.clientEntityId,
        parentQuestionId: item.parentQuestionId,
        sourceContentHash: item.sourceContentHash,
        cacheKey: item.cacheKey,
        specVersion: item.specVersion,
        generatorVersion: item.generatorVersion,
        status: item.status,
        variants: item.variants,
        updatedAt,
      }],
    };
    const response = await app.inject({
      method: "POST",
      url: `/v1/classes/${CLASS_ID}/variant-sets/sync`,
      headers: {
        authorization: "Bearer header.payload.signature",
        "idempotency-key": "variant-sync-route-test-0001",
      },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ accepted: 1, duplicates: 0 });
    expect(syncVariantSets).toHaveBeenCalledOnce();

    const list = await app.inject({
      method: "GET",
      url: `/v1/classes/${CLASS_ID}/variant-sets`,
      headers: { authorization: "Bearer header.payload.signature" },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);
    expect(listVariantSets).toHaveBeenCalledOnce();
    await app.close();
  });
});
