import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";

import {
  createRefreshToken,
  issueAccessToken,
  parseRefreshToken,
  verifyAccessToken,
} from "../../src/modules/auth/tokens.js";

describe("access tokens", () => {
  const secret = new TextEncoder().encode("unit-jwt-secret-that-is-at-least-32-characters");
  const claims = {
    userId: "00000000-0000-4000-8000-000000000001",
    role: "student" as const,
    familyId: "00000000-0000-4000-8000-000000000002",
    deviceId: "A".repeat(64),
    sessionStrength: "password" as const,
    jti: "00000000-0000-4000-8000-000000000003",
    nowSeconds: 1_800_000_000,
  };

  it("expires exactly 900 seconds after issuance and normalizes the device fingerprint", async () => {
    const token = await issueAccessToken(claims, secret);
    const payload = decodeJwt(token);
    expect(payload.exp).toBe(payload.iat! + 900);
    const verified = await verifyAccessToken(token, secret, new Date((claims.nowSeconds + 899) * 1000));
    expect(verified).toMatchObject({
      userId: claims.userId,
      role: "student",
      familyId: claims.familyId,
      deviceId: "a".repeat(64),
      sessionStrength: "password",
      expiresAt: claims.nowSeconds + 900,
    });
    await expect(
      verifyAccessToken(token, secret, new Date((claims.nowSeconds + 901) * 1000)),
    ).rejects.toThrow();
  });

  it("rejects a token signed with another secret", async () => {
    const token = await issueAccessToken(claims, secret);
    const other = new TextEncoder().encode("another-unit-secret-that-is-at-least-32-chars");
    await expect(verifyAccessToken(token, other, new Date(claims.nowSeconds * 1000))).rejects.toThrow();
  });

  it("rejects a token before its issued-at time", async () => {
    const token = await issueAccessToken(claims, secret);
    await expect(
      verifyAccessToken(token, secret, new Date((claims.nowSeconds - 1) * 1000)),
    ).rejects.toThrow("issuance time is in the future");
  });

  it("creates an opaque refresh token whose secret is never part of the stored hash", () => {
    const material = createRefreshToken();
    const parsed = parseRefreshToken(material.token);
    expect(parsed.tokenId).toBe(material.tokenId);
    expect(parsed.secret).toHaveLength(43);
    expect(material.secretHash).toHaveLength(32);
    expect(material.secretHash.toString("hex")).not.toContain(parsed.secret);
  });
});
