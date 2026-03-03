import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { config } from "../config.js";
import { getAuthRequest, createAuthRequest, deleteAuthRequest } from "../services/authRequestService.js";
import { writeAuditEvent } from "../services/auditService.js";
import {
  createAuthorizationCode,
  exchangeAuthorizationCode,
  getClient,
  getTokenSubject,
  hasConsent,
  hasRedirectUri,
  revokeAccessToken,
  upsertConsent
} from "../services/oauthService.js";
import { getJwks } from "../services/keyService.js";
import { findIdentityForSubject } from "../services/pramaanV2Service.js";
import { clearSessionCookie, deleteSession, getSession } from "../services/sessionService.js";
import { findUserBySubject } from "../services/userService.js";

export const oidcRouter = Router();

oidcRouter.get("/.well-known/openid-configuration", (_req, res) => {
  res.status(200).json({
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/oauth2/authorize`,
    token_endpoint: `${config.issuer}/oauth2/token`,
    userinfo_endpoint: `${config.issuer}/oauth2/userinfo`,
    revocation_endpoint: `${config.issuer}/oauth2/revoke`,
    jwks_uri: `${config.issuer}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["openid", "profile", "email", "zauth.identity"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    acr_values_supported: ["urn:zauth:aal1", "urn:zauth:aal2:zk"],
    claims_supported: ["sub", "preferred_username", "name", "uid", "did", "acr", "amr"]
  });
});

oidcRouter.get("/.well-known/jwks.json", (_req, res) => {
  res.status(200).json(getJwks());
});

function redirectWithError(redirectUri: string, error: string, state?: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state) {
    url.searchParams.set("state", state);
  }
  return url.toString();
}

