import { describe, expect, it } from "vitest";
import { deriveCodeChallenge, sha256 } from "../src/utils/crypto.js";

describe("crypto utilities", () => {
  it("hashes consistently", () => {
    expect(sha256("zauth")).toBe(sha256("zauth"));
    expect(sha256("zauth")).not.toBe(sha256("different"));
  });

  it("creates deterministic code challenge", () => {
    const verifier = "test-verifier";
    const challenge = deriveCodeChallenge(verifier);
    expect(challenge.length).toBeGreaterThan(20);
    expect(challenge).toBe(deriveCodeChallenge(verifier));
  });
});
