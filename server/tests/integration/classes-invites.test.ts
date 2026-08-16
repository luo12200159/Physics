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
import { createClassesService, type ClassesService } from "../../src/modules/classes/service.js";
import { OwnerCapabilityService } from "../../src/modules/classes/owner-capability.js";
import { createInvitesService, type InvitesService } from "../../src/modules/invites/service.js";
import { startPostgres, startRedis } from "../helpers/containers.js";
import { buildTestApp } from "../helpers/test-app.js";

describe("teacher class and student invite lifecycle", () => {
  const database = startPostgres();
  const cache = startRedis();
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const password = "Correct Horse Battery Staple 2026";
  const teacherA = "70000000-0000-4000-8000-000000000001";
  const teacherB = "70000000-0000-4000-8000-000000000002";
  const studentA = "70000000-0000-4000-8000-000000000003";
  const studentB = "70000000-0000-4000-8000-000000000004";

  let pool: Pool;
  let redis: Redis;
  let auth: AuthService;
  let classes: ClassesService;
  let invites: InvitesService;
  let ownerCapabilities: OwnerCapabilityService;
  let app: FastifyInstance;

  beforeAll(async () => {
    await Promise.all([database.start(), cache.start()]);
    process.env.DATABASE_URL = database.connectionString();
    await runMigrations("up");
    pool = createPool(database.connectionString());
    redis = createRedis(cache.connectionString());
    const passwordHash = await hashPassword(password);
    await pool.query(
      `insert into users(id, role, display_name, status, must_change_password) values
       ($1, 'teacher', 'Teacher A', 'active', false),
       ($2, 'teacher', 'Teacher B', 'active', false),
       ($3, 'student', 'Student A', 'active', false),
       ($4, 'student', 'Student B', 'active', false)`,
      [teacherA, teacherB, studentA, studentB],
    );
    await pool.query(
      `insert into password_credentials(user_id, login_normalized, password_hash) values
       ($1, 'class-teacher-a', $5),
       ($2, 'class-teacher-b', $5),
       ($3, 'class-student-a', $5),
       ($4, 'class-student-b', $5)`,
      [teacherA, teacherB, studentA, studentB, passwordHash],
    );
    auth = createAuthService({
      pool,
      redis,
      jwtSecret: "integration-class-jwt-secret-at-least-32-characters",
      auditIpKey: "integration-class-audit-key-at-least-32-characters",
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 2_592_000,
    });
    classes = createClassesService({
      pool,
      auditIpKey: "integration-class-audit-key-at-least-32-characters",
      ownerCapabilitySecret: "integration-owner-capability-key-at-least-32-characters",
      syncOutboxRetentionDays: 180,
    });
    ownerCapabilities = new OwnerCapabilityService({
      pool,
      secret: "integration-owner-capability-key-at-least-32-characters",
    });
    invites = createInvitesService({
      pool,
      redis,
      inviteCodeKey: "integration-invite-code-key-at-least-32-characters",
      auditIpKey: "integration-class-audit-key-at-least-32-characters",
      syncOutboxRetentionDays: 180,
      jwtSecret: "integration-class-jwt-secret-at-least-32-characters",
      refreshTokenTtlSeconds: 2_592_000,
    });
  }, 120_000);

  beforeEach(async () => {
    app = await buildTestApp({
      authService: auth,
      classService: classes,
      ownerCapabilityService: ownerCapabilities,
      inviteService: invites,
    });
  });

  afterAll(async () => {
    await redis?.quit();
    await pool?.end();
    await Promise.all([database.stop(), cache.stop()]);
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  async function login(loginName: string, deviceCharacter: string): Promise<AuthResponse> {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        login: loginName,
        password,
        deviceId: deviceCharacter.repeat(64),
        deviceName: "Class integration device",
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<AuthResponse>();
  }

  async function elevate(session: AuthResponse): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/reauthenticate",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { password },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<ReauthenticateResponse>().accessToken;
  }

  it("creates an anonymous teacher class and lets one device join idempotently before owner deletion", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/classes/anonymous",
      payload: { name: "  无账号教师班级  " },
    });
    expect(created.statusCode, created.body).toBe(201);
    const createdBody = created.json<{
      class: { id: string; name: string };
      ownerCapability: string;
    }>();
    expect(createdBody.class.name).toBe("无账号教师班级");
    expect(createdBody.class.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(createdBody.ownerCapability).toMatch(/^oc1\./);
    const ownerAuthorization = `Owner ${createdBody.ownerCapability}`;

    const invite = await app.inject({
      method: "POST",
      url: `/v1/classes/${createdBody.class.id}/invites`,
      headers: {
        authorization: ownerAuthorization,
        "idempotency-key": "anonymous-flow-invite-0001",
      },
      payload: {
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        maxUses: 20,
      },
    });
    expect(invite.statusCode, invite.body).toBe(201);
    const code = String(invite.json().code);
    const deviceId = "9".repeat(64);
    const join = () => app.inject({
      method: "POST",
      url: "/v1/invites/join-anonymous",
      payload: { code, displayName: "学生备注", deviceId },
    });
    const firstJoin = await join();
    const secondJoin = await join();
    expect(firstJoin.statusCode, firstJoin.body).toBe(201);
    expect(secondJoin.statusCode, secondJoin.body).toBe(201);
    expect(secondJoin.json().membershipId).toBe(firstJoin.json().membershipId);
    expect(secondJoin.json().user.role).toBe("student");
    const membershipCount = await pool.query<{ count: string }>(
      `select count(*)::text as count
         from memberships
        where class_id = $1 and status <> 'removed'`,
      [createdBody.class.id],
    );
    expect(membershipCount.rows[0]?.count).toBe("1");

    const removed = await app.inject({
      method: "DELETE",
      url: `/v1/classes/${createdBody.class.id}`,
      headers: {
        authorization: ownerAuthorization,
        "idempotency-key": "anonymous-flow-delete-0001",
      },
    });
    expect(removed.statusCode, removed.body).toBe(200);
    const staleJoin = await join();
    expect(staleJoin.statusCode, staleJoin.body).toBe(409);
    expect(staleJoin.json()).toMatchObject({ code: "invite_unavailable" });
  });

  it("creates, joins, approves, groups, syncs, and isolates one class", async () => {
    const teacherASession = await login("class-teacher-a", "a");
    const teacherBSession = await login("class-teacher-b", "b");
    const studentASession = await login("class-student-a", "c");
    const studentBSession = await login("class-student-b", "d");
    const teacherAToken = await elevate(teacherASession);

    const created = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: {
        authorization: `Bearer ${teacherAToken}`,
        "idempotency-key": "class-create-integration-0001",
      },
      payload: {
        name: "九年级一班",
        grade: "九年级",
        subject: "物理",
        schoolLabel: "示例学校",
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const classId = String(created.json().id);

    const inviteExpiresAt = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
    const invite = await app.inject({
      method: "POST",
      url: `/v1/classes/${classId}/invites`,
      headers: {
        authorization: `Bearer ${teacherAToken}`,
        "idempotency-key": "invite-create-integration-0001",
      },
      payload: { expiresAt: inviteExpiresAt, maxUses: 1 },
    });
    expect(invite.statusCode, invite.body).toBe(201);
    const inviteBody = invite.json<{ id: string; code: string }>();
    expect(inviteBody.code).toMatch(/^[A-Za-z0-9_-]{22}$/);

    await pool.query("update classes set status = 'archived' where id = $1", [classId]);
    const replayedInvite = await app.inject({
      method: "POST",
      url: `/v1/classes/${classId}/invites`,
      headers: {
        authorization: `Bearer ${teacherAToken}`,
        "idempotency-key": "invite-create-integration-0001",
      },
      payload: { expiresAt: inviteExpiresAt, maxUses: 1 },
    });
    expect(replayedInvite.statusCode, replayedInvite.body).toBe(201);
    expect(replayedInvite.json().code).toBe(inviteBody.code);
    await pool.query("update classes set status = 'active' where id = $1", [classId]);

    const persistedInvite = await pool.query<{
      hash_bytes: number;
      idempotency_body: string;
      audit_state: string;
    }>(
      `select octet_length(invites.code_hash)::integer as hash_bytes,
              idempotency.response_body::text as idempotency_body,
              audit.after_state::text as audit_state
         from invites
         join api_idempotency idempotency
           on idempotency.actor_id = $1
          and idempotency.route_key = 'POST /v1/classes/:classId/invites'
          and idempotency.idempotency_key = 'invite-create-integration-0001'
         join audit_events audit
           on audit.resource_type = 'invite' and audit.resource_id = invites.id::text
        where invites.id = $2`,
      [teacherA, inviteBody.id],
    );
    expect(persistedInvite.rows[0]?.hash_bytes).toBe(32);
    expect(persistedInvite.rows[0]?.idempotency_body).not.toContain(inviteBody.code);
    expect(persistedInvite.rows[0]?.audit_state).not.toContain(inviteBody.code);

    const joined = await app.inject({
      method: "POST",
      url: "/v1/invites/join",
      headers: {
        authorization: `Bearer ${studentASession.accessToken}`,
        "idempotency-key": "invite-join-integration-0001",
      },
      payload: { code: inviteBody.code },
    });
    expect(joined.statusCode, joined.body).toBe(201);
    expect(joined.json().status).toBe("pending");
    const membershipId = String(joined.json().membershipId);

    const exhausted = await app.inject({
      method: "POST",
      url: "/v1/invites/join",
      headers: {
        authorization: `Bearer ${studentBSession.accessToken}`,
        "idempotency-key": "invite-join-integration-0002",
      },
      payload: { code: inviteBody.code },
    });
    expect(exhausted.statusCode, exhausted.body).toBe(409);
    expect(exhausted.json()).toMatchObject({ code: "invite_exhausted" });

    const expiringInvite = await app.inject({
      method: "POST",
      url: `/v1/classes/${classId}/invites`,
      headers: {
        authorization: `Bearer ${teacherAToken}`,
        "idempotency-key": "invite-create-integration-0002",
      },
      payload: {
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        maxUses: 5,
      },
    });
    expect(expiringInvite.statusCode, expiringInvite.body).toBe(201);
    await pool.query("update invites set expires_at = now() - interval '1 second' where id = $1", [
      expiringInvite.json().id,
    ]);
    const expired = await app.inject({
      method: "POST",
      url: "/v1/invites/join",
      headers: {
        authorization: `Bearer ${studentBSession.accessToken}`,
        "idempotency-key": "invite-expired-integration-0001",
      },
      payload: { code: expiringInvite.json().code },
    });
    expect(expired.statusCode, expired.body).toBe(409);
    expect(expired.json()).toMatchObject({ code: "invite_unavailable" });

    const revoked = await app.inject({
      method: "DELETE",
      url: `/v1/invites/${String(expiringInvite.json().id)}`,
      headers: {
        authorization: `Bearer ${teacherAToken}`,
        "idempotency-key": "invite-revoke-integration-0001",
      },
    });
    expect(revoked.statusCode, revoked.body).toBe(200);
    expect(revoked.json()).toEqual({ id: expiringInvite.json().id, status: "revoked" });

    const inviteList = await app.inject({
      method: "GET",
      url: `/v1/classes/${classId}/invites`,
      headers: { authorization: `Bearer ${teacherAToken}` },
    });
    expect(inviteList.statusCode, inviteList.body).toBe(200);
    expect(inviteList.json().items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expiringInvite.json().id, status: "revoked" }),
    ]));
    expect(inviteList.body).not.toContain(inviteBody.code);

    const nonOwnerTeacherMembershipId = "70000000-0000-4000-8000-000000000099";
    await pool.query(
      `insert into memberships(
         id, class_id, user_id, member_role, status, joined_at, updated_at
       ) values ($1, $2, $3, 'teacher', 'active', now(), now())`,
      [nonOwnerTeacherMembershipId, classId, teacherB],
    );
    const denied = await app.inject({
      method: "GET",
      url: `/v1/classes/${classId}/members`,
      headers: { authorization: `Bearer ${teacherBSession.accessToken}` },
    });
    expect(denied.statusCode, denied.body).toBe(403);
    expect(denied.json()).toMatchObject({ code: "resource_forbidden" });
    await pool.query("update memberships set status = 'removed' where id = $1", [
      nonOwnerTeacherMembershipId,
    ]);

    const pendingRoster = await app.inject({
      method: "GET",
      url: `/v1/classes/${classId}/members`,
      headers: { authorization: `Bearer ${teacherAToken}` },
    });
    expect(pendingRoster.statusCode, pendingRoster.body).toBe(200);
    expect(pendingRoster.json().items).toEqual([
      expect.objectContaining({ id: membershipId, userId: studentA, status: "pending", revision: 1 }),
    ]);

    const group = await app.inject({
      method: "POST",
      url: `/v1/classes/${classId}/groups`,
      headers: {
        authorization: `Bearer ${teacherAToken}`,
        "idempotency-key": "group-create-integration-0001",
      },
      payload: { name: "专项巩固组" },
    });
    expect(group.statusCode, group.body).toBe(201);
    const groupId = String(group.json().id);

    const secondClass = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: {
        authorization: `Bearer ${teacherAToken}`,
        "idempotency-key": "class-create-integration-0002",
      },
      payload: {
        name: "九年级二班",
        grade: "九年级",
        subject: "物理",
        schoolLabel: null,
      },
    });
    expect(secondClass.statusCode, secondClass.body).toBe(201);
    const secondGroup = await app.inject({
      method: "POST",
      url: `/v1/classes/${String(secondClass.json().id)}/groups`,
      headers: {
        authorization: `Bearer ${teacherAToken}`,
        "idempotency-key": "group-create-integration-0002",
      },
      payload: { name: "另一班分组" },
    });
    expect(secondGroup.statusCode, secondGroup.body).toBe(201);
    const wrongClassGroup = await app.inject({
      method: "PATCH",
      url: `/v1/memberships/${membershipId}`,
      headers: {
        authorization: `Bearer ${teacherAToken}`,
        "idempotency-key": "membership-update-integration-wrong-group",
      },
      payload: { groupId: secondGroup.json().id },
    });
    expect(wrongClassGroup.statusCode, wrongClassGroup.body).toBe(409);
    expect(wrongClassGroup.json()).toMatchObject({ code: "group_class_mismatch" });

    const activated = await app.inject({
      method: "PATCH",
      url: `/v1/memberships/${membershipId}`,
      headers: {
        authorization: `Bearer ${teacherAToken}`,
        "idempotency-key": "membership-update-integration-0001",
      },
      payload: { status: "active", groupId, studentNumber: "2026001" },
    });
    expect(activated.statusCode, activated.body).toBe(200);
    expect(activated.json()).toMatchObject({
      id: membershipId,
      groupId,
      status: "active",
      revision: 2,
      studentNumber: "2026001",
    });

    const studentClasses = await app.inject({
      method: "GET",
      url: "/v1/classes",
      headers: { authorization: `Bearer ${studentASession.accessToken}` },
    });
    expect(studentClasses.statusCode, studentClasses.body).toBe(200);
    expect(studentClasses.json().items).toEqual([
      expect.objectContaining({ id: classId, name: "九年级一班" }),
    ]);

    const outbox = await pool.query<{ count: string }>(
      `select count(*)::text as count from sync_outbox
        where entity_type = 'membership' and entity_id = $1`,
      [membershipId],
    );
    expect(outbox.rows[0]?.count).toBe("4");
  });

  it("lets only the owner delete a class and immediately invalidates membership and invites", async () => {
    const teacherASession = await login("class-teacher-a", "e");
    const teacherBSession = await login("class-teacher-b", "f");
    const studentASession = await login("class-student-a", "1");
    const studentBSession = await login("class-student-b", "2");
    const teacherAToken = await elevate(teacherASession);
    const teacherBToken = await elevate(teacherBSession);

    const created = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: {
        authorization: `Bearer ${teacherAToken}`,
        "idempotency-key": "class-delete-flow-create-0001",
      },
      payload: { name: "删除流程测试班", grade: "高一", subject: "物理", schoolLabel: null },
    });
    expect(created.statusCode, created.body).toBe(201);
    const classId = String(created.json().id);

    const invite = await app.inject({
      method: "POST",
      url: `/v1/classes/${classId}/invites`,
      headers: {
        authorization: `Bearer ${teacherAToken}`,
        "idempotency-key": "class-delete-flow-invite-0001",
      },
      payload: {
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        maxUses: 5,
      },
    });
    expect(invite.statusCode, invite.body).toBe(201);
    const inviteCode = String(invite.json().code);

    const joined = await app.inject({
      method: "POST",
      url: "/v1/invites/join",
      headers: {
        authorization: `Bearer ${studentASession.accessToken}`,
        "idempotency-key": "class-delete-flow-join-0001",
      },
      payload: { code: inviteCode },
    });
    expect(joined.statusCode, joined.body).toBe(201);
    const membershipId = String(joined.json().membershipId);
    const activated = await app.inject({
      method: "PATCH",
      url: `/v1/memberships/${membershipId}`,
      headers: {
        authorization: `Bearer ${teacherAToken}`,
        "idempotency-key": "class-delete-flow-activate-0001",
      },
      payload: { status: "active" },
    });
    expect(activated.statusCode, activated.body).toBe(200);

    const detail = await app.inject({
      method: "GET",
      url: `/v1/classes/${classId}`,
      headers: { authorization: `Bearer ${studentASession.accessToken}` },
    });
    expect(detail.statusCode, detail.body).toBe(200);

    const forbidden = await app.inject({
      method: "DELETE",
      url: `/v1/classes/${classId}`,
      headers: {
        authorization: `Bearer ${teacherBToken}`,
        "idempotency-key": "class-delete-flow-other-teacher",
      },
    });
    expect(forbidden.statusCode, forbidden.body).toBe(403);
    expect(forbidden.json()).toMatchObject({ code: "resource_forbidden" });

    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/classes/${classId}`,
      headers: {
        authorization: `Bearer ${teacherAToken}`,
        "idempotency-key": "class-delete-flow-owner-0001",
      },
    });
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(deleted.json()).toEqual({ id: classId, status: "archived" });

    const persisted = await pool.query<{
      class_status: string;
      invite_status: string;
      membership_status: string;
      active_owner_capabilities: string;
    }>(
      `select classes.status as class_status,
              invites.status as invite_status,
              memberships.status as membership_status,
              (select count(*)::text
                 from class_owner_capabilities capabilities
                where capabilities.class_id = classes.id
                  and capabilities.revoked_at is null) as active_owner_capabilities
         from classes
         join invites on invites.class_id = classes.id
         join memberships on memberships.class_id = classes.id
        where classes.id = $1 and memberships.id = $2`,
      [classId, membershipId],
    );
    expect(persisted.rows[0]).toEqual({
      class_status: "archived",
      invite_status: "revoked",
      membership_status: "removed",
      active_owner_capabilities: "0",
    });

    const staleInvite = await app.inject({
      method: "POST",
      url: "/v1/invites/join",
      headers: {
        authorization: `Bearer ${studentBSession.accessToken}`,
        "idempotency-key": "class-delete-flow-stale-invite",
      },
      payload: { code: inviteCode },
    });
    expect(staleInvite.statusCode, staleInvite.body).toBe(409);
    expect(staleInvite.json()).toMatchObject({ code: "invite_unavailable" });

    const studentClasses = await app.inject({
      method: "GET",
      url: "/v1/classes",
      headers: { authorization: `Bearer ${studentASession.accessToken}` },
    });
    expect(studentClasses.statusCode, studentClasses.body).toBe(200);
    expect(studentClasses.json().items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: classId }),
    ]));

    const deletedDetail = await app.inject({
      method: "GET",
      url: `/v1/classes/${classId}`,
      headers: { authorization: `Bearer ${teacherAToken}` },
    });
    expect(deletedDetail.statusCode, deletedDetail.body).toBe(404);
  });
});
