import { ulid } from "ulid";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import type { AssuranceContext } from "../types/models.js";
import { randomId, sha256 } from "../utils/crypto.js";
import { getCache } from "./cacheService.js";
import { signAttestationJwt } from "./keyService.js";
import { hexToFieldElement, verifyZkProof } from "./zkService.js";

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
  biometricHash?: string;
  skipRecoveryCodeRegen?: boolean;
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
    expectedChallengeHash: config.zkVerifierMode === "real" ? hexToFieldElement(expectedChallengeHash) : expectedChallengeHash,
    zkProof: input.zkProof,
    publicSignals: input.publicSignals
  });
  if (!verification.verified) {
    throw new Error(verification.reason ?? "zk_verification_failed");
  }

  let zkCommitment: string | null = null;
  if (config.zkVerifierMode === "real" && Array.isArray(input.publicSignals)) {
    zkCommitment = String(input.publicSignals[0]);
  }

  // Privacy-by-design: only store the irreversible biometric commitment hash.
  // Raw face embeddings NEVER leave the client device.
  // The biometric_hash is SHA-256(face_descriptor) computed client-side.
  await pool.query(
    `INSERT INTO pramaan_identity_map (uid, did, hash1, hash2, commitment_root, subject_id, tenant_id, biometric_hash, zk_commitment)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (uid) DO UPDATE
     SET did = EXCLUDED.did,
         hash1 = EXCLUDED.hash1,
         hash2 = EXCLUDED.hash2,
         commitment_root = EXCLUDED.commitment_root,
         subject_id = EXCLUDED.subject_id,
         tenant_id = EXCLUDED.tenant_id,
         biometric_hash = EXCLUDED.biometric_hash,
         zk_commitment = EXCLUDED.zk_commitment`,
    [draft.uidDraft, draft.didDraft, input.hash1, input.hash2, input.commitmentRoot, draft.subjectId, draft.tenantId, input.biometricHash ?? null, zkCommitment]
  );

  await pool.query(
    `INSERT INTO identity_commitments (uid, did, hash1, hash2, commitment_root, circuit_id, subject_id, tenant_id, zk_commitment)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (uid) DO UPDATE
     SET did = EXCLUDED.did,
         hash1 = EXCLUDED.hash1,
         hash2 = EXCLUDED.hash2,
         commitment_root = EXCLUDED.commitment_root,
         circuit_id = EXCLUDED.circuit_id,
         subject_id = EXCLUDED.subject_id,
         tenant_id = EXCLUDED.tenant_id,
         zk_commitment = EXCLUDED.zk_commitment`,
    [
      draft.uidDraft,
      draft.didDraft,
      input.hash1,
      input.hash2,
      input.commitmentRoot,
      draft.circuitId,
      draft.subjectId,
      draft.tenantId,
      zkCommitment
    ]
  );

  // Blockchain-ready: append-only identity commitment event log.
  // Each enrollment creates a new versioned entry (maps to on-chain IdentityCommitted events).
  const versionResult = await pool.query<{ next_version: number; prev_root: string | null }>(
    `SELECT
       COALESCE(MAX(version), 0) + 1 as next_version,
       (SELECT commitment_root FROM identity_commitment_log WHERE uid = $1 ORDER BY version DESC LIMIT 1) as prev_root
     FROM identity_commitment_log WHERE uid = $1`,
    [draft.uidDraft]
  );
  await pool.query(
    `INSERT INTO identity_commitment_log (uid, did, version, hash1, hash2, commitment_root, circuit_id, subject_id, tenant_id, zk_commitment, prev_commitment_root)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      draft.uidDraft, draft.didDraft,
      versionResult.rows[0]?.next_version ?? 1,
      input.hash1, input.hash2, input.commitmentRoot,
      draft.circuitId, draft.subjectId, draft.tenantId,
      zkCommitment,
      versionResult.rows[0]?.prev_root ?? null
    ]
  );

  // Only regenerate recovery codes on fresh enrollment or face-verified recovery.
  // Multi-code recovery skips this so the attacker can't mint fresh codes.
  // Blockchain-ready: instead of DELETE old codes, we INSERT a new generation.
  // Old generations are superseded (not deleted) — append-only.
  let recoveryCodes: string[] = [];
  if (!input.skipRecoveryCodeRegen) {
    recoveryCodes = generateRecoveryCodes();
    const generationId = randomId(12);
    for (const code of recoveryCodes) {
      await pool.query(
        `INSERT INTO recovery_codes (subject_id, code_hash, generation_id)
         VALUES ($1, $2, $3)`,
        [draft.subjectId, sha256(`${draft.subjectId}:${code}:${config.tenantSalt}`), generationId]
      );
    }
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
  challengeField?: string;
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

  const challengeHash = sha256(`${input.uid}:${challenge}`);
  const challengeField = config.zkVerifierMode === "real" ? hexToFieldElement(challengeHash) : undefined;

  return {
    proofRequestId,
    challenge,
    challengeHash,
    challengeField,
    circuitId: config.zkCircuitId,
    expiresAt: expires.rows[0]?.expires_at ?? new Date(Date.now() + 5 * 60 * 1000).toISOString()
  };
}

// Blockchain-ready: derive consumed status from nullifier table, not from column.
async function getProofRequest(proofRequestId: string): Promise<ProofRequestRecord | null> {
  const result = await pool.query<ProofRequestRecord>(
    `SELECT zpr.proof_request_id, zpr.uid, zpr.challenge, zpr.purpose, zpr.expires_at::text,
            (prn.proof_request_id IS NOT NULL) as consumed
     FROM zk_proof_requests zpr
     LEFT JOIN proof_request_nullifiers prn ON prn.proof_request_id = zpr.proof_request_id
     WHERE zpr.proof_request_id = $1`,
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
  biometricHash?: string;
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

  // Privacy-by-design: biometric matching happens CLIENT-SIDE only.
  // The server stores only an irreversible SHA-256 hash of the face descriptor
  // (the "biometric commitment"). Raw face embeddings NEVER leave the user's device.
  //
  // IMPORTANT: We do NOT compare biometric hashes across sessions because face-api.js
  // produces slightly different descriptors each capture (lighting, angle, frame timing).
  // SHA-256 is not a fuzzy matcher — any byte difference produces a completely different
  // hash. Instead, identity binding is proven through:
  //   1. Liveness detection (real face present)
  //   2. ZK proof (proves knowledge of biometric commitment preimage)
  //   3. Passkey (device possession)

  const expectedChallengeHash = sha256(`${request.uid}:${request.challenge}`);

  // ZK proof verification: proves identity binding without revealing biometric data.
  // The ZK proof ensures challenge freshness and identity binding.
  const verification = await verifyZkProof({
    uid: request.uid,
    expectedChallengeHash: config.zkVerifierMode === "real" ? hexToFieldElement(expectedChallengeHash) : expectedChallengeHash,
    zkProof: input.zkProof,
    publicSignals: input.publicSignals
  });

  // Blockchain-ready: INSERT nullifier instead of UPDATE consumed = TRUE.
  await pool.query(
    `INSERT INTO proof_request_nullifiers (proof_request_id)
     VALUES ($1) ON CONFLICT (proof_request_id) DO NOTHING`,
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

export async function verifyRecoveryCode(input: {
  username: string;
  recoveryCode: string;
}): Promise<{
  valid: boolean;
  subjectId?: string;
  codeId?: number;
  reason?: string;
}> {
  const userResult = await pool.query<{ subject_id: string }>(
    `SELECT subject_id FROM users WHERE username = $1`,
    [input.username.trim().toLowerCase()]
  );
  const user = userResult.rows[0];
  if (!user) {
    return { valid: false, reason: "user_not_found" };
  }

  const normalizedCode = input.recoveryCode.trim().toUpperCase();
  const codeHash = sha256(`${user.subject_id}:${normalizedCode}:${config.tenantSalt}`);

  // Blockchain-ready: filter by latest generation (superseded generations are ignored, not deleted).
  const genResult = await pool.query<{ generation_id: string }>(
    `SELECT generation_id FROM recovery_codes WHERE subject_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [user.subject_id]
  );
  if (!genResult.rows[0]) {
    return { valid: false, reason: "no_recovery_codes" };
  }
  const latestGen = genResult.rows[0].generation_id;

  const codeResult = await pool.query<{ id: number }>(
    `SELECT id FROM recovery_codes WHERE subject_id = $1 AND code_hash = $2 AND generation_id = $3`,
    [user.subject_id, codeHash, latestGen]
  );
  const code = codeResult.rows[0];
  if (!code) {
    return { valid: false, reason: "invalid_code" };
  }

  // Blockchain-ready: check nullifier instead of consumed_at column.
  const nullifierCheck = await pool.query(
    `SELECT 1 FROM recovery_nullifiers WHERE code_id = $1`,
    [code.id]
  );
  if (nullifierCheck.rows.length > 0) {
    return { valid: false, reason: "code_already_used" };
  }

  // Don't consume yet — consumption happens after biometric verification
  return { valid: true, subjectId: user.subject_id, codeId: code.id };
}

