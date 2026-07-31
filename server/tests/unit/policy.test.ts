import { describe, expect, it } from "vitest";

import {
  authorize,
  type Actor,
  type AuthorizationAction,
  type ResourceContext,
} from "../../src/modules/authorization/policy.js";

const teacher: Actor = {
  userId: "00000000-0000-4000-8000-000000000001",
  role: "teacher",
  sessionStrength: "password",
};

const ownedClass: ResourceContext = {
  classId: "00000000-0000-4000-8000-000000000010",
  ownerTeacherId: teacher.userId,
  ownerUserId: null,
  activeMember: false,
  guardianLinked: false,
};

describe("authorization policy", () => {
  it("denies a teacher reading another teacher's class", () => {
    const result = authorize(
      teacher,
      "class.read",
      {
        ...ownedClass,
        ownerTeacherId: "00000000-0000-4000-8000-000000000002",
      },
    );
    expect(result).toEqual({ allowed: false, code: "resource_forbidden" });
  });

  it("requires a high-strength session before sensitive owner operations", () => {
    expect(authorize(teacher, "assignment.publish", ownedClass)).toEqual({
      allowed: false,
      code: "reauthentication_required",
    });
    expect(authorize(
      { ...teacher, sessionStrength: "reauthenticated" },
      "assignment.publish",
      ownedClass,
    )).toEqual({ allowed: true });
  });

  it.each([
    ["submission.create", "student", true],
    ["parent.summary", "parent", true],
    ["content.create", "teacher", true],
  ] as const)("authorizes %s only for its intended role", (action, role, expected) => {
    const actor: Actor = {
      userId: "00000000-0000-4000-8000-000000000003",
      role,
      sessionStrength: "password",
    };
    const resource: ResourceContext = {
      ...ownedClass,
      activeMember: role === "student",
      guardianLinked: role === "parent",
    };
    expect(authorize(actor, action as AuthorizationAction, resource).allowed).toBe(expected);
  });

  it("keeps self-service privacy access scoped to the owner", () => {
    const student: Actor = {
      userId: "00000000-0000-4000-8000-000000000004",
      role: "student",
      sessionStrength: "password",
    };
    expect(authorize(student, "privacy.read", {
      ...ownedClass,
      ownerUserId: student.userId,
    })).toEqual({ allowed: true });
    expect(authorize(student, "privacy.read", {
      ...ownedClass,
      ownerUserId: "00000000-0000-4000-8000-000000000005",
    })).toEqual({ allowed: false, code: "resource_forbidden" });
  });

  it("does not let an administrator impersonate a student or parent", () => {
    const administrator: Actor = {
      userId: "00000000-0000-4000-8000-000000000006",
      role: "administrator",
      sessionStrength: "reauthenticated",
    };
    expect(authorize(administrator, "submission.create", {
      ...ownedClass,
      activeMember: true,
    })).toEqual({ allowed: false, code: "resource_forbidden" });
    expect(authorize(administrator, "parent.summary", {
      ...ownedClass,
      guardianLinked: true,
    })).toEqual({ allowed: false, code: "resource_forbidden" });
  });

  it("checks role and ownership before suggesting reauthentication", () => {
    expect(authorize(teacher, "assignment.publish", {
      ...ownedClass,
      ownerTeacherId: "00000000-0000-4000-8000-000000000007",
    })).toEqual({ allowed: false, code: "resource_forbidden" });
  });

  it("requires administrator reauthentication for content review", () => {
    const administrator: Actor = {
      userId: "00000000-0000-4000-8000-000000000008",
      role: "administrator",
      sessionStrength: "password",
    };
    expect(authorize(administrator, "content.review", ownedClass)).toEqual({
      allowed: false,
      code: "reauthentication_required",
    });
  });
});
