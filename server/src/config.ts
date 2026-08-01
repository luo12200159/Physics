import { Buffer } from "node:buffer";

export type NodeEnvironment = "development" | "test" | "production";

export interface AppConfig {
  nodeEnv: NodeEnvironment;
  businessHost: string;
  businessPort: number;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  cursorHmacSecret: string;
  inviteCodeKey: string;
  auditIpKey: string;
  credentialArtifactKey: Buffer;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  corsAllowedOrigins: readonly string[];
  s3Endpoint: string;
  s3Region: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3Bucket: string;
  s3ForcePathStyle: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  smtpFrom: string;
  feedbackToEmail: "luo865265@gmail.com";
  metricsToken: string;
  tombstoneRetentionDays: number;
  syncOutboxRetentionDays: number;
  accountTempCredentialTtlHours: number;
  accountDeletionGraceDays: number;
  privacyExportRetentionDays: number;
}

const requiredNames = [
  "NODE_ENV",
  "BUSINESS_HOST",
  "BUSINESS_PORT",
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "CURSOR_HMAC_SECRET",
  "INVITE_CODE_KEY",
  "AUDIT_IP_KEY",
  "CREDENTIAL_ARTIFACT_KEY",
  "ACCESS_TOKEN_TTL_SECONDS",
  "REFRESH_TOKEN_TTL_SECONDS",
  "CORS_ALLOWED_ORIGINS",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
  "S3_FORCE_PATH_STYLE",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "FEEDBACK_TO_EMAIL",
  "METRICS_TOKEN",
  "TOMBSTONE_RETENTION_DAYS",
  "SYNC_OUTBOX_RETENTION_DAYS",
  "ACCOUNT_TEMP_CREDENTIAL_TTL_HOURS",
  "ACCOUNT_DELETION_GRACE_DAYS",
  "PRIVACY_EXPORT_RETENTION_DAYS",
] as const;

function requireValue(env: NodeJS.ProcessEnv, name: (typeof requiredNames)[number]): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseInteger(name: string, value: string, minimum: number, maximum: number): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function parseBoolean(name: string, value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function parseUrl(name: string, value: string, protocols: readonly string[]): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (!protocols.includes(url.protocol)) {
    throw new Error(`${name} must use ${protocols.join(" or ")}`);
  }
  return url.toString();
}