// Blockchain-ready: instead of UPDATE consumed_at, INSERT a nullifier.
// Mirrors on-chain nullifier sets used in ZK mixers / commitment schemes.
export async function consumeRecoveryCode(codeId: number, subjectId: string): Promise<void> {
  const nullifierHash = sha256(`nullifier:recovery:${codeId}:${subjectId}`);
  await pool.query(
    `INSERT INTO recovery_nullifiers (nullifier_hash, code_id, subject_id)
     VALUES ($1, $2, $3) ON CONFLICT (nullifier_hash) DO NOTHING`,
    [nullifierHash, codeId, subjectId]
  );
}

// Blockchain-ready: batch nullifier insertion for multi-code consumption.
export async function consumeRecoveryCodes(codeIds: number[], subjectId: string): Promise<void> {
  for (const codeId of codeIds) {
    const nullifierHash = sha256(`nullifier:recovery:${codeId}:${subjectId}`);
    await pool.query(
      `INSERT INTO recovery_nullifiers (nullifier_hash, code_id, subject_id)
       VALUES ($1, $2, $3) ON CONFLICT (nullifier_hash) DO NOTHING`,
      [nullifierHash, codeId, subjectId]
    );
  }
}

// Verify multiple recovery codes for the face-mismatch fallback.
// Requires RECOVERY_CODES_FOR_BYPASS (default 3) valid, unconsumed codes.
const RECOVERY_CODES_FOR_BYPASS = 3;

