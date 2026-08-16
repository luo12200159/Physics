import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../src/common/errors.js";
import type { AuthenticatedSession, AuthService } from "../../src/modules/auth/service.js";
import type { OwnerCapabilityService } from "../../src/modules/classes/owner-capability.js";
import type { ClassesService } from "../../src/modules/classes/service.js";
import type { InvitesService } from "../../src/modules/invites/service.js";
import { buildTestApp } from "../helpers/test-app.js";

const CLASS_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_TOKEN = `oc1.${"A".repeat(43)}`;
const OWNER_SESSION = {
  userId: OWNER_ID,
  role: "teacher",
  sessionStrength: "reauthenticated",
} as AuthenticatedSession;

describe("scoped anonymous class owner capability", () => {
  it("can manage its own class but cannot enter the student invite route", async () => {
    const listClasses = vi.fn(async () => ({ items: [], nextCursor: null }));
    const joinInvite = vi.fn(async () => ({ membershipId: OWNER_ID, status: "pending" as const }));
    const app = await buildTestApp({
      authService: {
        authenticateAccessToken: vi.fn(async () => {
          throw new ApiError(401, "invalid_access_token", "invalid");
        }),
      } as unknown as AuthService,
      ownerCapabilityService: {
        authenticate: vi.fn(async (token: string) => {
          expect(token).toBe(OWNER_TOKEN);
          return OWNER_SESSION;
        }),
      } as unknown as OwnerCapabilityService,
      classService: { listClasses } as unknown as ClassesService,
      inviteService: { joinInvite } as unknown as InvitesService,
    });

    const managed = await app.inject({
      method: "GET",
      url: "/v1/classes",
      headers: { authorization: `Owner ${OWNER_TOKEN}` },
    });
    expect(managed.statusCode, managed.body).toBe(200);
    expect(listClasses).toHaveBeenCalledWith(expect.objectContaining({ userId: OWNER_ID, role: "teacher" }), null);

    const join = await app.inject({
      method: "POST",
      url: "/v1/invites/join",
      headers: { authorization: `Owner ${OWNER_TOKEN}`, "idempotency-key": "owner-join-test-0001" },
      payload: { code: "B".repeat(22) },
    });
    expect(join.statusCode).toBe(401);
    expect(joinInvite).not.toHaveBeenCalled();
  });
});
