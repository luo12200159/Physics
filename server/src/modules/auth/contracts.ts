import { Type, type Static } from "@sinclair/typebox";

import { StrictObject } from "../../common/schema.js";

export const UserRoleSchema = Type.Union([
  Type.Literal("student"),
  Type.Literal("teacher"),
  Type.Literal("parent"),
  Type.Literal("administrator"),
]);

export const AuthUserSchema = StrictObject({
  id: Type.String({ pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" }),
  role: UserRoleSchema,
  displayName: Type.String({ minLength: 1, maxLength: 80 }),
  status: Type.Union([Type.Literal("active"), Type.Literal("disabled")]),
  mustChangePassword: Type.Boolean(),
  deletionPending: Type.Boolean(),
});

export const LoginRequestSchema = StrictObject({
  login: Type.String({ minLength: 1, maxLength: 120 }),
  password: Type.String({ minLength: 1, maxLength: 1_024 }),
  deviceId: Type.String({ pattern: "^[0-9A-Fa-f]{64}$" }),
  deviceName: Type.String({ minLength: 1, maxLength: 80 }),
});

export const AuthResponseSchema = StrictObject({
  accessToken: Type.String({ minLength: 80, maxLength: 4_096 }),
  refreshToken: Type.String({
    pattern: "^r1\\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.[A-Za-z0-9_-]{43}$",
  }),
  user: AuthUserSchema,
});

export const RefreshRequestSchema = StrictObject({
  refreshToken: Type.String({
    pattern: "^r1\\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.[A-Za-z0-9_-]{43}$",
  }),
});

export const ReauthenticateRequestSchema = StrictObject({
  password: Type.String({ minLength: 1, maxLength: 1_024 }),
});

export const ReauthenticateResponseSchema = StrictObject({
  accessToken: Type.String({ minLength: 80, maxLength: 4_096 }),
  user: AuthUserSchema,
});

export const ChangePasswordRequestSchema = StrictObject({
  currentPassword: Type.String({ minLength: 1, maxLength: 1_024 }),
  newPassword: Type.String({ minLength: 1, maxLength: 128 }),
});

export const ChangePasswordResponseSchema = StrictObject({
  user: AuthUserSchema,
});

export type UserRole = Static<typeof UserRoleSchema>;
export type AuthUser = Static<typeof AuthUserSchema>;
export type LoginRequest = Static<typeof LoginRequestSchema>;
export type AuthResponse = Static<typeof AuthResponseSchema>;
export type RefreshRequest = Static<typeof RefreshRequestSchema>;
export type ReauthenticateRequest = Static<typeof ReauthenticateRequestSchema>;
export type ReauthenticateResponse = Static<typeof ReauthenticateResponseSchema>;
export type ChangePasswordRequest = Static<typeof ChangePasswordRequestSchema>;
export type ChangePasswordResponse = Static<typeof ChangePasswordResponseSchema>;
