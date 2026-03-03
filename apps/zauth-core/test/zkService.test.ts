import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests for the ZK proof verification service.
 *
 * We mock ../config.js so that we can control zkVerifierMode and
 * zkRequireChallengeBinding without requiring env vars or dotenv.
 */

// ── Mocks ────────────────────────────────────────────────────────────

// Use vi.hoisted so the config object is available when the vi.mock factory runs
// (vi.mock calls are hoisted above all other code by vitest).
const mockConfig = vi.hoisted(() => ({
  zkVerifierMode: "mock" as "mock" | "real",
  zkRequireChallengeBinding: true,
  zkCircuitId: "biometric_commitment_v1",
  zkVerifyKeyPath: "zk/verification_key.json",
}));

vi.mock("../src/config.js", () => ({ config: mockConfig }));

// ── Import subjects under test (after vi.mock) ──────────────────────
import { hexToFieldElement, verifyZkProof, buildMockProofDigest } from "../src/services/zkService.js";
import { sha256 } from "../src/utils/crypto.js";

// ── Helpers ──────────────────────────────────────────────────────────

/** Reproduce the internal canonicalize + sha256 pipeline for signals. */
function signalsHash(signals: unknown): string {
  return sha256(JSON.stringify(canonicalize(signals)));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = canonicalize((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return value;
}

/** Reproduce the internal computeMockProofDigest. */
function expectedDigest(challengeHash: string, signals: unknown, uid: string): string {
  const sh = signalsHash(signals);
  return sha256(`${challengeHash}:${sh}:${uid}`);
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  mockConfig.zkVerifierMode = "mock";
  mockConfig.zkRequireChallengeBinding = true;
});

describe("hexToFieldElement", () => {
  it("masks to BN128 field (253-bit mask)", () => {
    // BN128_MASK = (1n << 253n) - 1n
    const mask = (1n << 253n) - 1n;
    const input = "ff".repeat(32); // 256-bit all-ones
    const result = hexToFieldElement(input);
    expect(result).toBe((BigInt("0x" + input) & mask).toString());
  });

  it("handles 0x prefix", () => {
    const hex = "0xabcdef1234567890";
    const result = hexToFieldElement(hex);
    const expected = (BigInt(hex) & ((1n << 253n) - 1n)).toString();
    expect(result).toBe(expected);
  });

  it("handles short hex without 0x prefix", () => {
    const hex = "1a2b";
    const result = hexToFieldElement(hex);
    expect(result).toBe(BigInt("0x1a2b").toString());
  });

  it("returns '0' for zero input", () => {
    expect(hexToFieldElement("0x0")).toBe("0");
    expect(hexToFieldElement("00")).toBe("0");
  });

  it("values below the mask are unchanged", () => {
    const small = "0123456789abcdef";
    const result = hexToFieldElement(small);
    expect(result).toBe(BigInt("0x" + small).toString());
  });
});

describe("buildMockProofDigest", () => {
  it("returns a deterministic sha256 digest", () => {
    const uid = "user-001";
    const challengeHash = sha256("test-challenge");
    const signals = ["sig1", "sig2"];

    const digest = buildMockProofDigest({
      uid,
      expectedChallengeHash: challengeHash,
      publicSignals: signals,
    });

    // Must be 64-char hex (sha256)
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces consistent results for the same input", () => {
    const params = {
      uid: "u1",
      expectedChallengeHash: "ch1",
      publicSignals: [1, 2, 3],
    };
    expect(buildMockProofDigest(params)).toBe(buildMockProofDigest(params));
  });

  it("varies when uid changes", () => {
    const base = { expectedChallengeHash: "ch", publicSignals: ["a"] };
    const d1 = buildMockProofDigest({ ...base, uid: "u1" });
    const d2 = buildMockProofDigest({ ...base, uid: "u2" });
    expect(d1).not.toBe(d2);
  });

  it("varies when challenge changes", () => {
    const base = { uid: "u", publicSignals: ["a"] };
    const d1 = buildMockProofDigest({ ...base, expectedChallengeHash: "c1" });
    const d2 = buildMockProofDigest({ ...base, expectedChallengeHash: "c2" });
    expect(d1).not.toBe(d2);
  });

  it("varies when signals change", () => {
    const base = { uid: "u", expectedChallengeHash: "c" };
    const d1 = buildMockProofDigest({ ...base, publicSignals: ["x"] });
    const d2 = buildMockProofDigest({ ...base, publicSignals: ["y"] });
    expect(d1).not.toBe(d2);
  });
});

describe("verifyZkProof – mock mode", () => {
  const uid = "user-test-123";
  const challengeHash = sha256("uid:challenge");
  const signals = [challengeHash, "other-signal"];

  it("accepts a valid mock proof (string form)", async () => {
    const digest = expectedDigest(challengeHash, signals, uid);

    const result = await verifyZkProof({
      uid,
      expectedChallengeHash: challengeHash,
      zkProof: digest, // supply the digest as a plain string
      publicSignals: signals,
    });

    expect(result.verified).toBe(true);
    expect(result.mode).toBe("mock");
    expect(result.reason).toBeUndefined();
    expect(result.publicSignalsHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts a valid mock proof (object with digest key)", async () => {
    const digest = expectedDigest(challengeHash, signals, uid);

    const result = await verifyZkProof({
      uid,
      expectedChallengeHash: challengeHash,
      zkProof: { digest },
      publicSignals: signals,
    });

    expect(result.verified).toBe(true);
    expect(result.mode).toBe("mock");
  });

  it("rejects a proof with wrong digest", async () => {
    const result = await verifyZkProof({
      uid,
      expectedChallengeHash: challengeHash,
      zkProof: "0000000000000000wrong_digest_value_padded_to_length",
      publicSignals: signals,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("mock_proof_invalid");
    expect(result.mode).toBe("mock");
  });

  it("accepts JSON-stringified public signals", async () => {
    const jsonSignals = JSON.stringify(signals);
    const digest = expectedDigest(challengeHash, signals, uid);

    const result = await verifyZkProof({
      uid,
      expectedChallengeHash: challengeHash,
      zkProof: digest,
      publicSignals: jsonSignals,
    });

    expect(result.verified).toBe(true);
  });

  it("accepts JSON-stringified proof", async () => {
    const digest = expectedDigest(challengeHash, signals, uid);
    const proofObj = { digest };
    const jsonProof = JSON.stringify(proofObj);

    const result = await verifyZkProof({
      uid,
      expectedChallengeHash: challengeHash,
      zkProof: jsonProof,
      publicSignals: signals,
    });

    expect(result.verified).toBe(true);
  });
});

describe("verifyZkProof – challenge binding", () => {
  const uid = "user-bind";
  const challengeHash = sha256("bind-test");

  it("rejects when challenge hash is not in array signals", async () => {
    mockConfig.zkRequireChallengeBinding = true;
    const signals = ["not-the-hash", "also-not"];

    const result = await verifyZkProof({
      uid,
      expectedChallengeHash: challengeHash,
      zkProof: "0".repeat(64),
      publicSignals: signals,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("challenge_binding_missing");
  });

  it("passes when challenge hash IS in the array signals", async () => {
    mockConfig.zkRequireChallengeBinding = true;
    const signals = [challengeHash, "extra"];
    const digest = expectedDigest(challengeHash, signals, uid);

    const result = await verifyZkProof({
      uid,
      expectedChallengeHash: challengeHash,
      zkProof: digest,
      publicSignals: signals,
    });

    expect(result.verified).toBe(true);
  });

  it("skips binding check when zkRequireChallengeBinding is false", async () => {
    mockConfig.zkRequireChallengeBinding = false;
    const signals = ["no-hash-here"];
    const digest = expectedDigest(challengeHash, signals, uid);

    const result = await verifyZkProof({
      uid,
      expectedChallengeHash: challengeHash,
      zkProof: digest,
      publicSignals: signals,
    });

    // Should not fail with challenge_binding_missing
    expect(result.reason).not.toBe("challenge_binding_missing");
    // The proof should be verified because digest matches
    expect(result.verified).toBe(true);
  });

  it("finds challenge_hash in object-form signals", async () => {
    mockConfig.zkRequireChallengeBinding = true;
    const signals = { challenge_hash: challengeHash, commitment: "abc" };
    const digest = expectedDigest(challengeHash, signals, uid);

    const result = await verifyZkProof({
      uid,
      expectedChallengeHash: challengeHash,
      zkProof: digest,
      publicSignals: signals,
    });

    expect(result.verified).toBe(true);
  });

  it("finds challengeHash (camelCase) in object-form signals", async () => {
    mockConfig.zkRequireChallengeBinding = true;
    const signals = { challengeHash: challengeHash, commitment: "abc" };
    const digest = expectedDigest(challengeHash, signals, uid);

    const result = await verifyZkProof({
      uid,
      expectedChallengeHash: challengeHash,
      zkProof: digest,
      publicSignals: signals,
    });

    expect(result.verified).toBe(true);
  });

  it("finds challenge_digest in object-form signals", async () => {
    mockConfig.zkRequireChallengeBinding = true;
    const signals = { challenge_digest: challengeHash, other: "val" };
    const digest = expectedDigest(challengeHash, signals, uid);

    const result = await verifyZkProof({
      uid,
      expectedChallengeHash: challengeHash,
      zkProof: digest,
      publicSignals: signals,
    });

    expect(result.verified).toBe(true);
  });
});

describe("normalizePublicSignals", () => {
  const uid = "u-normalize";
  const challengeHash = sha256("normalize-test");

  it("throws on non-array, non-object signals", async () => {
    await expect(
      verifyZkProof({
        uid,
        expectedChallengeHash: challengeHash,
        zkProof: "0".repeat(64),
        publicSignals: 12345,
      })
    ).rejects.toThrow("invalid_public_signals");
  });

  it("throws on boolean signals", async () => {
    await expect(
      verifyZkProof({
        uid,
        expectedChallengeHash: challengeHash,
        zkProof: "0".repeat(64),
        publicSignals: true,
      })
    ).rejects.toThrow("invalid_public_signals");
  });

  it("parses JSON string into array", async () => {
    mockConfig.zkRequireChallengeBinding = false;
    const signals = [challengeHash, "sig2"];
    const digest = expectedDigest(challengeHash, signals, uid);

    const result = await verifyZkProof({
      uid,
      expectedChallengeHash: challengeHash,
      zkProof: digest,
      publicSignals: JSON.stringify(signals),
    });

    expect(result.verified).toBe(true);
  });

  it("parses JSON string into object", async () => {
    mockConfig.zkRequireChallengeBinding = false;
    const signals = { a: "1", b: "2" };
    const digest = expectedDigest(challengeHash, signals, uid);

    const result = await verifyZkProof({
      uid,
      expectedChallengeHash: challengeHash,
      zkProof: digest,
      publicSignals: JSON.stringify(signals),
    });

    expect(result.verified).toBe(true);
  });
});

describe("normalizeProof", () => {
  it("rejects too-short string proofs", async () => {
    mockConfig.zkRequireChallengeBinding = false;
    await expect(
      verifyZkProof({
        uid: "u",
        expectedChallengeHash: "c",
        zkProof: "short",
        publicSignals: ["s"],
      })
    ).rejects.toThrow("invalid_proof");
  });

  it("rejects numeric proof", async () => {
    mockConfig.zkRequireChallengeBinding = false;
    await expect(
      verifyZkProof({
        uid: "u",
        expectedChallengeHash: "c",
        zkProof: 42,
        publicSignals: ["s"],
      })
    ).rejects.toThrow("invalid_proof");
  });
});
