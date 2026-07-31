import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";

import type { PoolClient } from "pg";

import type { JsonValue } from "../../common/idempotency.js";
import type { ActorRole } from "../authorization/policy.js";

export type AuditResult = "allowed" | "denied" | "succeeded" | "failed";

export interface AuditEvent {
  actorId: string | null;
  actorRole: ActorRole | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  classId: string | null;
  result: AuditResult;
  beforeState: JsonValue | null;
  afterState: JsonValue | null;
  reason: string | null;
  requestId: string;
  ipHash: Buffer | null;
}

function normalizeIp(rawIp: string): string {
  let value = rawIp.trim().toLowerCase();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  const zoneIndex = value.indexOf("%");
  if (zoneIndex >= 0) value = value.slice(0, zoneIndex);
  if (value.startsWith("::ffff:") && isIP(value.slice(7)) === 4) value = value.slice(7);
  const version = isIP(value);
  if (version === 0) throw new TypeError("rawIp must be a valid IPv4 or IPv6 address");
  if (version === 6) {
    const hostname = new URL(`http://[${value}]/`).hostname;
    value = hostname.slice(1, -1);
  }
  return value;
}

export function hashAuditIp(auditIpKey: string | Buffer, rawIp: string): Buffer {
  return createHmac("sha256", auditIpKey).update(normalizeIp(rawIp), "utf8").digest();
}

export async function appendAudit(tx: PoolClient, event: AuditEvent): Promise<void> {
  await tx.query(
    `insert into audit_events(
       id, actor_id, actor_role, action, resource_type, resource_id, class_id,
       result, before_state, after_state, reason, request_id, ip_hash
     ) values (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9::jsonb, $10::jsonb, $11, $12, $13
     )`,
    [
      randomUUID(),
      event.actorId,
      event.actorRole,
      event.action,
      event.resourceType,
      event.resourceId,
      event.classId,
      event.result,
      event.beforeState === null ? null : JSON.stringify(event.beforeState),
      event.afterState === null ? null : JSON.stringify(event.afterState),
      event.reason,
      event.requestId,
      event.ipHash,
    ],
  );
}
