import { Router, type Request } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { writeAuditEvent } from "../services/auditService.js";
import { getAuthRequest } from "../services/authRequestService.js";
import {
  approveHandoffByCode,
  consumeApprovedHandoff,
  denyHandoffByCode,
  getHandoffByCode,
  getHandoffById,
  startHandoff
} from "../services/handoffService.js";
import {
  getLivenessChallenge,
  startLivenessChallenge,
  verifyLivenessChallenge
} from "../services/livenessService.js";
import {
  beginPasskeyAuthentication,
  beginPasskeyRegistration,
  finishPasskeyAuthentication,
  finishPasskeyRegistration
} from "../services/passkeyService.js";
import { getProofReceipt } from "../services/pramaanV2Service.js";
import { clearSessionCookie, createSession, deleteSession, getSession, setSessionCookie } from "../services/sessionService.js";

export const passkeyRouter = Router();

const usernameSchema = z.string().min(3).max(128);

function buildVerifyBaseUrl(req: Request): string {
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.header("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.header("host");
  const protocol = forwardedProto || req.protocol || "http";
  if (!host) {
    return config.verifyBaseUrl;
  }
  const normalizedHost = host.toLowerCase();
  const isLoopbackHost =
    normalizedHost.startsWith("localhost") ||
    normalizedHost.startsWith("127.0.0.1") ||
    normalizedHost.startsWith("[::1]");
  if (isLoopbackHost) {
    return config.verifyBaseUrl;
  }
  return `${protocol}://${host}`;
}

passkeyRouter.post("/auth/webauthn/register/options", async (req, res) => {
  const bodySchema = z.object({
    username: usernameSchema,
    displayName: z.string().min(1).max(128).optional()
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.issues });
    return;
  }

  const options = await beginPasskeyRegistration(parsed.data.username, parsed.data.displayName);
  res.status(200).json(options);
});

