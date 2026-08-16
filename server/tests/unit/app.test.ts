import { describe, expect, it } from "vitest";

import { buildTestApp } from "../helpers/test-app.js";

describe("business application kernel", () => {
  it("uses the stable service identity", async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "physics-studio-business",
      version: "3.2.0",
    });

    await app.close();
  });

  it("allows configured application origins and rejects unknown browser origins", async () => {
    const app = await buildTestApp();
    const allowed = await app.inject({
      method: "OPTIONS",
      url: "/v1/invites/join-anonymous",
      headers: {
        origin: "https://appassets.androidplatform.net",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,idempotency-key",
      },
    });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers["access-control-allow-origin"])
      .toBe("https://appassets.androidplatform.net");
    expect(allowed.headers.vary).toContain("Origin");

    const denied = await app.inject({
      method: "OPTIONS",
      url: "/v1/invites/join-anonymous",
      headers: {
        origin: "https://untrusted.invalid",
        "access-control-request-method": "POST",
      },
    });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
