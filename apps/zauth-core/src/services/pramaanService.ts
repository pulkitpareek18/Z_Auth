import { ulid } from "ulid";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { sha256, randomId } from "../utils/crypto.js";
import { signAttestationJwt } from "./keyService.js";

export async function registerIdentity(input: {
  tenantId: string;
  subjectId: string;
  canonicalInputProof: string;
  deviceNonce: string;
}): Promise<{ uid: string; did: string; commitmentRoot: string; attestationJwt: string }> {
  const hash1 = sha256(`${input.canonicalInputProof}:${config.tenantSalt}`);
  const hash2 = sha256(`${hash1}:${input.deviceNonce}`);
  const uid = ulid();
  const did = `did:zauth:${input.tenantId}:${uid}`;
  const commitmentRoot = sha256(`${hash1}:${hash2}:${did}:${uid}`);

  await pool.query(
    `INSERT INTO pramaan_identity_map (uid, did, hash1, hash2, commitment_root, subject_id, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uid, did, hash1, hash2, commitmentRoot, input.subjectId, input.tenantId]
  );

  const attestationJwt = await signAttestationJwt(input.subjectId, {
    did,
    uid,
    commitment_root: commitmentRoot,
    hash_alg: "sha256"
  });

  return { uid, did, commitmentRoot, attestationJwt };
}

export async function getIdentity(uid: string): Promise<
  | {
      uid: string;
      did: string;
      hash1: string;
      hash2: string;
      commitment_root: string;
      subject_id: string;
      tenant_id: string;
      created_at: string;
    }
  | null
> {
  const result = await pool.query<{
    uid: string;
    did: string;
    hash1: string;
    hash2: string;
    commitment_root: string;
    subject_id: string;
    tenant_id: string;
    created_at: string;
  }>(
    `SELECT uid, did, hash1, hash2, commitment_root, subject_id, tenant_id, created_at::text
     FROM pramaan_identity_map
     WHERE uid = $1`,
    [uid]
  );

  return result.rows[0] ?? null;
}

export async function createProofChallenge(uid: string): Promise<{ challengeId: string; challenge: string; expiresAt: string }> {
  const challengeId = randomId(18);
  const challenge = randomId(24);
  await pool.query(
    `INSERT INTO proof_challenges (challenge_id, uid, challenge, expires_at)
     VALUES ($1, $2, $3, NOW() + interval '5 minutes')`,
    [challengeId, uid, challenge]
  );

  const expires = await pool.query<{ expires_at: string }>(
    `SELECT expires_at::text FROM proof_challenges WHERE challenge_id = $1`,
    [challengeId]
  );

  return {
    challengeId,
    challenge,
    expiresAt: expires.rows[0]?.expires_at ?? new Date(Date.now() + 5 * 60 * 1000).toISOString()
  };
}

export async function verifyProof(input: {
  challengeId: string;
  uid: string;
  proof: string;
}): Promise<{ verified: boolean; reason?: string }> {
  const challengeResult = await pool.query<{
    challenge_id: string;
    uid: string;
    challenge: string;
    expires_at: string;
    consumed: boolean;
  }>(
    `SELECT challenge_id, uid, challenge, expires_at::text, consumed
     FROM proof_challenges
     WHERE challenge_id = $1`,
    [input.challengeId]
  );

  const row = challengeResult.rows[0];
  if (!row) {
    return { verified: false, reason: "challenge_not_found" };
  }

  if (row.consumed) {
    return { verified: false, reason: "challenge_already_used" };
  }

  if (row.uid !== input.uid) {
    return { verified: false, reason: "uid_mismatch" };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { verified: false, reason: "challenge_expired" };
  }

  const expected = sha256(`${row.challenge}:${input.uid}`);
  const verified = expected === input.proof;

  await pool.query(`UPDATE proof_challenges SET consumed = TRUE WHERE challenge_id = $1`, [input.challengeId]);

  if (!verified) {
    return { verified: false, reason: "invalid_proof" };
  }

  return { verified: true };
}
