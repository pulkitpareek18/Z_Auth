import { ulid } from "ulid";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import type { AssuranceContext } from "../types/models.js";
import { randomId, sha256 } from "../utils/crypto.js";
import { getCache } from "./cacheService.js";
import { signAttestationJwt } from "./keyService.js";
import { verifyZkProof } from "./zkService.js";

const ENROLLMENT_PREFIX = "pramaan:v2:enrollment:";
const ENROLLMENT_TTL_SECONDS = 10 * 60;

type EnrollmentDraft = {
  enrollmentId: string;
  tenantId: string;
  subjectId: string;
  loginHint?: string;
  requestId?: string;
  uidDraft: string;
  didDraft: string;
  zkChallenge: string;
  circuitId: string;
  createdAt: number;
  expiresAt: number;
};

type ProofRequestRecord = {
  proof_request_id: string;
  uid: string;
  challenge: string;
  purpose: string;
  expires_at: string;
  consumed: boolean;
};

function enrollmentKey(enrollmentId: string): string {
  return ENROLLMENT_PREFIX + enrollmentId;
}

async function saveEnrollment(draft: EnrollmentDraft): Promise<void> {
  const ttl = Math.max(1, Math.floor((draft.expiresAt - Date.now()) / 1000));
  await getCache().set(enrollmentKey(draft.enrollmentId), JSON.stringify(draft), ttl);
}

async function getEnrollment(enrollmentId: string): Promise<EnrollmentDraft | null> {
  const raw = await getCache().get(enrollmentKey(enrollmentId));
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as EnrollmentDraft;
}

async function deleteEnrollment(enrollmentId: string): Promise<void> {
  await getCache().del(enrollmentKey(enrollmentId));
}

function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    codes.push(randomId(9).replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase());
  }
  return codes;
}

