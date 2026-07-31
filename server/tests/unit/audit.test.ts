import { describe, expect, it } from "vitest";

import { hashAuditIp } from "../../src/modules/audit/repository.js";

describe("audit IP protection", () => {
  const key = "unit-audit-hmac-key-at-least-32-characters";

  it("normalizes equivalent IPv4 and IPv6 representations before HMAC", () => {
    expect(hashAuditIp(key, "::ffff:127.0.0.1").equals(hashAuditIp(key, "127.0.0.1"))).toBe(true);
    expect(
      hashAuditIp(key, "2001:0db8:0000:0000:0000:0000:0000:0001")
        .equals(hashAuditIp(key, "2001:db8::1")),
    ).toBe(true);
  });

  it("rejects non-IP input rather than hashing raw text", () => {
    expect(() => hashAuditIp(key, "forwarded-for: attacker.invalid")).toThrow(TypeError);
  });
});
