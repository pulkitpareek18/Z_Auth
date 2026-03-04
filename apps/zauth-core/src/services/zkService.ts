import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { sha256 } from "../utils/crypto.js";

type VerificationResult = {
  verified: boolean;
  reason?: string;
  publicSignalsHash: string;
  mode: "mock" | "real";
};

let cachedVerificationKey: Record<string, unknown> | null = null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePossiblyJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const keys = Object.keys(value).sort();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    out[key] = canonicalize(value[key]);
  }
  return out;
}

function normalizePublicSignals(value: unknown): unknown[] | Record<string, unknown> {
  const parsed = parsePossiblyJson(value);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (isPlainObject(parsed)) {
    return parsed;
  }
  throw new Error("invalid_public_signals");
}

function normalizeProof(value: unknown): unknown {
  const parsed = parsePossiblyJson(value);
  if (isPlainObject(parsed)) {
    return parsed;
  }
  if (typeof parsed === "string" && parsed.length >= 16) {
    return parsed;
  }
  throw new Error("invalid_proof");
}

function hasChallengeBinding(signals: unknown[] | Record<string, unknown>, expectedChallengeHash: string): boolean {
  if (!config.zkRequireChallengeBinding) {
    return true;
  }

  if (Array.isArray(signals)) {
    return signals.some((value) => String(value) === expectedChallengeHash);
  }

  const candidates = [
    signals.challenge_hash,
    signals.challengeHash,
    signals.challenge_digest,
    signals.challengeDigest
  ];
  return candidates.some((value) => String(value ?? "") === expectedChallengeHash);
}

function computeMockProofDigest(expectedChallengeHash: string, signalsHash: string, uid: string): string {
  return sha256(`${expectedChallengeHash}:${signalsHash}:${uid}`);
}

async function loadVerificationKey(): Promise<Record<string, unknown>> {
  if (cachedVerificationKey) {
    return cachedVerificationKey;
  }

  const root = process.cwd();
  const candidates = config.zkVerifyKeyPath.startsWith("/")
    ? [config.zkVerifyKeyPath]
    : [
        path.join(root, config.zkVerifyKeyPath),
        path.join(root, "apps/zauth-core", config.zkVerifyKeyPath)
      ];

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      cachedVerificationKey = parsed;
      return parsed;
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError ?? new Error("verification_key_not_found");
}

const BN128_MASK = (1n << 253n) - 1n;

export function hexToFieldElement(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return (BigInt("0x" + clean) & BN128_MASK).toString();
}

export async function verifyZkProof(input: {
  uid: string;
  expectedChallengeHash: string;
  zkProof: unknown;
  publicSignals: unknown;
  expectedCommitment?: string;
}): Promise<VerificationResult> {
  const normalizedSignals = normalizePublicSignals(input.publicSignals);
  const signalsHash = sha256(JSON.stringify(canonicalize(normalizedSignals)));
  if (!hasChallengeBinding(normalizedSignals, input.expectedChallengeHash)) {
    return {
      verified: false,
      reason: "challenge_binding_missing",
      publicSignalsHash: signalsHash,
      mode: config.zkVerifierMode
    };
  }

  const normalizedProof = normalizeProof(input.zkProof);

  if (config.zkVerifierMode === "mock") {
    // Even in mock mode, enforce biometric commitment binding.
    // This prevents a different person's face from passing verification
    // because Poseidon(different_hash) won't match the stored commitment.
    if (input.expectedCommitment) {
      const proofCommitment = Array.isArray(normalizedSignals)
        ? String(normalizedSignals[0])
        : String(signalsHash);
      if (proofCommitment !== input.expectedCommitment) {
        return {
          verified: false,
          reason: "commitment_mismatch",
          publicSignalsHash: signalsHash,
          mode: config.zkVerifierMode
        };
      }
    }

    const supplied = typeof normalizedProof === "string" ? normalizedProof : String((normalizedProof as Record<string, unknown>).digest ?? "");
    const expected = computeMockProofDigest(input.expectedChallengeHash, signalsHash, input.uid);
    return {
      verified: supplied === expected,
      reason: supplied === expected ? undefined : "mock_proof_invalid",
      publicSignalsHash: signalsHash,
      mode: config.zkVerifierMode
    };
  }

  try {
    const snarkjsModule = await import("snarkjs").catch(() => null);
    if (!snarkjsModule?.groth16) {
      return {
        verified: false,
        reason: "snarkjs_unavailable",
        publicSignalsHash: signalsHash,
        mode: config.zkVerifierMode
      };
    }
    const verificationKey = await loadVerificationKey();
    if (!Array.isArray(normalizedSignals)) {
      return {
        verified: false,
        reason: "invalid_public_signals_for_real_mode",
        publicSignalsHash: signalsHash,
        mode: config.zkVerifierMode
      };
    }
    if (!isPlainObject(normalizedProof)) {
      return {
        verified: false,
        reason: "invalid_proof_for_real_mode",
        publicSignalsHash: signalsHash,
        mode: config.zkVerifierMode
      };
    }
    const verified = await snarkjsModule.groth16.verify(verificationKey as any, normalizedSignals as any, normalizedProof as any);
    if (!verified) {
      return {
        verified: false,
        reason: "proof_invalid",
        publicSignalsHash: signalsHash,
        mode: config.zkVerifierMode
      };
    }

    // Biometric commitment binding is mandatory — ensures the proof was generated
    // with the same biometric hash that was used during enrollment.
    if (!input.expectedCommitment) {
      return {
        verified: false,
        reason: "commitment_required",
        publicSignalsHash: signalsHash,
        mode: config.zkVerifierMode
      };
    }
    const proofCommitment = String(normalizedSignals[0]);
    if (proofCommitment !== input.expectedCommitment) {
      return {
        verified: false,
        reason: "commitment_mismatch",
        publicSignalsHash: signalsHash,
        mode: config.zkVerifierMode
      };
    }

    return {
      verified: true,
      publicSignalsHash: signalsHash,
      mode: config.zkVerifierMode
    };
  } catch (error) {
    return {
      verified: false,
      reason: `verifier_error:${(error as Error).message}`,
      publicSignalsHash: signalsHash,
      mode: config.zkVerifierMode
    };
  }
}

export function buildMockProofDigest(input: {
  uid: string;
  expectedChallengeHash: string;
  publicSignals: unknown;
}): string {
  const signalsHash = sha256(JSON.stringify(canonicalize(input.publicSignals)));
  return computeMockProofDigest(input.expectedChallengeHash, signalsHash, input.uid);
}