function parseOrigin(value: string, nodeEnv: NodeEnvironment): string {
  if (value === "null" || value.includes("*")) {
    throw new Error("CORS_ALLOWED_ORIGINS cannot contain null or wildcards");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid CORS origin: ${value}`);
  }
  if (url.origin !== value || url.username || url.password || url.search || url.hash) {
    throw new Error(`CORS origin must be an exact origin: ${value}`);
  }
  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(nodeEnv !== "production" && isLoopback && url.protocol === "http:")) {
    throw new Error(`CORS origin must use HTTPS: ${value}`);
  }
  return url.origin;
}

function parseSecret(name: string, value: string, nodeEnv: NodeEnvironment): string {
  if (value.length < 32) {
    throw new Error(`${name} must contain at least 32 characters`);
  }
  if (nodeEnv === "production" && /replace|change|example|development|test|secret/i.test(value)) {
    throw new Error(`${name} cannot use a development value in production`);
  }
  return value;
}

function parseCredentialArtifactKey(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("CREDENTIAL_ARTIFACT_KEY must be canonical base64");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== value) {
    throw new Error("CREDENTIAL_ARTIFACT_KEY must decode to exactly 32 bytes");
  }
  return decoded;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  for (const name of requiredNames) requireValue(env, name);

  const rawNodeEnv = requireValue(env, "NODE_ENV");
  if (rawNodeEnv !== "development" && rawNodeEnv !== "test" && rawNodeEnv !== "production") {
    throw new Error("NODE_ENV must be development, test, or production");
  }
  const nodeEnv: NodeEnvironment = rawNodeEnv;
  const corsAllowedOrigins = requireValue(env, "CORS_ALLOWED_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => parseOrigin(origin, nodeEnv));
  if (corsAllowedOrigins.length === 0 || new Set(corsAllowedOrigins).size !== corsAllowedOrigins.length) {
    throw new Error("CORS_ALLOWED_ORIGINS must contain unique exact origins");
  }

  const feedbackToEmail = requireValue(env, "FEEDBACK_TO_EMAIL");
  if (feedbackToEmail !== "luo865265@gmail.com") {
    throw new Error("FEEDBACK_TO_EMAIL must remain luo865265@gmail.com");
  }

  const accessTokenTtlSeconds = parseInteger(
    "ACCESS_TOKEN_TTL_SECONDS",
    requireValue(env, "ACCESS_TOKEN_TTL_SECONDS"),
    900,
    900,
  );
  const refreshTokenTtlSeconds = parseInteger(
    "REFRESH_TOKEN_TTL_SECONDS",
    requireValue(env, "REFRESH_TOKEN_TTL_SECONDS"),
    2_592_000,
    2_592_000,
  );

  return {
    nodeEnv,
    businessHost: requireValue(env, "BUSINESS_HOST"),
    businessPort: parseInteger("BUSINESS_PORT", requireValue(env, "BUSINESS_PORT"), 1, 65_535),
    databaseUrl: parseUrl("DATABASE_URL", requireValue(env, "DATABASE_URL"), ["postgres:", "postgresql:"]),
    redisUrl: parseUrl("REDIS_URL", requireValue(env, "REDIS_URL"), ["redis:", "rediss:"]),
    jwtSecret: parseSecret("JWT_SECRET", requireValue(env, "JWT_SECRET"), nodeEnv),
    cursorHmacSecret: parseSecret("CURSOR_HMAC_SECRET", requireValue(env, "CURSOR_HMAC_SECRET"), nodeEnv),
    inviteCodeKey: parseSecret("INVITE_CODE_KEY", requireValue(env, "INVITE_CODE_KEY"), nodeEnv),
    auditIpKey: parseSecret("AUDIT_IP_KEY", requireValue(env, "AUDIT_IP_KEY"), nodeEnv),
    credentialArtifactKey: parseCredentialArtifactKey(requireValue(env, "CREDENTIAL_ARTIFACT_KEY")),
    accessTokenTtlSeconds,
    refreshTokenTtlSeconds,
    corsAllowedOrigins,
    s3Endpoint: parseUrl("S3_ENDPOINT", requireValue(env, "S3_ENDPOINT"), nodeEnv === "production" ? ["https:"] : ["http:", "https:"]),
    s3Region: requireValue(env, "S3_REGION"),
    s3AccessKeyId: requireValue(env, "S3_ACCESS_KEY_ID"),
    s3SecretAccessKey: requireValue(env, "S3_SECRET_ACCESS_KEY"),
    s3Bucket: requireValue(env, "S3_BUCKET"),
    s3ForcePathStyle: parseBoolean("S3_FORCE_PATH_STYLE", requireValue(env, "S3_FORCE_PATH_STYLE")),
    smtpHost: requireValue(env, "SMTP_HOST"),
    smtpPort: parseInteger("SMTP_PORT", requireValue(env, "SMTP_PORT"), 1, 65_535),
    smtpSecure: parseBoolean("SMTP_SECURE", requireValue(env, "SMTP_SECURE")),
    smtpUser: requireValue(env, "SMTP_USER"),
    smtpPassword: requireValue(env, "SMTP_PASSWORD"),
    smtpFrom: requireValue(env, "SMTP_FROM"),
    feedbackToEmail,
    metricsToken: parseSecret("METRICS_TOKEN", requireValue(env, "METRICS_TOKEN"), nodeEnv),
    tombstoneRetentionDays: parseInteger("TOMBSTONE_RETENTION_DAYS", requireValue(env, "TOMBSTONE_RETENTION_DAYS"), 30, 3_650),
    syncOutboxRetentionDays: parseInteger("SYNC_OUTBOX_RETENTION_DAYS", requireValue(env, "SYNC_OUTBOX_RETENTION_DAYS"), 30, 3_650),
    accountTempCredentialTtlHours: parseInteger("ACCOUNT_TEMP_CREDENTIAL_TTL_HOURS", requireValue(env, "ACCOUNT_TEMP_CREDENTIAL_TTL_HOURS"), 1, 168),
    accountDeletionGraceDays: parseInteger("ACCOUNT_DELETION_GRACE_DAYS", requireValue(env, "ACCOUNT_DELETION_GRACE_DAYS"), 1, 90),
    privacyExportRetentionDays: parseInteger("PRIVACY_EXPORT_RETENTION_DAYS", requireValue(env, "PRIVACY_EXPORT_RETENTION_DAYS"), 1, 30),
  };
}
