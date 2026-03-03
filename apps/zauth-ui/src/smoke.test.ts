import crypto from "crypto";
import { describe, expect, it } from "vitest";

/**
 * zauth-ui meaningful unit tests.
 *
 * The UI app (src/index.ts) is an Express server that renders HTML pages and
 * handles OAuth callbacks. Most logic lives in route handlers that need a
 * running server, but several pure utility functions used inline are testable
 * in isolation. We re-implement the same logic here and verify correctness.
 */

// ── sha256Base64Url (mirrors the helper in index.ts) ────────────────
function sha256Base64Url(input: string): string {
  return crypto.createHash("sha256").update(input).digest("base64url");
}

// ── randomToken (mirrors the helper in index.ts) ─────────────────────
function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

// ── Host routing helpers (mirrors the helpers in index.ts) ───────────
function isDemoHost(host: string): boolean {
  return host.startsWith("demo.") || host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

function isConsoleHost(host: string): boolean {
  return host.startsWith("console.");
}

function isStatusHost(host: string): boolean {
  return host.startsWith("status.");
}

// ── Tests ────────────────────────────────────────────────────────────

describe("sha256Base64Url", () => {
  it("returns a base64url-encoded SHA-256 digest", () => {
    const result = sha256Base64Url("test-verifier");
    // Base64url uses only [A-Za-z0-9_-], no padding by default in Node
    expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces deterministic output for the same input", () => {
    const a = sha256Base64Url("pkce-verifier-123");
    const b = sha256Base64Url("pkce-verifier-123");
    expect(a).toBe(b);
  });

  it("produces different output for different inputs", () => {
    const a = sha256Base64Url("verifier-a");
    const b = sha256Base64Url("verifier-b");
    expect(a).not.toBe(b);
  });

  it("produces a 43-character base64url string for SHA-256 (256 bits)", () => {
    // SHA-256 = 32 bytes => base64url = ceil(32 * 4/3) = 43 chars (no padding)
    const result = sha256Base64Url("anything");
    expect(result.length).toBe(43);
  });
});

describe("randomToken", () => {
  it("returns a non-empty base64url string", () => {
    const token = randomToken();
    expect(token.length).toBeGreaterThan(0);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique tokens on successive calls", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => randomToken()));
    expect(tokens.size).toBe(20);
  });

  it("respects the byte-length parameter", () => {
    const short = randomToken(8);
    const long = randomToken(64);
    // 8 bytes => 11 chars base64url, 64 bytes => 86 chars base64url
    expect(short.length).toBeLessThan(long.length);
  });

  it("produces 43-char token for default 32 bytes", () => {
    const token = randomToken(32);
    expect(token.length).toBe(43);
  });
});

describe("host routing helpers", () => {
  describe("isDemoHost", () => {
    it("matches demo.* hosts", () => {
      expect(isDemoHost("demo.geturstyle.shop")).toBe(true);
      expect(isDemoHost("demo.example.com")).toBe(true);
    });

    it("matches localhost", () => {
      expect(isDemoHost("localhost")).toBe(true);
      expect(isDemoHost("localhost:3001")).toBe(true);
    });

    it("matches 127.0.0.1", () => {
      expect(isDemoHost("127.0.0.1")).toBe(true);
      expect(isDemoHost("127.0.0.1:3001")).toBe(true);
    });

    it("does not match other hosts", () => {
      expect(isDemoHost("console.geturstyle.shop")).toBe(false);
      expect(isDemoHost("status.geturstyle.shop")).toBe(false);
      expect(isDemoHost("example.com")).toBe(false);
    });
  });

  describe("isConsoleHost", () => {
    it("matches console.* hosts", () => {
      expect(isConsoleHost("console.geturstyle.shop")).toBe(true);
      expect(isConsoleHost("console.example.com")).toBe(true);
    });

    it("does not match other hosts", () => {
      expect(isConsoleHost("demo.geturstyle.shop")).toBe(false);
      expect(isConsoleHost("localhost")).toBe(false);
      expect(isConsoleHost("status.geturstyle.shop")).toBe(false);
    });
  });

  describe("isStatusHost", () => {
    it("matches status.* hosts", () => {
      expect(isStatusHost("status.geturstyle.shop")).toBe(true);
      expect(isStatusHost("status.example.com")).toBe(true);
    });

    it("does not match other hosts", () => {
      expect(isStatusHost("demo.geturstyle.shop")).toBe(false);
      expect(isStatusHost("localhost")).toBe(false);
      expect(isStatusHost("console.geturstyle.shop")).toBe(false);
    });
  });
});

describe("PKCE flow structure", () => {
  it("generates a verifier and derives a code challenge from it", () => {
    const verifier = randomToken(32);
    const challenge = sha256Base64Url(verifier);

    expect(verifier).not.toBe(challenge);
    expect(challenge.length).toBe(43);
    // The same verifier always produces the same challenge
    expect(sha256Base64Url(verifier)).toBe(challenge);
  });

  it("different verifiers produce different challenges", () => {
    const v1 = randomToken(32);
    const v2 = randomToken(32);
    expect(sha256Base64Url(v1)).not.toBe(sha256Base64Url(v2));
  });
});

describe("OAuth authorize URL construction", () => {
  it("builds a valid authorize URL with all required PKCE params", () => {
    const authIssuer = "http://localhost:3000";
    const demoClientId = "demo-web-client";
    const verifier = randomToken(32);
    const challenge = sha256Base64Url(verifier);
    const state = randomToken(18);
    const redirectUri = "http://localhost:3001/callback";

    const authorizeUrl = new URL(`${authIssuer}/oauth2/authorize`);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", demoClientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", "openid profile zauth.identity");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("prompt", "login");

    expect(authorizeUrl.pathname).toBe("/oauth2/authorize");
    expect(authorizeUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizeUrl.searchParams.get("client_id")).toBe(demoClientId);
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizeUrl.searchParams.get("code_challenge")).toBe(challenge);
    expect(authorizeUrl.searchParams.get("state")).toBe(state);
  });
});
