import { v4 as uuidv4 } from "uuid";
import { pool } from "../db/pool.js";
import { computeAuditHash } from "../utils/crypto.js";

type AuditInput = {
  tenantId: string;
  actor: string;
  action: string;
  outcome: "success" | "failure";
  traceId: string;
  payload: Record<string, unknown>;
};

export async function writeAuditEvent(input: AuditInput): Promise<void> {
  const previous = await pool.query<{ hash: string }>(
    `SELECT hash FROM audit_events ORDER BY id DESC LIMIT 1`
  );
  const prevHash = previous.rows[0]?.hash ?? null;
  const payloadJson = JSON.stringify(input.payload);
  const hash = computeAuditHash(prevHash, payloadJson);

  await pool.query(
    `INSERT INTO audit_events
      (event_id, tenant_id, actor, action, outcome, trace_id, payload, prev_hash, hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
    [uuidv4(), input.tenantId, input.actor, input.action, input.outcome, input.traceId, payloadJson, prevHash, hash]
  );
}

export async function listAuditEvents(limit = 100): Promise<unknown[]> {
  const result = await pool.query(
    `SELECT event_id, tenant_id, actor, action, outcome, trace_id, payload, prev_hash, hash, created_at
     FROM audit_events
     ORDER BY id DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}