passkeyRouter.post("/auth/webauthn/register/verify", async (req, res) => {
  const bodySchema = z.object({
    username: usernameSchema,
    response: z.unknown(),
    requestId: z.string().optional()
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const result = await finishPasskeyRegistration(parsed.data.username, parsed.data.response);
  if (!result.verified) {
    await writeAuditEvent({
      tenantId: "default",
      actor: parsed.data.username,
      action: "passkey.register",
      outcome: "failure",
      traceId: req.traceId,
      payload: { requestId: parsed.data.requestId }
    });
    res.status(400).json({ verified: false });
    return;
  }

  await writeAuditEvent({
    tenantId: "default",
    actor: parsed.data.username,
    action: "passkey.register",
    outcome: "success",
    traceId: req.traceId,
    payload: { requestId: parsed.data.requestId }
  });

  res.status(200).json({ verified: true });
});

passkeyRouter.post("/auth/webauthn/login/options", async (req, res) => {
  const bodySchema = z.object({
    username: usernameSchema
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const options = await beginPasskeyAuthentication(parsed.data.username);
  if (!options) {
    res.status(404).json({ error: "credential_not_found" });
    return;
  }

  res.status(200).json(options);
});

passkeyRouter.post("/auth/webauthn/login/verify", async (req, res) => {
  const bodySchema = z.object({
    username: usernameSchema,
    response: z.unknown(),
    requestId: z.string().optional()
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const result = await finishPasskeyAuthentication(parsed.data.username, parsed.data.response);
  if (!result.verified || !result.subjectId || !result.username) {
    await writeAuditEvent({
      tenantId: "default",
      actor: parsed.data.username,
      action: "passkey.login",
      outcome: "failure",
      traceId: req.traceId,
      payload: { requestId: parsed.data.requestId }
    });
    res.status(401).json({ verified: false });
    return;
  }

  const session = await createSession(result.subjectId, result.username);
  setSessionCookie(res, session.sessionId);

  await writeAuditEvent({
    tenantId: "default",
    actor: result.username,
    action: "passkey.login",
    outcome: "success",
    traceId: req.traceId,
    payload: { requestId: parsed.data.requestId }
  });

  res.status(200).json({
    verified: true,
    redirectTo: parsed.data.requestId ? `/ui/consent?request_id=${encodeURIComponent(parsed.data.requestId)}` : "/"
  });
});

passkeyRouter.post("/auth/handoff/start", async (req, res) => {
  const schema = z.object({
    requestId: z.string().optional(),
    loginHint: z.string().optional(),
    mode: z.enum(["signin", "signup"]).optional()
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const requestId = parsed.data.requestId?.trim() || undefined;
  if (requestId) {
    const request = await getAuthRequest(requestId);
    if (!request) {
      await writeAuditEvent({
        tenantId: "default",
        actor: parsed.data.loginHint?.trim().toLowerCase() || "anonymous",
        action: "auth.request.expired_preflight",
        outcome: "failure",
        traceId: req.traceId,
        payload: {
          request_id: requestId
        }
      });
      res.status(410).json({
        error: "request_expired",
        message: "Sign-in request expired. Restart sign-in from the app."
      });
      return;
    }
  }

  const handoff = await startHandoff(requestId, parsed.data.loginHint, parsed.data.mode);
  const verifyBaseUrl = buildVerifyBaseUrl(req);
  const verifyUrl = `${verifyBaseUrl}/ui/mobile-approve?handoff=${encodeURIComponent(handoff.handoffId)}&code=${encodeURIComponent(handoff.code)}`;

  await writeAuditEvent({
    tenantId: "default",
    actor: parsed.data.loginHint ?? "anonymous",
    action: "auth.handoff.start",
    outcome: "success",
    traceId: req.traceId,
    payload: {
      handoff_id: handoff.handoffId,
      request_id: requestId ?? null,
      mode: handoff.mode ?? "signin"
    }
  });

  res.status(201).json({
    handoff_id: handoff.handoffId,
    code: handoff.code,
    qr_payload: verifyUrl,
    verify_url: verifyUrl,
    expires_at: new Date(handoff.expiresAt).toISOString(),
    expires_in_ms: Math.max(0, handoff.expiresAt - Date.now()),
    poll_interval_ms: 2000,
    zk_required: config.authRequireZkForLogin,
    approve_path: `/ui/mobile-approve?handoff=${encodeURIComponent(handoff.handoffId)}&code=${encodeURIComponent(handoff.code)}`,
    login_hint: handoff.loginHint ?? null,
    account_locked: Boolean(handoff.loginHint),
    request_valid: true as const,
    mode: handoff.mode ?? "signin"
  });
});

passkeyRouter.get("/auth/handoff/context", async (req, res) => {
  const handoffId = String(req.query.handoff_id ?? "");
  const code = String(req.query.code ?? "").trim().toUpperCase();
  if (!handoffId || !code) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const record = await getHandoffByCode(code);
  if (!record || record.handoffId !== handoffId) {
    res.status(404).json({ error: "handoff_not_found" });
    return;
  }

  if (record.expiresAt < Date.now()) {
    res.status(410).json({
      handoff_id: record.handoffId,
      status: "expired",
      login_hint: record.loginHint ?? null,
      account_locked: Boolean(record.loginHint),
      mode: record.mode ?? "signin",
      expires_at: new Date(record.expiresAt).toISOString()
    });
    return;
  }

  res.status(200).json({
    handoff_id: record.handoffId,
    status: record.status,
    login_hint: record.loginHint ?? null,
    account_locked: Boolean(record.loginHint),
    mode: record.mode ?? "signin",
    expires_at: new Date(record.expiresAt).toISOString()
  });
});

passkeyRouter.post("/auth/liveness/challenge", async (req, res) => {
  const schema = z.object({
    handoff_id: z.string().min(6)
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const handoff = await getHandoffById(parsed.data.handoff_id);
  if (!handoff || handoff.status !== "pending" || handoff.expiresAt < Date.now()) {
    res.status(404).json({ error: "handoff_not_available" });
    return;
  }

  const challenge = await startLivenessChallenge(parsed.data.handoff_id);
  res.status(201).json({
    liveness_session_id: challenge.livenessSessionId,
    sequence: challenge.sequence,
    expires_at: new Date(challenge.expiresAt).toISOString(),
    mode: config.livenessMode
  });
});

passkeyRouter.post("/auth/liveness/verify", async (req, res) => {
  const schema = z.object({
    handoff_id: z.string().min(6),
    liveness_session_id: z.string().min(6),
    events: z.array(z.record(z.unknown())).default([]),
    confidence: z.coerce.number().min(0).max(1),
    duration_ms: z.coerce.number().min(0)
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.issues });
    return;
  }

  const result = await verifyLivenessChallenge({
    handoffId: parsed.data.handoff_id,
    sessionId: parsed.data.liveness_session_id,
    events: parsed.data.events,
    confidence: parsed.data.confidence,
    durationMs: parsed.data.duration_ms
  });

  await writeAuditEvent({
    tenantId: "default",
    actor: "mobile-device",
    action: "auth.liveness.verify",
    outcome: result.verified ? "success" : "failure",
    traceId: req.traceId,
    payload: {
      handoff_id: parsed.data.handoff_id,
      liveness_session_id: parsed.data.liveness_session_id,
      mode: result.mode,
      score: result.score,
      reason: result.reason ?? null
    }
  });

  res.status(result.verified ? 200 : 400).json(result);
});

passkeyRouter.post("/auth/mobile/step", async (req, res) => {
  const schema = z.object({
    handoff_id: z.string().min(6),
    step: z.enum(["account", "switch_account", "signup", "face", "approve", "done"]),
    status: z.enum(["viewed", "completed", "error"]).default("viewed"),
    detail: z.string().max(256).optional()
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.issues });
    return;
  }

  const record = await getHandoffById(parsed.data.handoff_id);
  if (!record) {
    res.status(404).json({ error: "handoff_not_found" });
    return;
  }

  const sid = req.cookies.zauth_sid as string | undefined;
  const session = await getSession(sid);
  await writeAuditEvent({
    tenantId: "default",
    actor: session?.username ?? record.loginHint ?? "mobile-device",
    action: "auth.mobile.step_transition",
    outcome: parsed.data.status === "error" ? "failure" : "success",
    traceId: req.traceId,
    payload: {
      handoff_id: parsed.data.handoff_id,
      step: parsed.data.step,
      status: parsed.data.status,
      detail: parsed.data.detail ?? null
    }
  });

  res.status(204).end();
});

passkeyRouter.post("/auth/handoff/approve", async (req, res) => {
  const sid = req.cookies.zauth_sid as string | undefined;
  const session = await getSession(sid);
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const schema = z.object({
    code: z.string().min(4).max(32),
    liveness_session_id: z.string().min(6),
    proof_verification_id: z.string().min(6).optional(),
    liveness_result: z.object({
      verified: z.boolean(),
      score: z.number().optional(),
      reason: z.string().optional()
    }),
    passkey_assertion: z.string().min(4)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.issues });
    return;
  }

  const liveness = await getLivenessChallenge(parsed.data.liveness_session_id);
  if (!liveness || liveness.status !== "verified") {
    res.status(400).json({ error: "liveness_not_verified" });
    return;
  }

  if (!parsed.data.liveness_result.verified) {
    res.status(400).json({ error: "liveness_failed" });
    return;
  }

  const normalizedCode = parsed.data.code.trim().toUpperCase();
  const pendingHandoff = await getHandoffByCode(normalizedCode);
  if (!pendingHandoff) {
    res.status(404).json({ error: "handoff_not_found_or_expired" });
    return;
  }

  if (config.authRequireZkForLogin && !parsed.data.proof_verification_id) {
    res.status(400).json({ error: "zk_proof_required" });
    return;
  }

  let assurance = session.assurance ?? {
    acr: "urn:zauth:aal1",
    amr: ["passkey"]
  };
  assurance = {
    ...assurance,
    amr: Array.from(new Set([...(assurance.amr ?? ["passkey"]), "face"]))
  };

  if (parsed.data.proof_verification_id) {
    const receipt = await getProofReceipt(parsed.data.proof_verification_id);
    if (!receipt || !receipt.verified) {
      res.status(400).json({ error: "invalid_proof_verification_id" });
      return;
    }
    if (receipt.subject_id && receipt.subject_id !== session.subjectId) {
      res.status(400).json({ error: "proof_subject_mismatch" });
      return;
    }
    if (receipt.handoff_id && receipt.handoff_id !== pendingHandoff.handoffId) {
      res.status(400).json({ error: "proof_handoff_mismatch" });
      return;
    }
    assurance = {
      acr: "urn:zauth:aal2:zk",
      amr: ["passkey", "face", "zkp"],
      uid: receipt.uid,
      did: receipt.did ?? undefined,
      proofVerificationId: receipt.verification_id,
      zkpVerifiedAt: Date.now()
    };
  }

  const record = await approveHandoffByCode(
    normalizedCode,
    session.subjectId,
    session.username,
    assurance
  );

  if (!record) {
    res.status(404).json({ error: "handoff_not_found_or_expired" });
    return;
  }

  await writeAuditEvent({
    tenantId: "default",
    actor: session.username,
    action: "auth.handoff.approve",
    outcome: "success",
    traceId: req.traceId,
    payload: {
      handoff_id: record.handoffId,
      liveness_session_id: parsed.data.liveness_session_id,
      passkey_assertion: parsed.data.passkey_assertion,
      proof_verification_id: parsed.data.proof_verification_id ?? null,
      score: parsed.data.liveness_result.score ?? null
    }
  });

  if (sid) {
    await deleteSession(sid);
    clearSessionCookie(res);
  }

  res.status(200).json({
    approved: true,
    handoff_id: record.handoffId
  });
});

passkeyRouter.post("/auth/handoff/deny", async (req, res) => {
  const schema = z.object({
    code: z.string().min(4).max(32)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const record = await denyHandoffByCode(parsed.data.code.trim().toUpperCase());
  if (!record) {
    res.status(404).json({ error: "handoff_not_found_or_expired" });
    return;
  }

  res.status(200).json({ denied: true, handoff_id: record.handoffId });
});

passkeyRouter.get("/auth/handoff/status", async (req, res) => {
  const handoffId = String(req.query.handoff_id ?? "");
  if (!handoffId) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const record = await getHandoffById(handoffId);
  if (!record) {
    res.status(404).json({ status: "expired_or_missing" });
    return;
  }

  if (record.expiresAt < Date.now()) {
    res.status(410).json({ status: "expired" });
    return;
  }

  if (record.status === "pending") {
    res.status(200).json({ status: "pending" });
    return;
  }

  if (record.status === "denied") {
    res.status(200).json({ status: "denied" });
    return;
  }

  if (record.status === "consumed") {
    res.status(200).json({ status: "consumed" });
    return;
  }

  const consumed = await consumeApprovedHandoff(handoffId);
  if (!consumed || !consumed.approvedBySubjectId || !consumed.approvedByUsername) {
    res.status(400).json({ status: "invalid_state" });
    return;
  }

  const session = await createSession(consumed.approvedBySubjectId, consumed.approvedByUsername, consumed.assurance);
  setSessionCookie(res, session.sessionId);

  await writeAuditEvent({
    tenantId: "default",
    actor: consumed.approvedByUsername,
    action: "auth.handoff.consume",
    outcome: "success",
    traceId: req.traceId,
    payload: {
      handoff_id: consumed.handoffId,
      acr: consumed.assurance?.acr ?? "urn:zauth:aal1",
      amr: consumed.assurance?.amr ?? ["passkey"]
    }
  });

  res.status(200).json({
    status: "approved",
    redirectTo: consumed.requestId ? `/ui/consent?request_id=${encodeURIComponent(consumed.requestId)}` : "/"
  });
});