export async function findIdentityForSubject(subjectId: string): Promise<{
  uid: string;
  did: string;
  commitment_root: string;
} | null> {
  const result = await pool.query<{ uid: string; did: string; commitment_root: string }>(
    `SELECT uid, did, commitment_root
     FROM pramaan_identity_map
     WHERE subject_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [subjectId]
  );
  return result.rows[0] ?? null;
}

export async function startEnrollment(input: {
  tenantId: string;
  subjectId: string;
  loginHint?: string;
  requestId?: string;
}): Promise<EnrollmentDraft> {
  const existing = await findIdentityForSubject(input.subjectId);
  const uidDraft = existing?.uid ?? ulid();
  const didDraft = existing?.did ?? `did:zauth:${input.tenantId}:${uidDraft}`;
  const enrollmentId = randomId(18);
  const now = Date.now();
  const draft: EnrollmentDraft = {
    enrollmentId,
    tenantId: input.tenantId,
    subjectId: input.subjectId,
    loginHint: input.loginHint,
    requestId: input.requestId,
    uidDraft,
    didDraft,
    zkChallenge: randomId(24),
    circuitId: config.zkCircuitId,
    createdAt: now,
    expiresAt: now + ENROLLMENT_TTL_SECONDS * 1000
  };
  await saveEnrollment(draft);
  return draft;
}

export async function completeEnrollment(input: {
  enrollmentId: string;
  subjectId: string;
  passkeyCredentialId: string;
  livenessSessionId: string;
  zkProof: unknown;
  publicSignals: unknown;
  hash1: string;
  hash2: string;
  commitmentRoot: string;
}): Promise<{
  uid: string;
  did: string;
  assuranceLevel: string;
  recoveryCodes: string[];
  attestationJwt: string;
}> {
  const draft = await getEnrollment(input.enrollmentId);
  if (!draft) {
    throw new Error("enrollment_not_found");
  }
  if (draft.subjectId !== input.subjectId) {
    throw new Error("enrollment_subject_mismatch");
  }
  if (draft.expiresAt < Date.now()) {
    await deleteEnrollment(draft.enrollmentId);
    throw new Error("enrollment_expired");
  }

  const expectedHash2 = sha256(`${input.hash1}:${draft.zkChallenge}`);
  if (expectedHash2 !== input.hash2) {
    throw new Error("hash2_invalid");
  }
  const expectedCommitmentRoot = sha256(
    `${input.hash1}:${input.hash2}:${draft.didDraft}:${draft.uidDraft}:${draft.circuitId}`
  );
  if (expectedCommitmentRoot !== input.commitmentRoot) {
    throw new Error("commitment_root_invalid");
  }

  const expectedChallengeHash = sha256(`${draft.uidDraft}:${draft.zkChallenge}`);
  const verification = await verifyZkProof({
    uid: draft.uidDraft,
    expectedChallengeHash,
    zkProof: input.zkProof,
    publicSignals: input.publicSignals
  });
  if (!verification.verified) {
    throw new Error(verification.reason ?? "zk_verification_failed");
  }

  await pool.query(
    `INSERT INTO pramaan_identity_map (uid, did, hash1, hash2, commitment_root, subject_id, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (uid) DO UPDATE
     SET did = EXCLUDED.did,
         hash1 = EXCLUDED.hash1,
         hash2 = EXCLUDED.hash2,
         commitment_root = EXCLUDED.commitment_root,
         subject_id = EXCLUDED.subject_id,
         tenant_id = EXCLUDED.tenant_id`,
    [draft.uidDraft, draft.didDraft, input.hash1, input.hash2, input.commitmentRoot, draft.subjectId, draft.tenantId]
  );

  await pool.query(
    `INSERT INTO identity_commitments (uid, did, hash1, hash2, commitment_root, circuit_id, subject_id, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (uid) DO UPDATE
     SET did = EXCLUDED.did,
         hash1 = EXCLUDED.hash1,
         hash2 = EXCLUDED.hash2,
         commitment_root = EXCLUDED.commitment_root,
         circuit_id = EXCLUDED.circuit_id,
         subject_id = EXCLUDED.subject_id,
         tenant_id = EXCLUDED.tenant_id`,
    [
      draft.uidDraft,
      draft.didDraft,
      input.hash1,
      input.hash2,
      input.commitmentRoot,
      draft.circuitId,
      draft.subjectId,
      draft.tenantId
    ]
  );

  const recoveryCodes = generateRecoveryCodes();
  await pool.query(`DELETE FROM recovery_codes WHERE subject_id = $1`, [draft.subjectId]);
  for (const code of recoveryCodes) {
    await pool.query(
      `INSERT INTO recovery_codes (subject_id, code_hash)
       VALUES ($1, $2)`,
      [draft.subjectId, sha256(`${draft.subjectId}:${code}:${config.tenantSalt}`)]
    );
  }

  const attestationJwt = await signAttestationJwt(draft.subjectId, {
    uid: draft.uidDraft,
    did: draft.didDraft,
    commitment_root: input.commitmentRoot,
    circuit_id: draft.circuitId,
    hash_alg: "sha256"
  });

  await deleteEnrollment(draft.enrollmentId);

  return {
    uid: draft.uidDraft,
    did: draft.didDraft,
    assuranceLevel: "urn:zauth:aal2:zk",
    recoveryCodes,
    attestationJwt
  };
}

export async function createProofChallenge(input: {
  uid: string;
  purpose: string;
}): Promise<{
  proofRequestId: string;
  challenge: string;
  challengeHash: string;
  circuitId: string;
  expiresAt: string;
}> {
  const identity = await pool.query<{ uid: string }>(
    `SELECT uid FROM pramaan_identity_map WHERE uid = $1`,
    [input.uid]
  );
  if (!identity.rows[0]) {
    throw new Error("uid_not_found");
  }

  const proofRequestId = randomId(18);
  const challenge = randomId(24);
  await pool.query(
    `INSERT INTO zk_proof_requests (proof_request_id, uid, challenge, purpose, expires_at, consumed)
     VALUES ($1, $2, $3, $4, NOW() + interval '5 minutes', FALSE)`,
    [proofRequestId, input.uid, challenge, input.purpose]
  );

  const expires = await pool.query<{ expires_at: string }>(
    `SELECT expires_at::text FROM zk_proof_requests WHERE proof_request_id = $1`,
    [proofRequestId]
  );

  return {
    proofRequestId,
    challenge,
    challengeHash: sha256(`${input.uid}:${challenge}`),
    circuitId: config.zkCircuitId,
    expiresAt: expires.rows[0]?.expires_at ?? new Date(Date.now() + 5 * 60 * 1000).toISOString()
  };
}

async function getProofRequest(proofRequestId: string): Promise<ProofRequestRecord | null> {
  const result = await pool.query<ProofRequestRecord>(
    `SELECT proof_request_id, uid, challenge, purpose, expires_at::text, consumed
     FROM zk_proof_requests
     WHERE proof_request_id = $1`,
    [proofRequestId]
  );
  return result.rows[0] ?? null;
}

export async function submitProof(input: {
  proofRequestId: string;
  uid: string;
  zkProof: unknown;
  publicSignals: unknown;
  handoffId?: string;
}): Promise<{
  verified: boolean;
  verificationId: string;
  reason?: string;
  assurance?: AssuranceContext;
}> {
  const request = await getProofRequest(input.proofRequestId);
  if (!request) {
    throw new Error("proof_request_not_found");
  }
  if (request.consumed) {
    throw new Error("proof_request_consumed");
  }
  if (request.uid !== input.uid) {
    throw new Error("uid_mismatch");
  }
  if (new Date(request.expires_at).getTime() < Date.now()) {
    throw new Error("proof_request_expired");
  }

  const expectedChallengeHash = sha256(`${request.uid}:${request.challenge}`);
  const verification = await verifyZkProof({
    uid: request.uid,
    expectedChallengeHash,
    zkProof: input.zkProof,
    publicSignals: input.publicSignals
  });

  await pool.query(
    `UPDATE zk_proof_requests
     SET consumed = TRUE
     WHERE proof_request_id = $1`,
    [input.proofRequestId]
  );

  const verificationId = randomId(18);
  await pool.query(
    `INSERT INTO zk_proof_receipts (verification_id, proof_request_id, uid, handoff_id, verified, reason, public_signals_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      verificationId,
      input.proofRequestId,
      request.uid,
      input.handoffId ?? null,
      verification.verified,
      verification.reason ?? null,
      verification.publicSignalsHash
    ]
  );

  if (!verification.verified) {
    return {
      verified: false,
      verificationId,
      reason: verification.reason ?? "zk_verification_failed"
    };
  }

  const identity = await pool.query<{ uid: string; did: string }>(
    `SELECT uid, did FROM pramaan_identity_map WHERE uid = $1`,
    [request.uid]
  );
  const row = identity.rows[0];
  return {
    verified: true,
    verificationId,
    assurance: {
      acr: "urn:zauth:aal2:zk",
      amr: ["passkey", "face", "zkp"],
      uid: row?.uid,
      did: row?.did,
      proofVerificationId: verificationId,
      zkpVerifiedAt: Date.now()
    }
  };
}

export async function getProofReceipt(verificationId: string): Promise<{
  verification_id: string;
  proof_request_id: string;
  uid: string;
  did: string | null;
  subject_id: string | null;
  handoff_id: string | null;
  verified: boolean;
  reason: string | null;
  public_signals_hash: string;
  created_at: string;
} | null> {
  const result = await pool.query<{
    verification_id: string;
    proof_request_id: string;
    uid: string;
    did: string | null;
    subject_id: string | null;
    handoff_id: string | null;
    verified: boolean;
    reason: string | null;
    public_signals_hash: string;
    created_at: string;
  }>(
    `SELECT verification_id,
            proof_request_id,
            zk_proof_receipts.uid,
            pramaan_identity_map.did,
            pramaan_identity_map.subject_id,
            handoff_id,
            verified,
            reason,
            public_signals_hash,
            zk_proof_receipts.created_at::text
     FROM zk_proof_receipts
     LEFT JOIN pramaan_identity_map ON pramaan_identity_map.uid = zk_proof_receipts.uid
     WHERE verification_id = $1`,
    [verificationId]
  );
  return result.rows[0] ?? null;
}
