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
      version: "1.0.0",
    });

    await app.close();
  });
});
