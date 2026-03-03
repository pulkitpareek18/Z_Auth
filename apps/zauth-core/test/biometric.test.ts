import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Unit tests for verifyBiometricCommitment from pramaanV2Service.
 *
 * The function queries the database via pool.query, so we mock the
 * pg pool to avoid needing a real Postgres connection.
 */

// ── Mocks ────────────────────────────────────────────────────────────

const mockQuery = vi.fn();

vi.mock("../src/db/pool.js", () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
  closePool: vi.fn(),
}));

// Mock config (required by pramaanV2Service at import time)
vi.mock("../src/config.js", () => ({
  config: {
    zkVerifierMode: "mock",
    zkRequireChallengeBinding: true,
    zkCircuitId: "biometric_commitment_v1",
    zkVerifyKeyPath: "zk/verification_key.json",
    tenantSalt: "test-salt",
  },
}));

// Mock cacheService (required by pramaanV2Service at import time)
vi.mock("../src/services/cacheService.js", () => ({
  getCache: () => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  }),
}));

// Mock keyService (required by pramaanV2Service at import time)
vi.mock("../src/services/keyService.js", () => ({
  signAttestationJwt: vi.fn().mockResolvedValue("mock-jwt"),
}));

// ── Import subject under test (after vi.mock) ───────────────────────
import { verifyBiometricCommitment } from "../src/services/pramaanV2Service.js";

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  mockQuery.mockReset();
});

describe("verifyBiometricCommitment", () => {
  const uid = "test-uid-001";
  const biometricHash = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  it("returns matched:true when candidateHash matches enrolled hash", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ biometric_hash: biometricHash }],
    });

    const result = await verifyBiometricCommitment({
      uid,
      candidateHash: biometricHash,
    });

    expect(result.matched).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("is case-insensitive (both lowercased before comparison)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ biometric_hash: biometricHash.toUpperCase() }],
    });

    const result = await verifyBiometricCommitment({
      uid,
      candidateHash: biometricHash.toLowerCase(),
    });

    expect(result.matched).toBe(true);
  });

  it("returns matched:false with reason uid_not_found when uid does not exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await verifyBiometricCommitment({
      uid: "nonexistent-uid",
      candidateHash: biometricHash,
    });

    expect(result.matched).toBe(false);
    expect(result.reason).toBe("uid_not_found");
  });

  it("returns matched:false with reason no_enrolled_biometric when biometric_hash is null", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ biometric_hash: null }],
    });

    const result = await verifyBiometricCommitment({
      uid,
      candidateHash: biometricHash,
    });

    expect(result.matched).toBe(false);
    expect(result.reason).toBe("no_enrolled_biometric");
  });

  it("returns matched:false with reason biometric_commitment_mismatch on hash mismatch", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ biometric_hash: biometricHash }],
    });

    const wrongHash = "ff".repeat(32);

    const result = await verifyBiometricCommitment({
      uid,
      candidateHash: wrongHash,
    });

    expect(result.matched).toBe(false);
    expect(result.reason).toBe("biometric_commitment_mismatch");
  });

  it("returns mismatch when hashes differ in length", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ biometric_hash: biometricHash }],
    });

    const result = await verifyBiometricCommitment({
      uid,
      candidateHash: "abc123", // much shorter
    });

    expect(result.matched).toBe(false);
    expect(result.reason).toBe("biometric_commitment_mismatch");
  });

  it("performs constant-time comparison (single-char difference still fails)", async () => {
    const enrolled = "a".repeat(64);
    const candidate = "a".repeat(63) + "b"; // differs in last char only

    mockQuery.mockResolvedValueOnce({
      rows: [{ biometric_hash: enrolled }],
    });

    const result = await verifyBiometricCommitment({
      uid,
      candidateHash: candidate,
    });

    expect(result.matched).toBe(false);
    expect(result.reason).toBe("biometric_commitment_mismatch");
  });

  it("queries the correct table and uid parameter", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ biometric_hash: biometricHash }],
    });

    await verifyBiometricCommitment({ uid: "my-uid", candidateHash: biometricHash });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("pramaan_identity_map");
    expect(sql).toContain("biometric_hash");
    expect(params).toEqual(["my-uid"]);
  });
});