export async function verifyMultipleRecoveryCodes(input: {
  subjectId: string;
  recoveryCodes: string[];
}): Promise<{
  valid: boolean;
  codeIds: number[];
  reason?: string;
}> {
  if (input.recoveryCodes.length < RECOVERY_CODES_FOR_BYPASS) {
    return { valid: false, codeIds: [], reason: `need_${RECOVERY_CODES_FOR_BYPASS}_codes` };
  }

  // Deduplicate
  const uniqueCodes = [...new Set(input.recoveryCodes.map(c => c.trim().toUpperCase()))];
  if (uniqueCodes.length < RECOVERY_CODES_FOR_BYPASS) {
    return { valid: false, codeIds: [], reason: "duplicate_codes" };
  }

  // Blockchain-ready: filter by latest generation (old generations superseded, not deleted).
  const genResult = await pool.query<{ generation_id: string }>(
    `SELECT generation_id FROM recovery_codes WHERE subject_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [input.subjectId]
  );
  if (!genResult.rows[0]) {
    return { valid: false, codeIds: [], reason: "no_recovery_codes" };
  }
  const latestGen = genResult.rows[0].generation_id;

  const validIds: number[] = [];
  for (const code of uniqueCodes.slice(0, RECOVERY_CODES_FOR_BYPASS)) {
    const codeHash = sha256(`${input.subjectId}:${code}:${config.tenantSalt}`);
    const result = await pool.query<{ id: number }>(
      `SELECT id FROM recovery_codes WHERE subject_id = $1 AND code_hash = $2 AND generation_id = $3`,
      [input.subjectId, codeHash, latestGen]
    );
    const row = result.rows[0];
    if (!row) {
      return { valid: false, codeIds: [], reason: "invalid_code" };
    }
    // Blockchain-ready: check nullifier instead of consumed_at.
    const nullifierCheck = await pool.query(
      `SELECT 1 FROM recovery_nullifiers WHERE code_id = $1`,
      [row.id]
    );
    if (nullifierCheck.rows.length > 0) {
      return { valid: false, codeIds: [], reason: "code_already_used" };
    }
    validIds.push(row.id);
  }

  return { valid: true, codeIds: validIds };
}

export async function findUidForSubject(subjectId: string): Promise<string | null> {
  const result = await pool.query<{ uid: string }>(
    `SELECT uid FROM pramaan_identity_map WHERE subject_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [subjectId]
  );
  return result.rows[0]?.uid ?? null;
}

