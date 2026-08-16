import { Type, type Static } from "@sinclair/typebox";

import { StrictObject } from "../../common/schema.js";
import { UuidSchema } from "../classes/contracts.js";
import { AuthUserSchema } from "../auth/contracts.js";

export const CreateInviteRequestSchema = StrictObject({
  expiresAt: Type.String({ format: "date-time" }),
  maxUses: Type.Integer({ minimum: 1, maximum: 1_000 }),
});

export const InviteCreatedSchema = StrictObject({
  id: UuidSchema,
  code: Type.String({ pattern: "^[A-Za-z0-9_-]{22}$" }),
  expiresAt: Type.String({ format: "date-time" }),
  maxUses: Type.Integer({ minimum: 1, maximum: 1_000 }),
});

export const JoinInviteRequestSchema = StrictObject({
  code: Type.String({ pattern: "^[A-Za-z0-9_-]{22}$" }),
});

// Guest students use a device-bound, server-issued student session.  The
// invite remains the only class credential; no teacher/account credential is
// accepted on this route.
export const JoinInviteAnonymousRequestSchema = StrictObject({
  code: Type.String({ pattern: "^[A-Za-z0-9_-]{22}$" }),
  displayName: Type.String({ minLength: 1, maxLength: 80 }),
  deviceId: Type.String({ pattern: "^[0-9A-Fa-f]{64}$" }),
});

export const JoinInviteResponseSchema = StrictObject({
  membershipId: UuidSchema,
  status: Type.Union([Type.Literal("pending"), Type.Literal("active")]),
});

export const JoinInviteAnonymousResponseSchema = StrictObject({
  accessToken: Type.String({ minLength: 80, maxLength: 4_096 }),
  refreshToken: Type.String({
    pattern: "^r1\\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.[A-Za-z0-9_-]{43}$",
  }),
  user: AuthUserSchema,
  membershipId: UuidSchema,
  classId: UuidSchema,
  status: Type.Union([Type.Literal("pending"), Type.Literal("active")]),
});

export const InviteIdParamsSchema = StrictObject({ inviteId: UuidSchema });

export const InviteListItemSchema = StrictObject({
  id: UuidSchema,
  classId: UuidSchema,
  expiresAt: Type.String({ format: "date-time" }),
  maxUses: Type.Integer({ minimum: 1, maximum: 1_000 }),
  usedCount: Type.Integer({ minimum: 0, maximum: 1_000 }),
  status: Type.Union([
    Type.Literal("active"),
    Type.Literal("revoked"),
    Type.Literal("exhausted"),
    Type.Literal("expired"),
  ]),
  createdAt: Type.String({ format: "date-time" }),
});

export const InviteListResponseSchema = StrictObject({
  items: Type.Array(InviteListItemSchema, { maxItems: 100 }),
  nextCursor: Type.Union([UuidSchema, Type.Null()]),
});

export const RevokeInviteResponseSchema = StrictObject({
  id: UuidSchema,
  status: Type.Literal("revoked"),
});

export type CreateInviteRequest = Static<typeof CreateInviteRequestSchema>;
export type InviteCreated = Static<typeof InviteCreatedSchema>;
export type JoinInviteRequest = Static<typeof JoinInviteRequestSchema>;
export type JoinInviteResponse = Static<typeof JoinInviteResponseSchema>;
export type JoinInviteAnonymousRequest = Static<typeof JoinInviteAnonymousRequestSchema>;
export type JoinInviteAnonymousResponse = Static<typeof JoinInviteAnonymousResponseSchema>;
export type InviteIdParams = Static<typeof InviteIdParamsSchema>;
export type InviteListItem = Static<typeof InviteListItemSchema>;
export type InviteListResponse = Static<typeof InviteListResponseSchema>;
export type RevokeInviteResponse = Static<typeof RevokeInviteResponseSchema>;
