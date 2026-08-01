import { Type, type Static } from "@sinclair/typebox";

import { StrictObject } from "../../common/schema.js";

export const UuidSchema = Type.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const GradeSchema = Type.Union([
  Type.Literal("八年级"),
  Type.Literal("九年级"),
  Type.Literal("高一"),
  Type.Literal("高二"),
  Type.Literal("高三"),
]);

export const CreateClassRequestSchema = StrictObject({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  grade: GradeSchema,
  subject: Type.Literal("物理"),
  schoolLabel: Type.Optional(Type.Union([
    Type.String({ minLength: 1, maxLength: 120 }),
    Type.Null(),
  ])),
});

export const ClassViewSchema = StrictObject({
  id: UuidSchema,
  name: Type.String({ minLength: 1, maxLength: 120 }),
  grade: GradeSchema,
  subject: Type.Literal("物理"),
  schoolLabel: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
  status: Type.Union([Type.Literal("active"), Type.Literal("archived")]),
  revision: Type.Integer({ minimum: 1 }),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
});

export const ClassListQuerySchema = StrictObject({
  cursor: Type.Optional(UuidSchema),
});

export const ClassListResponseSchema = StrictObject({
  items: Type.Array(ClassViewSchema, { maxItems: 100 }),
  nextCursor: Type.Union([UuidSchema, Type.Null()]),
});

export const ClassIdParamsSchema = StrictObject({ classId: UuidSchema });

export const CreateGroupRequestSchema = StrictObject({
  name: Type.String({ minLength: 1, maxLength: 80 }),
});

export const GroupViewSchema = StrictObject({
  id: UuidSchema,
  classId: UuidSchema,
  name: Type.String({ minLength: 1, maxLength: 80 }),
  revision: Type.Integer({ minimum: 1 }),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
});

export const GroupListResponseSchema = StrictObject({
  items: Type.Array(GroupViewSchema, { maxItems: 200 }),
  nextCursor: Type.Union([UuidSchema, Type.Null()]),
});

export const MembershipViewSchema = StrictObject({
  id: UuidSchema,
  classId: UuidSchema,
  groupId: Type.Union([UuidSchema, Type.Null()]),
  userId: UuidSchema,
  displayName: Type.String({ minLength: 1, maxLength: 80 }),
  memberRole: Type.Union([Type.Literal("student"), Type.Literal("teacher")]),
  studentNumber: Type.Union([
    Type.String({ minLength: 1, maxLength: 40 }),
    Type.Null(),
  ]),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("active"),
    Type.Literal("removed"),
  ]),
  revision: Type.Integer({ minimum: 1 }),
  joinedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  updatedAt: Type.String({ format: "date-time" }),
});

export const RosterResponseSchema = StrictObject({
  items: Type.Array(MembershipViewSchema, { maxItems: 200 }),
  nextCursor: Type.Union([UuidSchema, Type.Null()]),
});

export const MembershipIdParamsSchema = StrictObject({ membershipId: UuidSchema });

export const UpdateMembershipRequestSchema = Type.Object({
  status: Type.Optional(Type.Union([Type.Literal("active"), Type.Literal("removed")])),
  groupId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
  studentNumber: Type.Optional(Type.Union([
    Type.String({ minLength: 1, maxLength: 40 }),
    Type.Null(),
  ])),
}, {
  additionalProperties: false,
  minProperties: 1,
});

export type Grade = Static<typeof GradeSchema>;
export type CreateClassRequest = Static<typeof CreateClassRequestSchema>;
export type ClassView = Static<typeof ClassViewSchema>;
export type ClassListQuery = Static<typeof ClassListQuerySchema>;
export type ClassListResponse = Static<typeof ClassListResponseSchema>;
export type ClassIdParams = Static<typeof ClassIdParamsSchema>;
export type CreateGroupRequest = Static<typeof CreateGroupRequestSchema>;
export type GroupView = Static<typeof GroupViewSchema>;
export type GroupListResponse = Static<typeof GroupListResponseSchema>;
export type MembershipView = Static<typeof MembershipViewSchema>;
export type RosterResponse = Static<typeof RosterResponseSchema>;
export type MembershipIdParams = Static<typeof MembershipIdParamsSchema>;
export type UpdateMembershipRequest = Static<typeof UpdateMembershipRequestSchema>;
