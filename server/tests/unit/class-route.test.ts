import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedSession, AuthService } from "../../src/modules/auth/service.js";
import type { ClassesService } from "../../src/modules/classes/service.js";
import type { InvitesService } from "../../src/modules/invites/service.js";
import { buildTestApp } from "../helpers/test-app.js";

const TEACHER_ID = "40000000-0000-4000-8000-000000000001";
const CLASS_ID = "40000000-0000-4000-8000-000000000002";
const GROUP_ID = "40000000-0000-4000-8000-000000000003";
const MEMBERSHIP_ID = "40000000-0000-4000-8000-000000000004";
const STUDENT_ID = "40000000-0000-4000-8000-000000000005";
const INVITE_ID = "40000000-0000-4000-8000-000000000006";
const IDEMPOTENCY_KEY = "class-route-test-0001";
const AUTHORIZATION = "Bearer header.payload.signature";
const CREATED_AT = "2026-08-01T12:00:00.000Z";

const TEACHER_SESSION: AuthenticatedSession = {
  userId: TEACHER_ID,
  role: "teacher",
  familyId: "40000000-0000-4000-8000-000000000007",
  deviceId: "d".repeat(64),
  sessionStrength: "reauthenticated",
  jti: "40000000-0000-4000-8000-000000000008",
  issuedAt: 1_800_000_000,
  expiresAt: 1_800_000_900,
  reauthenticatedUntil: 1_800_000_600,
  user: {
    id: TEACHER_ID,
    role: "teacher",
    displayName: "测试教师",
    status: "active",
    mustChangePassword: false,
    deletionPending: false,
  },
  positiveSessionStatus: "active",
  replayOnly: false,
};

const STUDENT_SESSION: AuthenticatedSession = {
  ...TEACHER_SESSION,
  userId: STUDENT_ID,
  role: "student",
  user: {
    ...TEACHER_SESSION.user,
    id: STUDENT_ID,
    role: "student",
    displayName: "测试学生",
  },
};