// Blockchain-ready: INSERT revocation events instead of DELETE.
// Revoked credentials are filtered out at query time.
export async function revokeAllCredentialsForSubject(subjectId: string): Promise<void> {
  const credentials = await pool.query<{ credential_id: string }>(
    `SELECT pc.credential_id FROM passkey_credentials pc
     WHERE pc.subject_id = $1
     AND NOT EXISTS (SELECT 1 FROM credential_revocations cr WHERE cr.credential_id = pc.credential_id)`,
    [subjectId]
  );
  for (const cred of credentials.rows) {
    await pool.query(
      `INSERT INTO credential_revocations (credential_id, subject_id)
       VALUES ($1, $2) ON CONFLICT (credential_id) DO NOTHING`,
      [cred.credential_id, subjectId]
    );
  }
}

// ── Privacy-Preserving Biometric Commitment Verification ────────────
// The server NEVER stores or processes raw face embeddings (Float32Array).
// All face matching (Euclidean distance, liveness, etc.) happens CLIENT-SIDE
// on the user's device. The server only stores and verifies an irreversible
// SHA-256 hash of the face descriptor — the "biometric commitment."
//
// This ensures:
//   1. No biometric templates stored server-side (GDPR/BIPA compliant)
//   2. A database breach cannot reconstruct facial features
//   3. The hash is one-way: SHA-256(descriptor) → 64-char hex, non-invertible
//   4. Patent-aligned: ZK proof + biometric commitment = identity binding
//      without revealing the biometric itself

export async function verifyBiometricCommitment(input: {
  uid: string;
  candidateHash: string;
}): Promise<{
  matched: boolean;
  reason?: string;
}> {
  const result = await pool.query<{ biometric_hash: string | null }>(
    `SELECT biometric_hash FROM pramaan_identity_map WHERE uid = $1`,
    [input.uid]
  );
  const row = result.rows[0];
  if (!row) {
    return { matched: false, reason: "uid_not_found" };
  }
  if (!row.biometric_hash) {
    return { matched: false, reason: "no_enrolled_biometric" };
  }

  // Constant-time comparison to prevent timing attacks on the hash
  const enrolled = row.biometric_hash.toLowerCase();
  const candidate = input.candidateHash.toLowerCase();
  if (enrolled.length !== candidate.length) {
    return { matched: false, reason: "biometric_commitment_mismatch" };
  }

  let mismatch = 0;
  for (let i = 0; i < enrolled.length; i++) {
    mismatch |= enrolled.charCodeAt(i) ^ candidate.charCodeAt(i);
  }

  const matched = mismatch === 0;
  return {
    matched,
    reason: matched ? undefined : "biometric_commitment_mismatch"
  };
}
