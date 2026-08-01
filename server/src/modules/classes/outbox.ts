import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import type { MembershipView } from "./contracts.js";

export interface MembershipOutboxInput {
  membership: MembershipView;
  ownerTeacherId: string;
  operation: "create" | "update" | "delete";
  occurredAt: Date;
  retentionDays: number;
}

export async function appendMembershipOutbox(
  tx: PoolClient,
  input: MembershipOutboxInput,
): Promise<void> {
  const recipients = [...new Set([input.membership.userId, input.ownerTeacherId])];
  const changeId = randomUUID();
  const eventId = randomUUID();
  const purgeAfter = new Date(
    input.occurredAt.getTime() + input.retentionDays * 24 * 60 * 60 * 1_000,
  );
  const payload = JSON.stringify({
    id: input.membership.id,
    classId: input.membership.classId,
    groupId: input.membership.groupId,
    userId: input.membership.userId,
    displayName: input.membership.displayName,
    memberRole: input.membership.memberRole,
    studentNumber: input.membership.studentNumber,
    status: input.membership.status,
    revision: input.membership.revision,
    joinedAt: input.membership.joinedAt,
    updatedAt: input.membership.updatedAt,
  });
  for (const recipientId of recipients) {
    await tx.query(
      `insert into sync_outbox(
         change_id, recipient_user_id, class_id, event_id, entity_type,
         entity_id, operation, revision, payload, occurred_at, purge_after
       ) values ($1, $2, $3, $4, 'membership', $5, $6, $7, $8::jsonb, $9, $10)`,
      [
        changeId,
        recipientId,
        input.membership.classId,
        eventId,
        input.membership.id,
        input.operation,
        input.membership.revision,
        payload,
        input.occurredAt,
        purgeAfter,
      ],
    );
  }
}