const CLASS_VIEW = {
  id: CLASS_ID,
  name: "九年级一班",
  grade: "九年级" as const,
  subject: "物理" as const,
  schoolLabel: "示例学校",
  status: "active" as const,
  revision: 1,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

const GROUP_VIEW = {
  id: GROUP_ID,
  classId: CLASS_ID,
  name: "巩固组",
  revision: 1,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

const MEMBERSHIP_VIEW = {
  id: MEMBERSHIP_ID,
  classId: CLASS_ID,
  groupId: GROUP_ID,
  userId: STUDENT_ID,
  displayName: "测试学生",
  memberRole: "student" as const,
  studentNumber: "2026001",
  status: "active" as const,
  revision: 2,
  joinedAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

function authService(): AuthService {
  return {
    authenticateAccessToken: vi.fn(async () => TEACHER_SESSION),
  } as unknown as AuthService;
}

function classesService(overrides: Record<string, unknown> = {}): ClassesService {
  return {
    createAnonymousClass: vi.fn(async () => ({
      class: { ...CLASS_VIEW, name: "Physics class" },
      ownerUserId: TEACHER_ID,
      ownerCapability: `oc1.${"A".repeat(43)}`,
      ownerCapabilityExpiresAt: "2027-08-01T12:00:00.000Z",
    })),
    createClass: vi.fn(async () => CLASS_VIEW),
    listClasses: vi.fn(async () => ({ items: [CLASS_VIEW], nextCursor: null })),
    getClass: vi.fn(async () => CLASS_VIEW),
    deleteClass: vi.fn(async () => ({ id: CLASS_ID, status: "archived" as const })),
    createGroup: vi.fn(async () => GROUP_VIEW),
    listGroups: vi.fn(async () => ({ items: [GROUP_VIEW], nextCursor: null })),
    getRoster: vi.fn(async () => ({ items: [MEMBERSHIP_VIEW], nextCursor: null })),
    updateMembership: vi.fn(async () => MEMBERSHIP_VIEW),
    ...overrides,
  } as unknown as ClassesService;
}

function invitesService(overrides: Record<string, unknown> = {}): InvitesService {
  return {
    createInvite: vi.fn(async () => ({
      id: INVITE_ID,
      code: "A".repeat(22),
      expiresAt: "2026-08-02T12:00:00.000Z",
      maxUses: 30,
    })),
    joinInvite: vi.fn(async () => ({ membershipId: MEMBERSHIP_ID, status: "pending" as const })),
    listInvites: vi.fn(async () => ({
      items: [{
        id: INVITE_ID,
        classId: CLASS_ID,
        expiresAt: "2026-08-02T12:00:00.000Z",
        maxUses: 30,
        usedCount: 0,
        status: "active" as const,
        createdAt: CREATED_AT,
      }],
      nextCursor: null,
    })),
    revokeInvite: vi.fn(async () => ({ id: INVITE_ID, status: "revoked" as const })),
    ...overrides,
  } as unknown as InvitesService;
}

describe("class and invite route contracts", () => {
  it("allows a name-only anonymous class creation without teacher invitation or login", async () => {
    const createAnonymousClass = vi.fn(async () => ({
      class: { ...CLASS_VIEW, name: "Physics class" },
      ownerUserId: TEACHER_ID,
      ownerCapability: `oc1.${"A".repeat(43)}`,
      ownerCapabilityExpiresAt: "2027-08-01T12:00:00.000Z",
    }));
    const app = await buildTestApp({
      authService: authService(),
      classService: classesService({ createAnonymousClass }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/classes/anonymous",
      payload: { name: "  Physics class  " },
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      class: { id: CLASS_ID, name: "Physics class" },
      ownerUserId: TEACHER_ID,
      ownerCapability: expect.stringMatching(/^oc1\./),
    });
    expect(createAnonymousClass).toHaveBeenCalledWith(
      { name: "  Physics class  " },
      expect.objectContaining({ ip: expect.any(String), requestId: expect.any(String) }),
    );
  });

  it("requires authentication and idempotency when a teacher creates a class", async () => {
    const createClass = vi.fn(async () => ({ ...CLASS_VIEW, internalOwnerId: TEACHER_ID }));
    const authenticateAccessToken = vi.fn(async () => TEACHER_SESSION);
    const app = await buildTestApp({
      authService: {
        authenticateAccessToken,
      } as unknown as AuthService,
      classService: classesService({ createClass }),
    });
    const payload = {
      name: "九年级一班",
      grade: "九年级",
      subject: "物理",
      schoolLabel: "示例学校",
    };

    const noKey = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: { authorization: AUTHORIZATION },
      payload,
    });
    expect(noKey.statusCode).toBe(400);
    expect(noKey.json()).toMatchObject({ code: "idempotency_key_required" });
    expect(authenticateAccessToken).not.toHaveBeenCalled();

    const response = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: {
        authorization: AUTHORIZATION,
        "idempotency-key": IDEMPOTENCY_KEY,
      },
      payload,
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toEqual(CLASS_VIEW);
    expect(authenticateAccessToken).toHaveBeenCalledWith(
      "header.payload.signature",
      "POST /v1/classes",
      expect.objectContaining({ routeKey: "POST /v1/classes" }),
    );
    expect(createClass).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TEACHER_ID,
        role: "teacher",
        sessionStrength: "reauthenticated",
      }),
      payload,
      expect.objectContaining({
        ip: expect.any(String),
        requestId: expect.any(String),
        idempotency: expect.objectContaining({ key: IDEMPOTENCY_KEY }),
      }),
    );
  });

  it("lists only service-authorized classes without requiring idempotency", async () => {
    const listClasses = vi.fn(async () => ({ items: [CLASS_VIEW], nextCursor: null }));
    const app = await buildTestApp({
      authService: authService(),
      classService: classesService({ listClasses }),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/classes",
      headers: { authorization: AUTHORIZATION },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ items: [CLASS_VIEW], nextCursor: null });
    expect(listClasses).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEACHER_ID }),
      null,
    );
  });

  it("reads a class detail and archives it through an owner-authorized delete", async () => {
    const getClass = vi.fn(async () => CLASS_VIEW);
    const deleteClass = vi.fn(async () => ({ id: CLASS_ID, status: "archived" as const }));
    const app = await buildTestApp({
      authService: authService(),
      classService: classesService({ getClass, deleteClass }),
    });

    const detail = await app.inject({
      method: "GET",
      url: `/v1/classes/${CLASS_ID}`,
      headers: { authorization: AUTHORIZATION },
    });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json()).toEqual(CLASS_VIEW);
    expect(getClass).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEACHER_ID }),
      CLASS_ID,
    );

    const missingKey = await app.inject({
      method: "DELETE",
      url: `/v1/classes/${CLASS_ID}`,
      headers: { authorization: AUTHORIZATION },
    });
    expect(missingKey.statusCode).toBe(400);
    expect(deleteClass).not.toHaveBeenCalled();

    const removed = await app.inject({
      method: "DELETE",
      url: `/v1/classes/${CLASS_ID}`,
      headers: {
        authorization: AUTHORIZATION,
        "idempotency-key": "class-delete-test-0001",
      },
    });
    expect(removed.statusCode, removed.body).toBe(200);
    expect(removed.json()).toEqual({ id: CLASS_ID, status: "archived" });
    expect(deleteClass).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEACHER_ID }),
      CLASS_ID,
      expect.objectContaining({
        idempotency: expect.objectContaining({
          routeKey: "DELETE /v1/classes/:classId",
          key: "class-delete-test-0001",
        }),
      }),
    );
  });

  it("creates and lists groups, reads the roster, and updates a membership", async () => {
    const createGroup = vi.fn(async () => GROUP_VIEW);
    const listGroups = vi.fn(async () => ({ items: [GROUP_VIEW], nextCursor: null }));
    const getRoster = vi.fn(async () => ({ items: [MEMBERSHIP_VIEW], nextCursor: null }));
    const updateMembership = vi.fn(async () => MEMBERSHIP_VIEW);
    const app = await buildTestApp({
      authService: authService(),
      classService: classesService({ createGroup, listGroups, getRoster, updateMembership }),
    });

    const created = await app.inject({
      method: "POST",
      url: `/v1/classes/${CLASS_ID}/groups`,
      headers: { authorization: AUTHORIZATION, "idempotency-key": "group-create-test-0001" },
      payload: { name: "巩固组" },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toEqual(GROUP_VIEW);

    const groups = await app.inject({
      method: "GET",
      url: `/v1/classes/${CLASS_ID}/groups`,
      headers: { authorization: AUTHORIZATION },
    });
    expect(groups.statusCode, groups.body).toBe(200);
    expect(groups.json()).toEqual({ items: [GROUP_VIEW], nextCursor: null });

    const roster = await app.inject({
      method: "GET",
      url: `/v1/classes/${CLASS_ID}/members`,
      headers: { authorization: AUTHORIZATION },
    });
    expect(roster.statusCode, roster.body).toBe(200);
    expect(roster.json()).toEqual({ items: [MEMBERSHIP_VIEW], nextCursor: null });

    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/memberships/${MEMBERSHIP_ID}`,
      headers: { authorization: AUTHORIZATION, "idempotency-key": "member-update-test-0001" },
      payload: { status: "active", groupId: GROUP_ID, studentNumber: "2026001" },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toEqual(MEMBERSHIP_VIEW);
    expect(updateMembership).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEACHER_ID }),
      MEMBERSHIP_ID,
      { status: "active", groupId: GROUP_ID, studentNumber: "2026001" },
      expect.objectContaining({ idempotency: expect.objectContaining({ routeKey: "PATCH /v1/memberships/:membershipId" }) }),
    );
  });

  it("creates a one-time-visible invite code and lets an authenticated student submit it", async () => {
    const createInvite = vi.fn(async () => ({
      id: INVITE_ID,
      code: "A".repeat(22),
      expiresAt: "2026-08-02T12:00:00.000Z",
      maxUses: 30,
      codeHash: "must not be serialized",
    }));
    const joinInvite = vi.fn(async () => ({
      membershipId: MEMBERSHIP_ID,
      status: "pending" as const,
      classId: "must not be serialized",
    }));
    const listInvites = vi.fn(async () => ({
      items: [{
        id: INVITE_ID,
        classId: CLASS_ID,
        expiresAt: "2026-08-02T12:00:00.000Z",
        maxUses: 30,
        usedCount: 0,
        status: "active" as const,
        createdAt: CREATED_AT,
      }],
      nextCursor: null,
    }));
    const revokeInvite = vi.fn(async () => ({ id: INVITE_ID, status: "revoked" as const }));
    const authenticateAccessToken = vi.fn(async (token: string) => (
      token.startsWith("student.") ? STUDENT_SESSION : TEACHER_SESSION
    ));
    const app = await buildTestApp({
      authService: { authenticateAccessToken } as unknown as AuthService,
      inviteService: invitesService({ createInvite, joinInvite, listInvites, revokeInvite }),
    });

    const invite = await app.inject({
      method: "POST",
      url: `/v1/classes/${CLASS_ID}/invites`,
      headers: { authorization: AUTHORIZATION, "idempotency-key": "invite-create-test-0001" },
      payload: { expiresAt: "2026-08-02T12:00:00.000Z", maxUses: 30 },
    });
    expect(invite.statusCode, invite.body).toBe(201);
    expect(invite.json()).toEqual({
      id: INVITE_ID,
      code: "A".repeat(22),
      expiresAt: "2026-08-02T12:00:00.000Z",
      maxUses: 30,
    });

    const joined = await app.inject({
      method: "POST",
      url: "/v1/invites/join",
      headers: {
        authorization: "Bearer student.payload.signature",
        "idempotency-key": "invite-join-test-0001",
      },
      payload: { code: "A".repeat(22) },
    });
    expect(joined.statusCode, joined.body).toBe(201);
    expect(joined.json()).toEqual({ membershipId: MEMBERSHIP_ID, status: "pending" });
    expect(joinInvite).toHaveBeenCalledWith(
      expect.objectContaining({ userId: STUDENT_ID, role: "student" }),
      { code: "A".repeat(22) },
      expect.objectContaining({ idempotency: expect.objectContaining({ key: "invite-join-test-0001" }) }),
    );

    const listed = await app.inject({
      method: "GET",
      url: `/v1/classes/${CLASS_ID}/invites`,
      headers: { authorization: AUTHORIZATION },
    });
    expect(listed.statusCode, listed.body).toBe(200);
    expect(listed.json().items[0]).not.toHaveProperty("code");
    expect(listed.json().items[0]).not.toHaveProperty("codeHash");

    const missingRevokeKey = await app.inject({
      method: "DELETE",
      url: `/v1/invites/${INVITE_ID}`,
      headers: { authorization: AUTHORIZATION },
    });
    expect(missingRevokeKey.statusCode).toBe(400);
    expect(revokeInvite).not.toHaveBeenCalled();

    const revoked = await app.inject({
      method: "DELETE",
      url: `/v1/invites/${INVITE_ID}`,
      headers: {
        authorization: AUTHORIZATION,
        "idempotency-key": "invite-revoke-test-0001",
      },
    });
    expect(revoked.statusCode, revoked.body).toBe(200);
    expect(revoked.json()).toEqual({ id: INVITE_ID, status: "revoked" });
  });

  it("rejects empty membership patches and unknown invite fields at the schema boundary", async () => {
    const app = await buildTestApp({
      authService: authService(),
      classService: classesService(),
      inviteService: invitesService(),
    });
    const emptyPatch = await app.inject({
      method: "PATCH",
      url: `/v1/memberships/${MEMBERSHIP_ID}`,
      headers: { authorization: AUTHORIZATION, "idempotency-key": "member-empty-test-0001" },
      payload: {},
    });
    expect(emptyPatch.statusCode).toBe(400);
    expect(emptyPatch.json()).toMatchObject({ code: "validation_error" });

    const unknownField = await app.inject({
      method: "POST",
      url: "/v1/invites/join",
      headers: { authorization: AUTHORIZATION, "idempotency-key": "invite-unknown-test-0001" },
      payload: { code: "A".repeat(22), userId: STUDENT_ID },
    });
    expect(unknownField.statusCode).toBe(400);
    expect(unknownField.json()).toMatchObject({ code: "validation_error" });
  });
});
