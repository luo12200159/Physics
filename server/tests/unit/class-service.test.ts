import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import type { Actor } from "../../src/modules/authorization/policy.js";
import { createClassesService } from "../../src/modules/classes/service.js";
import { createInvitesService } from "../../src/modules/invites/service.js";

const TEACHER_ID = "60000000-0000-4000-8000-000000000001";

function actor(role: Actor["role"], sessionStrength: Actor["sessionStrength"]): Actor {
  return { userId: TEACHER_ID, role, sessionStrength };
}

function mutationContext() {
  return {
    ip: "127.0.0.1",
    requestId: "60000000-0000-4000-8000-000000000002",
    idempotency: {
      key: "class-service-test-0001",
      routeKey: "POST /v1/classes",
      requestHash: Buffer.alloc(32, 1),
    },
  };
}

describe("class service role gates", () => {
  it("does not touch persistence when a non-teacher tries to create a class", async () => {
    const connect = vi.fn();
    const service = createClassesService({
      pool: { connect } as unknown as Pool,
      auditIpKey: "unit-audit-ip-key-at-least-32-characters",
      syncOutboxRetentionDays: 180,
    });
    await expect(service.createClass(actor("student", "reauthenticated"), {
      name: "九年级一班",
      grade: "九年级",
      subject: "物理",
      schoolLabel: null,
    }, mutationContext())).rejects.toMatchObject({
      statusCode: 403,
      code: "resource_forbidden",
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it("requires recent password verification before class management", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const release = vi.fn();
    const connect = vi.fn(async () => ({ query, release }));
    const service = createClassesService({
      pool: { connect } as unknown as Pool,
      auditIpKey: "unit-audit-ip-key-at-least-32-characters",
      syncOutboxRetentionDays: 180,
    });
    await expect(service.createClass(actor("teacher", "password"), {
      name: "九年级一班",
      grade: "九年级",
      subject: "物理",
      schoolLabel: null,
    }, mutationContext())).rejects.toMatchObject({
      statusCode: 403,
      code: "reauthentication_required",
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not allow parent profiles to enumerate classes", async () => {
    const query = vi.fn();
    const service = createClassesService({
      pool: { query } as unknown as Pool,
      auditIpKey: "unit-audit-ip-key-at-least-32-characters",
      syncOutboxRetentionDays: 180,
    });
    await expect(service.listClasses(actor("parent", "password"), null)).rejects.toMatchObject({
      statusCode: 403,
      code: "resource_forbidden",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("allows only student identities to consume an invite", async () => {
    const connect = vi.fn();
    const redisEval = vi.fn();
    const service = createInvitesService({
      pool: { connect } as unknown as Pool,
      redis: { eval: redisEval },
      inviteCodeKey: "unit-invite-code-key-at-least-32-characters",
      auditIpKey: "unit-audit-ip-key-at-least-32-characters",
      syncOutboxRetentionDays: 180,
    });
    await expect(service.joinInvite(actor("teacher", "reauthenticated"), {
      code: "A".repeat(22),
    }, {
      ...mutationContext(),
      idempotency: {
        ...mutationContext().idempotency,
        routeKey: "POST /v1/invites/join",
      },
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "student_role_required",
    });
    expect(connect).not.toHaveBeenCalled();
    expect(redisEval).not.toHaveBeenCalled();
  });
});
