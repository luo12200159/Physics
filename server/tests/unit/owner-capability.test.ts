import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  createOwnerCapability,
  hashOwnerCapability,
  OwnerCapabilityService,
} from "../../src/modules/classes/owner-capability.js";

const SECRET = "unit-owner-capability-secret-at-least-32-bytes";
const OWNER_ID = "80000000-0000-4000-8000-000000000001";
const CLASS_ID = "80000000-0000-4000-8000-000000000002";

describe("class owner capability", () => {
  it("creates an opaque scoped token and never exposes its digest as the token", () => {
    const material = createOwnerCapability(OWNER_ID, SECRET, new Date("2026-01-01T00:00:00.000Z"));
    expect(material.token).toMatch(/^oc1\.[A-Za-z0-9_-]{43}$/);
    expect(material.tokenHash.toString("base64url")).not.toContain(material.token);
    expect(hashOwnerCapability(material.token, SECRET)).toEqual(material.tokenHash);
  });

  it("authenticates only an active, unexpired owner capability as teacher", async () => {
    const material = createOwnerCapability(OWNER_ID, SECRET, new Date("2026-01-01T00:00:00.000Z"));
    const query = vi.fn().mockResolvedValue({ rows: [{
      id: material.id,
      owner_user_id: OWNER_ID,
      class_id: CLASS_ID,
      expires_at: material.expiresAt,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      user_display_name: "Local teacher",
      user_status: "active",
    }] });
    const service = new OwnerCapabilityService({
      pool: { query } as unknown as Pool,
      secret: SECRET,
      now: () => new Date("2026-01-02T00:00:00.000Z"),
    });
    const session = await service.authenticate(material.token);
    expect(session.role).toBe("teacher");
    expect(session.userId).toBe(OWNER_ID);
    expect(session.sessionStrength).toBe("reauthenticated");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("class_owner_capabilities"), expect.any(Array));
  });

  it("rejects malformed tokens before a database lookup", async () => {
    const query = vi.fn();
    const service = new OwnerCapabilityService({
      pool: { query } as unknown as Pool,
      secret: SECRET,
    });
    await expect(service.authenticate("owner-token")).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
