import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config.js";

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    BUSINESS_HOST: "127.0.0.1",
    BUSINESS_PORT: "8788",
    DATABASE_URL: "postgresql://unit:unit@127.0.0.1:5432/unit",
    REDIS_URL: "redis://127.0.0.1:6379",
    JWT_SECRET: "unit-jwt-secret-32-characters-minimum",
    CURSOR_HMAC_SECRET: "unit-cursor-secret-32-characters-minimum",
    INVITE_CODE_KEY: "unit-invite-code-key-32-characters-minimum",
    AUDIT_IP_KEY: "unit-audit-ip-key-32-characters-minimum",
    CREDENTIAL_ARTIFACT_KEY: Buffer.alloc(32, 7).toString("base64"),
    ACCESS_TOKEN_TTL_SECONDS: "900",
    REFRESH_TOKEN_TTL_SECONDS: "2592000",
    CORS_ALLOWED_ORIGINS: "https://physics-studio.local,https://appassets.androidplatform.net",
    S3_ENDPOINT: "http://127.0.0.1:9000",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY_ID: "unit-access",
    S3_SECRET_ACCESS_KEY: "unit-secret",
    S3_BUCKET: "unit-bucket",
    S3_FORCE_PATH_STYLE: "true",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "1025",
    SMTP_SECURE: "false",
    SMTP_USER: "unit-user",
    SMTP_PASSWORD: "unit-password",
    SMTP_FROM: "noreply@unit.invalid",
    FEEDBACK_TO_EMAIL: "luo865265@gmail.com",
    METRICS_TOKEN: "unit-metrics-token-32-characters-minimum",
    TOMBSTONE_RETENTION_DAYS: "180",
    SYNC_OUTBOX_RETENTION_DAYS: "180",
    ACCOUNT_TEMP_CREDENTIAL_TTL_HOURS: "72",
    ACCOUNT_DELETION_GRACE_DAYS: "30",
    PRIVACY_EXPORT_RETENTION_DAYS: "7",
  };
}

describe("protocol authentication lifetime configuration", () => {
  it("accepts only the fixed 900-second access and 30-day refresh lifetimes", () => {
    expect(loadConfig(validEnvironment())).toMatchObject({
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 2_592_000,
    });
    expect(() => loadConfig({ ...validEnvironment(), ACCESS_TOKEN_TTL_SECONDS: "901" }))
      .toThrow("ACCESS_TOKEN_TTL_SECONDS must be between 900 and 900");
    expect(() => loadConfig({ ...validEnvironment(), REFRESH_TOKEN_TTL_SECONDS: "2591999" }))
      .toThrow("REFRESH_TOKEN_TTL_SECONDS must be between 2592000 and 2592000");
  });

  it("requires a dedicated stable invitation-code key", () => {
    expect(loadConfig(validEnvironment()).inviteCodeKey)
      .toBe("unit-invite-code-key-32-characters-minimum");
    const missing = validEnvironment();
    delete missing.INVITE_CODE_KEY;
    expect(() => loadConfig(missing)).toThrow("Missing required environment variable: INVITE_CODE_KEY");
  });

  it("permits explicit private-LAN HTTP origins only outside production", () => {
    const development = {
      ...validEnvironment(),
      CORS_ALLOWED_ORIGINS: "http://192.168.10.8:5173,https://appassets.androidplatform.net",
    };
    expect(loadConfig(development).corsAllowedOrigins)
      .toContain("http://192.168.10.8:5173");

    expect(() => loadConfig({ ...development, NODE_ENV: "production" }))
      .toThrow("CORS origin must use HTTPS");
  });
});
