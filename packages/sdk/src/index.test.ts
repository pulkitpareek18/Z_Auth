import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZAuthClient } from "./index.js";

const MOCK_DISCOVERY = {
  issuer: "https://auth.example.com",
  authorization_endpoint: "https://auth.example.com/oauth2/authorize",
  token_endpoint: "https://auth.example.com/oauth2/token",
  userinfo_endpoint: "https://auth.example.com/oauth2/userinfo",
  jwks_uri: "https://auth.example.com/.well-known/jwks.json",
  revocation_endpoint: "https://auth.example.com/oauth2/revoke",
  scopes_supported: ["openid", "profile", "email", "zauth.identity"],
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
};

function makeClient(overrides?: Partial<ConstructorParameters<typeof ZAuthClient>[0]>) {
  return new ZAuthClient({
    issuer: "https://auth.example.com",
    clientId: "test-client",
    redirectUri: "https://myapp.com/callback",
    scopes: ["openid", "profile", "zauth.identity"],
    ...overrides,
  });
}

describe("ZAuthClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("creates client with required config", () => {
      const client = makeClient();
      expect(client).toBeInstanceOf(ZAuthClient);
    });

    it("defaults scopes to openid+profile when not specified", () => {
      const client = new ZAuthClient({
        issuer: "https://auth.example.com",
        clientId: "test",
        redirectUri: "https://app.com/cb",
      });
      expect(client).toBeInstanceOf(ZAuthClient);
    });
  });

  describe("discover", () => {
    it("fetches OIDC discovery document", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_DISCOVERY),
      }));
      const client = makeClient();
      const discovery = await client.discover();
      expect(discovery.issuer).toBe("https://auth.example.com");
      expect(discovery.authorization_endpoint).toContain("/oauth2/authorize");
      expect(discovery.token_endpoint).toContain("/oauth2/token");
    });

    it("caches discovery result", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_DISCOVERY),
      });
      vi.stubGlobal("fetch", fetchMock);
      const client = makeClient();
      await client.discover();
      await client.discover();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws on non-ok response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      const client = makeClient();
      await expect(client.discover()).rejects.toThrow("OIDC discovery failed: 500");
    });
  });

  describe("authorize", () => {
    it("returns URL with PKCE parameters", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_DISCOVERY),
      }));
      const client = makeClient();
      const result = await client.authorize();
      expect(result.url).toContain("response_type=code");
      expect(result.url).toContain("client_id=test-client");
      expect(result.url).toContain("code_challenge_method=S256");
      expect(result.url).toContain("code_challenge=");
      expect(result.state).toBeTruthy();
      expect(result.codeVerifier).toBeTruthy();
    });

    it("includes redirect_uri in URL", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_DISCOVERY),
      }));
      const client = makeClient();
      const result = await client.authorize();
      expect(result.url).toContain(encodeURIComponent("https://myapp.com/callback"));
    });

    it("generates unique state and verifier per call", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_DISCOVERY),
      }));
      const client = makeClient();
      const r1 = await client.authorize();
      const r2 = await client.authorize();
      expect(r1.state).not.toBe(r2.state);
      expect(r1.codeVerifier).not.toBe(r2.codeVerifier);
    });
  });

  describe("parseCallback", () => {
    it("extracts code and state from search params", () => {
      const client = makeClient();
      const result = client.parseCallback("?code=abc123&state=xyz789");
      expect(result.code).toBe("abc123");
      expect(result.state).toBe("xyz789");
    });

    it("accepts URLSearchParams object", () => {
      const client = makeClient();
      const params = new URLSearchParams({ code: "abc", state: "def" });
      const result = client.parseCallback(params);
      expect(result.code).toBe("abc");
      expect(result.state).toBe("def");
    });

    it("throws on authorization error", () => {
      const client = makeClient();
      expect(() =>
        client.parseCallback("?error=access_denied&error_description=User+denied")
      ).toThrow("Authorization error: User denied");
    });

    it("throws on missing code", () => {
      const client = makeClient();
      expect(() => client.parseCallback("?state=abc")).toThrow("Missing code or state");
    });

    it("throws on missing state", () => {
      const client = makeClient();
      expect(() => client.parseCallback("?code=abc")).toThrow("Missing code or state");
    });
  });

  describe("exchangeCode", () => {
    it("sends correct token exchange request", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_DISCOVERY) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            access_token: "at_123",
            token_type: "Bearer",
            expires_in: 3600,
            id_token: "idt_123",
          }),
        });
      vi.stubGlobal("fetch", fetchMock);
      const client = makeClient();
      const tokens = await client.exchangeCode("auth_code", "verifier_123");
      expect(tokens.access_token).toBe("at_123");
      expect(tokens.token_type).toBe("Bearer");
      expect(tokens.expires_in).toBe(3600);

      const tokenCall = fetchMock.mock.calls[1];
      expect(tokenCall[0]).toBe("https://auth.example.com/oauth2/token");
      expect(tokenCall[1].method).toBe("POST");
    });

    it("throws on failed token exchange", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_DISCOVERY) })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: "invalid_grant" }),
        });
      vi.stubGlobal("fetch", fetchMock);
      const client = makeClient();
      await expect(client.exchangeCode("bad_code", "v")).rejects.toThrow("Token exchange failed: invalid_grant");
    });
  });

  describe("getUserInfo", () => {
    it("fetches user info with bearer token", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_DISCOVERY) })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            sub: "user-123",
            preferred_username: "alice",
            uid: "uid-abc",
            did: "did-def",
          }),
        });
      vi.stubGlobal("fetch", fetchMock);
      const client = makeClient();
      const user = await client.getUserInfo("at_123");
      expect(user.sub).toBe("user-123");
      expect(user.preferred_username).toBe("alice");
      expect(user.uid).toBe("uid-abc");

      const infoCall = fetchMock.mock.calls[1];
      expect(infoCall[1].headers.Authorization).toBe("Bearer at_123");
    });

    it("throws on failed userinfo request", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_DISCOVERY) })
        .mockResolvedValueOnce({ ok: false, status: 401 });
      vi.stubGlobal("fetch", fetchMock);
      const client = makeClient();
      await expect(client.getUserInfo("bad_token")).rejects.toThrow("UserInfo request failed: 401");
    });
  });

  describe("revokeToken", () => {
    it("revokes a token successfully", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_DISCOVERY) })
        .mockResolvedValueOnce({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      const client = makeClient();
      await expect(client.revokeToken("at_123", "access_token")).resolves.toBeUndefined();

      const revokeCall = fetchMock.mock.calls[1];
      expect(revokeCall[0]).toBe("https://auth.example.com/oauth2/revoke");
    });

    it("throws when revocation endpoint is missing", async () => {
      const noRevoke = { ...MOCK_DISCOVERY, revocation_endpoint: undefined };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(noRevoke),
      }));
      const client = makeClient();
      await expect(client.revokeToken("tok")).rejects.toThrow("Revocation endpoint not available");
    });
  });
});
