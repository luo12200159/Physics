import { createHash, randomBytes, randomUUID } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import type { UserRole } from "./contracts.js";

const ISSUER = "physics-studio-business";
const AUDIENCE = "physics-studio-clients";
const ACCESS_TOKEN_TTL_SECONDS = 900;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEVICE_PATTERN = /^[0-9a-f]{64}$/;
const REFRESH_PATTERN = /^r1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/;
const roles = new Set<UserRole>(["student", "teacher", "parent", "administrator"]);

export type SessionStrength = "password" | "reauthenticated";

export interface AccessClaimsInput {
  userId: string;
  role: UserRole;
  familyId: string;
  deviceId: string;
  sessionStrength: SessionStrength;
  jti: string;
  nowSeconds: number;
}

export interface AccessClaims {
  userId: string;
  role: UserRole;
  familyId: string;
  deviceId: string;
  sessionStrength: SessionStrength;
  jti: string;
  issuedAt: number;
  expiresAt: number;
}

export interface RefreshTokenMaterial {
  token: string;
  tokenId: string;
  secretHash: Buffer;
}

export interface ParsedRefreshToken {
  tokenId: string;
  secret: string;
}

export function hashRefreshSecret(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function createRefreshToken(): RefreshTokenMaterial {
  const tokenId = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  return {
    token: `r1.${tokenId}.${secret}`,
    tokenId,
    secretHash: hashRefreshSecret(secret),
  };
}

export function parseRefreshToken(token: string): ParsedRefreshToken {
  const match = REFRESH_PATTERN.exec(token);
  if (!match?.[1] || !match[2]) throw new TypeError("Refresh token is malformed");
  return { tokenId: match[1], secret: match[2] };
}

export function normalizeDeviceId(deviceId: string): string {
  const normalized = deviceId.toLowerCase();
  if (!DEVICE_PATTERN.test(normalized)) {
    throw new TypeError("deviceId must contain exactly 64 hexadecimal characters");
  }
  return normalized;
}

function validateSecret(secret: Uint8Array): void {
  if (secret.byteLength < 32) throw new TypeError("JWT secret must contain at least 32 bytes");
}

function validateUuid(name: string, value: string): void {
  if (!UUID_PATTERN.test(value)) throw new TypeError(`${name} must be a lowercase canonical UUID`);
}

export async function issueAccessToken(
  claims: AccessClaimsInput,
  secret: Uint8Array,
): Promise<string> {
  validateSecret(secret);
  validateUuid("userId", claims.userId);
  validateUuid("familyId", claims.familyId);
  validateUuid("jti", claims.jti);
  if (!roles.has(claims.role)) throw new TypeError("role is invalid");
  if (claims.sessionStrength !== "password" && claims.sessionStrength !== "reauthenticated") {
    throw new TypeError("sessionStrength is invalid");
  }
  if (!Number.isSafeInteger(claims.nowSeconds) || claims.nowSeconds <= 0) {
    throw new TypeError("nowSeconds must be a positive integer");
  }
  const deviceId = normalizeDeviceId(claims.deviceId);
  return new SignJWT({
    role: claims.role,
    sid: claims.familyId,
    deviceId,
    sessionStrength: claims.sessionStrength,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(claims.userId)
    .setJti(claims.jti)
    .setIssuedAt(claims.nowSeconds)
    .setExpirationTime(claims.nowSeconds + ACCESS_TOKEN_TTL_SECONDS)
    .sign(secret);
}

export async function verifyAccessToken(
  token: string,
  secret: Uint8Array,
  currentDate: Date = new Date(),
): Promise<AccessClaims> {
  validateSecret(secret);
  const { payload, protectedHeader } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
    issuer: ISSUER,
    audience: AUDIENCE,
    currentDate,
    clockTolerance: 0,
  });
  if (protectedHeader.typ !== "JWT") throw new TypeError("JWT typ is invalid");
  if (typeof payload.sub !== "string") throw new TypeError("JWT subject is missing");
  if (typeof payload.jti !== "string") throw new TypeError("JWT ID is missing");
  if (typeof payload.sid !== "string") throw new TypeError("JWT session ID is missing");
  if (typeof payload.deviceId !== "string") throw new TypeError("JWT device ID is missing");
  if (typeof payload.role !== "string" || !roles.has(payload.role as UserRole)) {
    throw new TypeError("JWT role is invalid");
  }
  if (payload.sessionStrength !== "password" && payload.sessionStrength !== "reauthenticated") {
    throw new TypeError("JWT session strength is invalid");
  }
  if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)) {
    throw new TypeError("JWT timestamps are invalid");
  }
  if (payload.iat! > Math.floor(currentDate.getTime() / 1000)) {
    throw new TypeError("JWT issuance time is in the future");
  }
  if (payload.exp !== payload.iat! + ACCESS_TOKEN_TTL_SECONDS) {
    throw new TypeError("JWT lifetime is invalid");
  }
  validateUuid("sub", payload.sub);
  validateUuid("sid", payload.sid);
  validateUuid("jti", payload.jti);
  const deviceId = normalizeDeviceId(payload.deviceId);
  return {
    userId: payload.sub,
    role: payload.role as UserRole,
    familyId: payload.sid,
    deviceId,
    sessionStrength: payload.sessionStrength,
    jti: payload.jti,
    issuedAt: payload.iat!,
    expiresAt: payload.exp!,
  };
}
