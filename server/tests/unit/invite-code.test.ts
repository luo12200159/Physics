import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { InvitesRepository } from "../../src/modules/invites/repository.js";
import { deriveInviteCode, hashInviteCode } from "../../src/modules/invites/service.js";

const INVITE_ID = "50000000-0000-4000-8000-000000000001";
const OTHER_INVITE_ID = "50000000-0000-4000-8000-000000000002";
const KEY = "unit-invite-code-key-at-least-32-characters";

describe("invitation code protection", () => {
  it("derives an unpredictable 128-bit base64url code and hashes it to 32 bytes", () => {
    const code = deriveInviteCode(INVITE_ID, KEY);
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Buffer.from(code, "base64url")).toHaveLength(16);
    expect(deriveInviteCode(INVITE_ID, KEY)).toBe(code);
    expect(deriveInviteCode(OTHER_INVITE_ID, KEY)).not.toBe(code);
    expect(deriveInviteCode(INVITE_ID, `${KEY}-different`)).not.toBe(code);
    expect(hashInviteCode(code)).toHaveLength(32);
  });

  it("passes only the digest, never the raw code, to the invite insert", async () => {
    const code = deriveInviteCode(INVITE_ID, KEY);
    const codeHash = hashInviteCode(code);
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]) => ({ rowCount: 1, rows: [] }));
    const repository = new InvitesRepository({} as Pool);
    await repository.insertInvite({ query } as unknown as PoolClient, {
      id: INVITE_ID,
      classId: OTHER_INVITE_ID,
      codeHash,
      expiresAt: new Date("2026-08-02T12:00:00.000Z"),
      maxUses: 30,
      createdBy: "50000000-0000-4000-8000-000000000003",
      createdAt: new Date("2026-08-01T12:00:00.000Z"),
    });
    const parameters = query.mock.calls[0]?.[1] as unknown[];
    expect(parameters).not.toContain(code);
    expect(parameters[2]).toEqual(codeHash);
  });

  it("rejects short keys, malformed identifiers, and low-entropy codes", () => {
    expect(() => deriveInviteCode(INVITE_ID, "short-key")).toThrow(/32 bytes/);
    expect(() => deriveInviteCode("not-a-uuid", KEY)).toThrow(/UUID/);
    expect(() => hashInviteCode("123456")).toThrow(/malformed/);
  });
});