async function handleAuthorize(req: Request, res: Response): Promise<void> {
  const params = {
    response_type: String(req.query.response_type ?? req.body?.response_type ?? ""),
    client_id: String(req.query.client_id ?? req.body?.client_id ?? ""),
    redirect_uri: String(req.query.redirect_uri ?? req.body?.redirect_uri ?? ""),
    scope: String(req.query.scope ?? req.body?.scope ?? "openid"),
    state: req.query.state ? String(req.query.state) : req.body?.state ? String(req.body.state) : undefined,
    code_challenge: req.query.code_challenge ? String(req.query.code_challenge) : req.body?.code_challenge ? String(req.body.code_challenge) : undefined,
    code_challenge_method: req.query.code_challenge_method
      ? String(req.query.code_challenge_method)
      : req.body?.code_challenge_method
      ? String(req.body.code_challenge_method)
      : undefined,
    login_hint: req.query.login_hint ? String(req.query.login_hint) : req.body?.login_hint ? String(req.body.login_hint) : undefined,
    nonce: req.query.nonce ? String(req.query.nonce) : req.body?.nonce ? String(req.body.nonce) : undefined,
    prompt: req.query.prompt ? String(req.query.prompt) : req.body?.prompt ? String(req.body.prompt) : undefined
  };

  if (params.response_type !== "code" || !params.client_id || !params.redirect_uri) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const client = await getClient(params.client_id);
  if (!client || !hasRedirectUri(client, params.redirect_uri)) {
    res.status(400).json({ error: "invalid_client_or_redirect_uri" });
    return;
  }

  const sid = req.cookies.zauth_sid as string | undefined;
  const promptValues = (params.prompt ?? "").split(/\s+/).filter(Boolean);
  const promptSet = new Set(promptValues);
  const forceLogin = promptSet.has("login") || config.authDisableSso;
  const silentOnly = promptSet.has("none");
  if (silentOnly && promptSet.size > 1) {
    res.redirect(redirectWithError(params.redirect_uri, "invalid_request", params.state));
    return;
  }

  if (forceLogin && sid) {
    await deleteSession(sid);
    clearSessionCookie(res);
  }

  const session = forceLogin ? null : await getSession(sid);

  if (!session) {
    if (silentOnly) {
      res.redirect(redirectWithError(params.redirect_uri, "login_required", params.state));
      return;
    }

    const authRequest = await createAuthRequest({
      responseType: params.response_type,
      clientId: params.client_id,
      redirectUri: params.redirect_uri,
      scope: params.scope,
      state: params.state,
      codeChallenge: params.code_challenge,
      codeChallengeMethod: params.code_challenge_method,
      nonce: params.nonce
    });

    const loginUrl = new URL(`/ui/login?request_id=${encodeURIComponent(authRequest.requestId)}`, config.issuer);
    if (params.login_hint) {
      loginUrl.searchParams.set("login_hint", params.login_hint);
    }
    res.redirect(loginUrl.pathname + loginUrl.search);
    return;
  }

  const scopes = params.scope.split(/\s+/).filter(Boolean);
  const consented = await hasConsent(session.subjectId, params.client_id, scopes);

  if (!consented) {
    const authRequest = await createAuthRequest({
      responseType: params.response_type,
      clientId: params.client_id,
      redirectUri: params.redirect_uri,
      scope: params.scope,
      state: params.state,
      codeChallenge: params.code_challenge,
      codeChallengeMethod: params.code_challenge_method,
      nonce: params.nonce
    });

    res.redirect(`/ui/consent?request_id=${encodeURIComponent(authRequest.requestId)}`);
    return;
  }

  const code = await createAuthorizationCode({
    clientId: params.client_id,
    subjectId: session.subjectId,
    redirectUri: params.redirect_uri,
    scope: params.scope,
    acr: session.assurance?.acr,
    amr: session.assurance?.amr,
    uid: session.assurance?.uid,
    did: session.assurance?.did,
    proofVerificationId: session.assurance?.proofVerificationId,
    codeChallenge: params.code_challenge,
    codeChallengeMethod: params.code_challenge_method,
    nonce: params.nonce
  });

  await writeAuditEvent({
    tenantId: "default",
    actor: session.username,
    action: "oauth.authorize",
    outcome: "success",
    traceId: req.traceId,
    payload: {
      client_id: params.client_id,
      scope: params.scope
    }
  });

  const redirectUrl = new URL(params.redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (params.state) {
    redirectUrl.searchParams.set("state", params.state);
  }

  if (sid) {
    await deleteSession(sid);
    clearSessionCookie(res);
  }
  res.redirect(redirectUrl.toString());
}

oidcRouter.get("/oauth2/authorize", async (req, res) => {
  await handleAuthorize(req, res);
});

oidcRouter.post("/oauth2/authorize", async (req, res) => {
  await handleAuthorize(req, res);
});

oidcRouter.post("/oauth2/consent", async (req, res) => {
  const requestId = String(req.body.request_id ?? "");
  const decision = String(req.body.decision ?? "deny");

  if (!requestId) {
    res.status(400).send("Missing request_id");
    return;
  }

  const authRequest = await getAuthRequest(requestId);
  if (!authRequest) {
    res.status(400).send("Authorization request expired");
    return;
  }

  const sid = req.cookies.zauth_sid as string | undefined;
  const session = await getSession(sid);
  if (!session) {
    res.redirect(`/ui/login?request_id=${encodeURIComponent(requestId)}`);
    return;
  }

  if (decision !== "allow") {
    await deleteAuthRequest(requestId);
    if (sid) {
      await deleteSession(sid);
      clearSessionCookie(res);
    }
    res.redirect(redirectWithError(authRequest.redirectUri, "access_denied", authRequest.state));
    return;
  }

  const scopes = authRequest.scope.split(/\s+/).filter(Boolean);
  await upsertConsent(session.subjectId, authRequest.clientId, scopes);

  const code = await createAuthorizationCode({
    clientId: authRequest.clientId,
    subjectId: session.subjectId,
    redirectUri: authRequest.redirectUri,
    scope: authRequest.scope,
    acr: session.assurance?.acr,
    amr: session.assurance?.amr,
    uid: session.assurance?.uid,
    did: session.assurance?.did,
    proofVerificationId: session.assurance?.proofVerificationId,
    codeChallenge: authRequest.codeChallenge,
    codeChallengeMethod: authRequest.codeChallengeMethod,
    nonce: authRequest.nonce
  });

  await deleteAuthRequest(requestId);

  const redirectUrl = new URL(authRequest.redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (authRequest.state) {
    redirectUrl.searchParams.set("state", authRequest.state);
  }

  await writeAuditEvent({
    tenantId: "default",
    actor: session.username,
    action: "oauth.consent",
    outcome: "success",
    traceId: req.traceId,
    payload: {
      client_id: authRequest.clientId,
      scopes
    }
  });

  if (sid) {
    await deleteSession(sid);
    clearSessionCookie(res);
  }
  res.redirect(redirectUrl.toString());
});

oidcRouter.post("/oauth2/token", async (req, res) => {
  const grantType = String(req.body.grant_type ?? "");
  const code = String(req.body.code ?? "");
  const redirectUri = String(req.body.redirect_uri ?? "");
  const codeVerifier = req.body.code_verifier ? String(req.body.code_verifier) : undefined;

  const authHeader = req.header("authorization");
  let clientId = req.body.client_id ? String(req.body.client_id) : "";
  let clientSecret = req.body.client_secret ? String(req.body.client_secret) : "";

  if (authHeader && authHeader.startsWith("Basic ")) {
    const [id, secret] = Buffer.from(authHeader.slice("Basic ".length), "base64").toString("utf8").split(":");
    clientId = id;
    clientSecret = secret;
  }

  if (grantType !== "authorization_code" || !clientId || !code || !redirectUri) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const client = await getClient(clientId);
  if (!client) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }

  if (client.client_secret) {
    const expected = Buffer.from(client.client_secret);
    const received = Buffer.from(clientSecret || "");
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
      res.status(401).json({ error: "invalid_client" });
      return;
    }
  }

  const exchange = await exchangeAuthorizationCode({
    code,
    redirectUri,
    clientId,
    codeVerifier
  });

  if (!exchange.ok) {
    res.status(400).json({ error: exchange.error });
    return;
  }

  await writeAuditEvent({
    tenantId: "default",
    actor: exchange.subjectId,
    action: "oauth.token",
    outcome: "success",
    traceId: req.traceId,
    payload: { client_id: clientId }
  });

  res.status(200).json({
    token_type: "Bearer",
    access_token: exchange.accessToken,
    refresh_token: exchange.refreshToken,
    id_token: exchange.idToken,
    expires_in: exchange.expiresIn,
    scope: exchange.scope
  });
});

oidcRouter.post("/oauth2/revoke", async (req, res) => {
  const token = String(req.body.token ?? "");
  if (!token) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  await revokeAccessToken(token);
  res.status(200).send("");
});

oidcRouter.get("/oauth2/userinfo", async (req, res) => {
  const authHeader = req.header("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  const token = authHeader.slice("Bearer ".length);
  const subject = await getTokenSubject(token);
  if (!subject) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  const user = await findUserBySubject(subject.subjectId);
  if (!user) {
    res.status(404).json({ error: "user_not_found" });
    return;
  }

  const identity = subject.uid ? { uid: subject.uid, did: subject.did } : await findIdentityForSubject(subject.subjectId);

  res.status(200).json({
    sub: user.subject_id,
    preferred_username: user.username,
    name: user.display_name,
    uid: identity?.uid ?? undefined,
    did: identity?.did ?? undefined,
    acr: subject.acr,
    amr: subject.amr
  });
});
