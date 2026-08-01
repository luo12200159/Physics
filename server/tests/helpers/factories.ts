import type { AppDependencies } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";

export type UnitDependencyOverrides = Partial<Omit<AppDependencies, "config">> & {
  config?: Partial<AppConfig>;
};

export function makeUnitConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: "test",
    businessHost: "127.0.0.1",
    businessPort: 8788,
    databaseUrl: "postgresql://unit:unit@127.0.0.1:5432/unit",
    redisUrl: "redis://127.0.0.1:6379",
    jwtSecret: "unit-jwt-secret-32-characters-minimum",
    cursorHmacSecret: "unit-cursor-secret-32-characters-minimum",
    inviteCodeKey: "unit-invite-code-key-32-characters-minimum",
    auditIpKey: "unit-audit-ip-key-32-characters-minimum",
    credentialArtifactKey: Buffer.alloc(32, 7),
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 2_592_000,
    corsAllowedOrigins: ["https://physics-studio.local", "https://appassets.androidplatform.net"],
    s3Endpoint: "http://127.0.0.1:9000/",
    s3Region: "us-east-1",
    s3AccessKeyId: "unit-access-key",
    s3SecretAccessKey: "unit-secret-key",
    s3Bucket: "unit-physics-studio",
    s3ForcePathStyle: true,
    smtpHost: "127.0.0.1",
    smtpPort: 1025,
    smtpSecure: false,
    smtpUser: "unit-user",
    smtpPassword: "unit-password",
    smtpFrom: "noreply@unit.invalid",
    feedbackToEmail: "luo865265@gmail.com",
    metricsToken: "unit-metrics-token-32-characters-minimum",
    tombstoneRetentionDays: 180,
    syncOutboxRetentionDays: 180,
    accountTempCredentialTtlHours: 72,
    accountDeletionGraceDays: 30,
    privacyExportRetentionDays: 7,
    ...overrides,
  };
}

export function makeUnitDependencies(overrides: UnitDependencyOverrides = {}): AppDependencies {
  const config = makeUnitConfig(overrides.config);
  const dependencies: AppDependencies = {
    config,
    postgres: overrides.postgres ?? {
      query: async () => ({ rows: [] }),
    },
    redis: overrides.redis ?? {
      ping: async () => "PONG",
      get: async () => null,
    },
    objectStorage: overrides.objectStorage ?? {
      healthcheck: async () => undefined,
    },
  };
  if (overrides.authService) dependencies.authService = overrides.authService;
  if (overrides.classService) dependencies.classService = overrides.classService;
  if (overrides.inviteService) dependencies.inviteService = overrides.inviteService;
  return dependencies;
}
