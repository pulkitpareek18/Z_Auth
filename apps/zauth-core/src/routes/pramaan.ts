import { Router, type Response } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { requireSession } from "../middleware/requireSession.js";
import { writeAuditEvent } from "../services/auditService.js";
import { createProofChallenge, getIdentity, registerIdentity, verifyProof } from "../services/pramaanService.js";
import {
  completeEnrollment,
  createProofChallenge as createProofChallengeV2,
  findIdentityForSubject,
  getProofReceipt,
  startEnrollment,
  submitProof,
  verifyBiometricCommitment
} from "../services/pramaanV2Service.js";

export const pramaanRouter = Router();

function ensureV2Enabled(res: Response): boolean {
  if (!config.pramaanV2Enabled) {
    res.status(404).json({ error: "pramaan_v2_disabled" });
    return false;
  }
  return true;
}

pramaanRouter.post("/pramaan/v1/identities/register", requireSession, async (req, res) => {
  const schema = z.object({
    tenant_id: z.string().default("default"),
    canonical_input_proof: z.string().min(8),
    device_nonce: z.string().min(6),
    passkey_credential_id: z.string().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.issues });
    return;
  }

  const session = res.locals.session as { subjectId: string; username: string };

  const identity = await registerIdentity({
    tenantId: parsed.data.tenant_id,
    subjectId: session.subjectId,
    canonicalInputProof: parsed.data.canonical_input_proof,
    deviceNonce: parsed.data.device_nonce
  });

  await writeAuditEvent({
    tenantId: parsed.data.tenant_id,
    actor: session.username,
    action: "pramaan.identity.register",
    outcome: "success",
    traceId: req.traceId,
    payload: {
      uid: identity.uid,
      did: identity.did,
      passkey_credential_id: parsed.data.passkey_credential_id ?? null
    }
  });

  res.status(201).json({
    uid: identity.uid,
    did: identity.did,
    commitment_root: identity.commitmentRoot,
    attestation_jwt: identity.attestationJwt
  });
});

pramaanRouter.post("/pramaan/v1/proof/challenge", async (req, res) => {
  const schema = z.object({
    uid: z.string().min(3)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const identity = await getIdentity(parsed.data.uid);
  if (!identity) {
    res.status(404).json({ error: "uid_not_found" });
    return;
  }

  const challenge = await createProofChallenge(parsed.data.uid);
  res.status(200).json(challenge);
});

pramaanRouter.post("/pramaan/v1/proof/verify", async (req, res) => {
  const schema = z.object({
    challenge_id: z.string().min(6),
    uid: z.string().min(3),
    proof: z.string().min(32)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const result = await verifyProof({
    challengeId: parsed.data.challenge_id,
    uid: parsed.data.uid,
    proof: parsed.data.proof
  });

  res.status(result.verified ? 200 : 400).json(result);
});

pramaanRouter.get("/pramaan/v1/identities/:uid", async (req, res) => {
  const identity = await getIdentity(req.params.uid);
  if (!identity) {
    res.status(404).json({ error: "uid_not_found" });
    return;
  }

  res.status(200).json({
    uid: identity.uid,
    did: identity.did,
    commitment_root: identity.commitment_root,
    tenant_id: identity.tenant_id,
    created_at: identity.created_at
  });
});

pramaanRouter.post("/pramaan/v2/enrollment/start", requireSession, async (req, res) => {
  if (!ensureV2Enabled(res)) {
    return;
  }

  const schema = z.object({
    tenant_id: z.string().default("default"),
    login_hint: z.string().optional(),
    request_id: z.string().optional()
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.issues });
    return;
  }

  const session = res.locals.session as { subjectId: string; username: string };
  const draft = await startEnrollment({
    tenantId: parsed.data.tenant_id,
    subjectId: session.subjectId,
    loginHint: parsed.data.login_hint ?? session.username,
    requestId: parsed.data.request_id
  });

  await writeAuditEvent({
    tenantId: parsed.data.tenant_id,
    actor: session.username,
    action: "pramaan.v2.enrollment.start",
    outcome: "success",
    traceId: req.traceId,
    payload: {
      enrollment_id: draft.enrollmentId,
      uid_draft: draft.uidDraft,
      did_draft: draft.didDraft
    }
  });

  res.status(201).json({
    enrollment_id: draft.enrollmentId,
    uid_draft: draft.uidDraft,
    did_draft: draft.didDraft,
    zk_challenge: draft.zkChallenge,
    circuit_id: draft.circuitId,
    zk_mode: config.zkVerifierMode,
    expires_at: new Date(draft.expiresAt).toISOString()
  });
});

pramaanRouter.post("/pramaan/v2/enrollment/complete", requireSession, async (req, res) => {
  if (!ensureV2Enabled(res)) {
    return;
  }

  const schema = z.object({
    enrollment_id: z.string().min(6),
    passkey_credential_id: z.string().min(4),
    liveness_session_id: z.string().min(6),
    zk_proof: z.unknown(),
    public_signals: z.unknown(),
    hash1: z.string().min(16),
    hash2: z.string().min(16),
    commitment_root: z.string().min(16),
    biometric_hash: z.string().min(32).max(128).optional(),
    skip_recovery_code_regen: z.boolean().optional()
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.issues });
    return;
  }

  const session = res.locals.session as { subjectId: string; username: string };

  try {
    const enrollment = await completeEnrollment({
      enrollmentId: parsed.data.enrollment_id,
      subjectId: session.subjectId,
      passkeyCredentialId: parsed.data.passkey_credential_id,
      livenessSessionId: parsed.data.liveness_session_id,
      zkProof: parsed.data.zk_proof,
      publicSignals: parsed.data.public_signals,
      hash1: parsed.data.hash1,
      hash2: parsed.data.hash2,
      commitmentRoot: parsed.data.commitment_root,
      biometricHash: parsed.data.biometric_hash,
      skipRecoveryCodeRegen: parsed.data.skip_recovery_code_regen
    });

    await writeAuditEvent({
      tenantId: "default",
      actor: session.username,
      action: "pramaan.v2.enrollment.complete",
      outcome: "success",
      traceId: req.traceId,
      payload: {
        uid: enrollment.uid,
        did: enrollment.did,
        liveness_session_id: parsed.data.liveness_session_id
      }
    });

    res.status(201).json({
      uid: enrollment.uid,
      did: enrollment.did,
      assurance_level: enrollment.assuranceLevel,
      recovery_codes: enrollment.recoveryCodes,
      attestation_jwt: enrollment.attestationJwt
    });
  } catch (error) {
    await writeAuditEvent({
      tenantId: "default",
      actor: session.username,
      action: "pramaan.v2.enrollment.complete",
      outcome: "failure",
      traceId: req.traceId,
      payload: { reason: (error as Error).message }
    });

    res.status(400).json({
      error: "enrollment_failed",
      reason: (error as Error).message
    });
  }
});

pramaanRouter.post("/pramaan/v2/proof/challenge", async (req, res) => {
  if (!ensureV2Enabled(res)) {
    return;
  }

  const schema = z.object({
    uid: z.string().min(3),
    purpose: z.string().default("authentication")
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.issues });
    return;
  }

  try {
    const challenge = await createProofChallengeV2({
      uid: parsed.data.uid,
      purpose: parsed.data.purpose
    });

    res.status(200).json({
      proof_request_id: challenge.proofRequestId,
      challenge: challenge.challenge,
      challenge_hash: challenge.challengeHash,
      challenge_field: challenge.challengeField,
      circuit_id: challenge.circuitId,
      zk_mode: config.zkVerifierMode,
      expires_at: challenge.expiresAt
    });
  } catch (error) {
    res.status(404).json({
      error: "uid_not_found",
      reason: (error as Error).message
    });
  }
});

pramaanRouter.post("/pramaan/v2/proof/submit", async (req, res) => {
  if (!ensureV2Enabled(res)) {
    return;
  }

  const schema = z.object({
    proof_request_id: z.string().min(6),
    uid: z.string().min(3),
    zk_proof: z.unknown(),
    public_signals: z.unknown(),
    handoff_id: z.string().optional(),
    biometric_hash: z.string().min(32).max(128).optional()
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.issues });
    return;
  }

  try {
    const result = await submitProof({
      proofRequestId: parsed.data.proof_request_id,
      uid: parsed.data.uid,
      zkProof: parsed.data.zk_proof,
      publicSignals: parsed.data.public_signals,
      handoffId: parsed.data.handoff_id,
      biometricHash: parsed.data.biometric_hash
    });

    await writeAuditEvent({
      tenantId: "default",
      actor: parsed.data.uid,
      action: "pramaan.v2.proof.submit",
      outcome: result.verified ? "success" : "failure",
      traceId: req.traceId,
      payload: {
        proof_request_id: parsed.data.proof_request_id,
        verification_id: result.verificationId,
        reason: result.reason ?? null
      }
    });

    res.status(result.verified ? 200 : 400).json({
      verified: result.verified,
      verification_id: result.verificationId,
      reason: result.reason
    });
  } catch (error) {
    res.status(400).json({
      verified: false,
      error: "proof_submit_failed",
      reason: (error as Error).message
    });
  }
});

