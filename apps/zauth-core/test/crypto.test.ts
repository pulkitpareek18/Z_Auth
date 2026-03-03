import { describe, expect, it } from "vitest";
import { computeAuditHash, deriveCodeChallenge, nowEpoch, randomId, sha256 } from "../src/utils/crypto.js";

describe("crypto utilities", () => {
  // ── sha256 ──────────────────────────────────────────────────────────

  describe("sha256", () => {
    it("hashes consistently", () => {
      expect(sha256("zauth")).toBe(sha256("zauth"));
      expect(sha256("zauth")).not.toBe(sha256("different"));
    });

    it("produces a 64-character hex string", () => {
      const hash = sha256("hello");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("handles empty string input", () => {
      const hash = sha256("");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      // SHA-256 of empty string is well-known
      expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    it("produces different hashes for different inputs", () => {
      const h1 = sha256("input-a");
      const h2 = sha256("input-b");
      expect(h1).not.toBe(h2);
    });

    it("handles unicode input", () => {
      const hash = sha256("zauth-\u2603-snowman");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("handles very long input", () => {
      const longString = "a".repeat(100_000);
      const hash = sha256(longString);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // ── deriveCodeChallenge ─────────────────────────────────────────────

  describe("deriveCodeChallenge", () => {
    it("creates deterministic code challenge", () => {
      const verifier = "test-verifier";
      const challenge = deriveCodeChallenge(verifier);
      expect(challenge.length).toBeGreaterThan(20);
      expect(challenge).toBe(deriveCodeChallenge(verifier));
    });

    it("returns a base64url string", () => {
      const challenge = deriveCodeChallenge("my-verifier");
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("different verifiers produce different challenges", () => {
      const c1 = deriveCodeChallenge("verifier-1");
      const c2 = deriveCodeChallenge("verifier-2");
      expect(c1).not.toBe(c2);
    });
  });

  // ── computeAuditHash ───────────────────────────────────────────────

  describe("computeAuditHash", () => {
    it("uses GENESIS prefix when prev_hash is null", () => {
      const hash = computeAuditHash(null, "first-event");
      // Should be sha256("GENESIS:first-event")
      const expected = sha256("GENESIS:first-event");
      expect(hash).toBe(expected);
    });

    it("chains with previous hash when provided", () => {
      const prevHash = sha256("genesis-payload");
      const hash = computeAuditHash(prevHash, "second-event");
      const expected = sha256(`${prevHash}:second-event`);
      expect(hash).toBe(expected);
    });

    it("produces a valid 64-char hex hash", () => {
      const hash = computeAuditHash(null, "payload");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("supports multi-step chaining", () => {
      const h1 = computeAuditHash(null, "event-1");
      const h2 = computeAuditHash(h1, "event-2");
      const h3 = computeAuditHash(h2, "event-3");

      // Each hash should be unique
      const hashes = new Set([h1, h2, h3]);
      expect(hashes.size).toBe(3);

      // Verify chain integrity
      expect(h2).toBe(sha256(`${h1}:event-2`));
      expect(h3).toBe(sha256(`${h2}:event-3`));
    });

    it("is deterministic for same inputs", () => {
      const a = computeAuditHash("prev", "payload");
      const b = computeAuditHash("prev", "payload");
      expect(a).toBe(b);
    });

    it("changes when payload differs", () => {
      const a = computeAuditHash("prev", "payload-a");
      const b = computeAuditHash("prev", "payload-b");
      expect(a).not.toBe(b);
    });
  });

  // ── randomId ───────────────────────────────────────────────────────

  describe("randomId", () => {
    it("returns a non-empty base64url string by default", () => {
      const id = randomId();
      expect(id.length).toBeGreaterThan(0);
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("generates expected length for default 32 bytes", () => {
      // 32 bytes => 43 chars base64url (no padding)
      const id = randomId(32);
      expect(id.length).toBe(43);
    });

    it("generates expected length for custom byte count", () => {
      // 18 bytes => 24 chars base64url
      const id = randomId(18);
      expect(id.length).toBe(24);
    });

    it("generates unique values across multiple calls", () => {
      const ids = new Set(Array.from({ length: 50 }, () => randomId()));
      expect(ids.size).toBe(50);
    });

    it("generates unique values even with small byte count", () => {
      const ids = new Set(Array.from({ length: 20 }, () => randomId(8)));
      expect(ids.size).toBe(20);
    });

    it("respects different byte sizes", () => {
      const small = randomId(4);
      const large = randomId(64);
      expect(small.length).toBeLessThan(large.length);
    });
  });

  // ── nowEpoch ───────────────────────────────────────────────────────

  describe("nowEpoch", () => {
    it("returns a reasonable unix epoch (seconds since 1970)", () => {
      const epoch = nowEpoch();
      // Should be an integer
      expect(Number.isInteger(epoch)).toBe(true);
      // Should be in seconds, not milliseconds (less than 10^11)
      expect(epoch).toBeLessThan(1e11);
      // Should be greater than 2020-01-01 epoch
      expect(epoch).toBeGreaterThan(1577836800);
    });

    it("is within 2 seconds of Date.now()/1000", () => {
      const epoch = nowEpoch();
      const expected = Math.floor(Date.now() / 1000);
      expect(Math.abs(epoch - expected)).toBeLessThanOrEqual(2);
    });

    it("does not decrease on successive calls", () => {
      const a = nowEpoch();
      const b = nowEpoch();
      expect(b).toBeGreaterThanOrEqual(a);
    });
  });
});
