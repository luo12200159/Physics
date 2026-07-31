import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../../src/modules/auth/password.js";

describe("password hashing", () => {
  it("uses the fixed Argon2id work factors and verifies only the right password", async () => {
    const password = "Correct Horse Battery Staple 2026";
    const digest = await hashPassword(password);
    expect(digest).toMatch(/^\$argon2id\$v=19\$/);
    expect(digest.split("$")[3]?.split(",").sort()).toEqual(["m=65536", "p=1", "t=3"]);
    await expect(verifyPassword(digest, password)).resolves.toBe(true);
    await expect(verifyPassword(digest, `${password}!wrong`)).resolves.toBe(false);
  });

  it("treats a malformed stored digest as a failed verification", async () => {
    await expect(verifyPassword("not-an-argon2-digest", "anything")).resolves.toBe(false);
  });
});
