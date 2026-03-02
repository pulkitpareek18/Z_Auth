import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { listAuditEvents, writeAuditEvent } from "../services/auditService.js";
import { createClient } from "../services/oauthService.js";

export const adminRouter = Router();

adminRouter.post("/admin/v1/clients", async (req, res) => {
  const schema = z.object({
    client_id: z.string().min(3).max(128),
    client_secret: z.string().optional(),
    redirect_uris: z.array(z.string().url()).min(1),
    scopes: z.array(z.string()).default(["openid", "profile"]),
    grant_types: z.array(z.string()).default(["authorization_code"])
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.issues });
    return;
  }

  try {
    const created = await createClient({
      clientId: parsed.data.client_id,
      clientSecret: parsed.data.client_secret ?? null,
      redirectUris: parsed.data.redirect_uris,
      scopes: parsed.data.scopes,
      grantTypes: parsed.data.grant_types
    });

    await writeAuditEvent({
      tenantId: "default",
      actor: "admin",
      action: "admin.create_client",
      outcome: "success",
      traceId: req.traceId,
      payload: { client_id: created.client_id }
    });

    res.status(201).json(created);
  } catch (error) {
    res.status(409).json({ error: "client_conflict", message: (error as Error).message });
  }
});

adminRouter.post("/admin/v1/policies", async (req, res) => {
  const schema = z.object({
    tenant_id: z.string().default("default"),
    name: z.string().min(2),
    config: z.record(z.unknown())
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.issues });
    return;
  }

  const result = await pool.query(
    `INSERT INTO policies (tenant_id, name, config)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id, tenant_id, name, config, created_at`,
    [parsed.data.tenant_id, parsed.data.name, JSON.stringify(parsed.data.config)]
  );

  await writeAuditEvent({
    tenantId: parsed.data.tenant_id,
    actor: "admin",
    action: "admin.create_policy",
    outcome: "success",
    traceId: req.traceId,
    payload: { name: parsed.data.name }
  });

  res.status(201).json(result.rows[0]);
});

adminRouter.get("/admin/v1/audit-events", async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  const events = await listAuditEvents(Math.min(Math.max(limit, 1), 500));
  res.status(200).json({ events });
});