pramaanRouter.get("/pramaan/v2/proof/status", async (req, res) => {
  if (!ensureV2Enabled(res)) {
    return;
  }

  const verificationId = String(req.query.verification_id ?? "");
  if (!verificationId) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const receipt = await getProofReceipt(verificationId);
  if (!receipt) {
    res.status(404).json({ status: "missing", verified: false });
    return;
  }

  res.status(200).json({
    status: receipt.verified ? "verified" : "failed",
    verified: receipt.verified,
    reason: receipt.reason ?? undefined,
    created_at: receipt.created_at
  });
});

pramaanRouter.get("/pramaan/v2/identity/me", requireSession, async (_req, res) => {
  if (!ensureV2Enabled(res)) {
    return;
  }

  const session = res.locals.session as { subjectId: string };
  const identity = await findIdentityForSubject(session.subjectId);
  if (!identity) {
    res.status(404).json({ error: "identity_not_found" });
    return;
  }
  res.status(200).json(identity);
});

// Privacy-by-design: biometric verification uses hash commitment, not raw embeddings.
// Face matching (Euclidean distance) happens CLIENT-SIDE. Server only verifies the hash.
pramaanRouter.post("/pramaan/v2/biometric/verify", requireSession, async (req, res) => {
  if (!ensureV2Enabled(res)) {
    return;
  }

  const schema = z.object({
    uid: z.string().min(3),
    biometric_hash: z.string().min(32).max(128)
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.issues });
    return;
  }

  const session = res.locals.session as { subjectId: string; username: string };

  try {
    const result = await verifyBiometricCommitment({
      uid: parsed.data.uid,
      candidateHash: parsed.data.biometric_hash
    });

    await writeAuditEvent({
      tenantId: "default",
      actor: session.username,
      action: "pramaan.v2.biometric.verify",
      outcome: result.matched ? "success" : "failure",
      traceId: req.traceId,
      payload: {
        uid: parsed.data.uid,
        reason: result.reason ?? null
      }
    });

    res.status(result.matched ? 200 : 403).json({
      matched: result.matched,
      reason: result.reason
    });
  } catch (error) {
    res.status(400).json({
      matched: false,
      error: "biometric_verify_failed",
      reason: (error as Error).message
    });
  }
});
