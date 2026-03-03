import { pool } from "../db/pool.js";
import type { OAuthClient } from "../types/models.js";
import { deriveCodeChallenge, nowEpoch, randomId } from "../utils/crypto.js";
import { signIdToken } from "./keyService.js";

const AUTH_CODE_TTL_SECONDS = 300;
const ACCESS_TOKEN_TTL_SECONDS = 3600;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 3600;

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const result = await pool.query<OAuthClient>(
    `SELECT client_id, client_secret, redirect_uris, scopes, grant_types, created_at::text
     FROM oauth_clients WHERE client_id = $1`,
    [clientId]
  );
  return result.rows[0] ?? null;
}

export function hasRedirectUri(client: OAuthClient, redirectUri: string): boolean {
  return client.redirect_uris.includes(redirectUri);
}

export async function createAuthorizationCode(params: {
  clientId: string;
  subjectId: string;
  redirectUri: string;
  scope: string;
  acr?: string;
  amr?: string[];
  uid?: string;
  did?: string;
  proofVerificationId?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  nonce?: string;
}): Promise<string> {
  const code = randomId(24);
  await pool.query(
    `INSERT INTO auth_codes (
       code,
       client_id,
       subject_id,
       redirect_uri,
       scope,
       acr,
       amr,
       uid,
       did,
       proof_verification_id,
       code_challenge,
       code_challenge_method,
       nonce,
       expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, NOW() + ($14 || ' seconds')::interval)`,
    [
      code,
      params.clientId,
      params.subjectId,
      params.redirectUri,
      params.scope,
      params.acr ?? null,
      JSON.stringify(params.amr ?? []),
      params.uid ?? null,
      params.did ?? null,
      params.proofVerificationId ?? null,
      params.codeChallenge ?? null,
      params.codeChallengeMethod ?? null,
      params.nonce ?? null,
      AUTH_CODE_TTL_SECONDS
    ]
  );
  return code;
}

export async function exchangeAuthorizationCode(params: {
  code: string;
  redirectUri: string;
  clientId: string;
  codeVerifier?: string;
}): Promise<
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      idToken: string;
      expiresIn: number;
      scope: string;
      subjectId: string;
    }
  | { ok: false; error: string }
> {
  const codeResult = await pool.query<{
    code: string;
    client_id: string;
    subject_id: string;
    redirect_uri: string;
      scope: string;
      acr: string | null;
      amr: string[] | null;
      uid: string | null;
      did: string | null;
      proof_verification_id: string | null;
      code_challenge: string | null;
      code_challenge_method: string | null;
      nonce: string | null;
      expires_at: string;
      used: boolean;
  }>(
    `SELECT code,
            client_id,
            subject_id,
            redirect_uri,
            scope,
            acr,
            amr,
            uid,
            did,
            proof_verification_id,
            code_challenge,
            code_challenge_method,
            nonce,
            expires_at::text,
            used
     FROM auth_codes
     WHERE code = $1`,
    [params.code]
  );

  const authCode = codeResult.rows[0];
  if (!authCode) {
    return { ok: false, error: "invalid_grant" };
  }

  if (authCode.used) {
    return { ok: false, error: "invalid_grant" };
  }

  if (authCode.client_id !== params.clientId || authCode.redirect_uri !== params.redirectUri) {
    return { ok: false, error: "invalid_grant" };
  }

  if (new Date(authCode.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "invalid_grant" };
  }

  if (authCode.code_challenge) {
    if (!params.codeVerifier) {
      return { ok: false, error: "invalid_request" };
    }
    if (authCode.code_challenge_method && authCode.code_challenge_method !== "S256") {
      return { ok: false, error: "invalid_request" };
    }
    const expected = deriveCodeChallenge(params.codeVerifier);
    if (expected !== authCode.code_challenge) {
      return { ok: false, error: "invalid_grant" };
    }
  }

  await pool.query(`UPDATE auth_codes SET used = TRUE WHERE code = $1`, [params.code]);

  const accessToken = randomId(32);
  const refreshToken = randomId(40);

  await pool.query(
    `INSERT INTO access_tokens (token, client_id, subject_id, scope, acr, amr, uid, did, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW() + ($9 || ' seconds')::interval)`,
    [
      accessToken,
      params.clientId,
      authCode.subject_id,
      authCode.scope,
      authCode.acr ?? null,
      JSON.stringify(authCode.amr ?? []),
      authCode.uid ?? null,
      authCode.did ?? null,
      ACCESS_TOKEN_TTL_SECONDS
    ]
  );

  await pool.query(
    `INSERT INTO refresh_tokens (token, previous_token, client_id, subject_id, expires_at)
     VALUES ($1, NULL, $2, $3, NOW() + ($4 || ' seconds')::interval)`,
    [refreshToken, params.clientId, authCode.subject_id, REFRESH_TOKEN_TTL_SECONDS]
  );

  const userResult = await pool.query<{ username: string; display_name: string }>(
    `SELECT username, display_name FROM users WHERE subject_id = $1`,
    [authCode.subject_id]
  );
  const user = userResult.rows[0];

  const idToken = await signIdToken(
    authCode.subject_id,
    params.clientId,
    {
      nonce: authCode.nonce,
      name: user?.display_name,
      preferred_username: user?.username,
      auth_time: nowEpoch(),
      acr: authCode.acr ?? "urn:zauth:aal1",
      amr: authCode.amr ?? ["passkey"],
      uid: authCode.uid ?? undefined,
      did: authCode.did ?? undefined
    },
    ACCESS_TOKEN_TTL_SECONDS
  );

  return {
    ok: true,
    accessToken,
    refreshToken,
    idToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    scope: authCode.scope,
    subjectId: authCode.subject_id
  };
}

export async function getTokenSubject(accessToken: string): Promise<
  | {
      subjectId: string;
      scope: string;
      acr: string;
      amr: string[];
      uid?: string;
      did?: string;
    }
  | null
> {
  const result = await pool.query<{
    subject_id: string;
    scope: string;
    acr: string | null;
    amr: string[] | null;
    uid: string | null;
    did: string | null;
  }>(
    `SELECT subject_id, scope, acr, amr, uid, did
     FROM access_tokens
     WHERE token = $1
       AND revoked = FALSE
       AND expires_at > NOW()`,
    [accessToken]
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    subjectId: row.subject_id,
    scope: row.scope,
    acr: row.acr ?? "urn:zauth:aal1",
    amr: row.amr ?? ["passkey"],
    uid: row.uid ?? undefined,
    did: row.did ?? undefined
  };
}

export async function revokeAccessToken(accessToken: string): Promise<void> {
  await pool.query(`UPDATE access_tokens SET revoked = TRUE WHERE token = $1`, [accessToken]);
}

export async function upsertConsent(subjectId: string, clientId: string, scopes: string[]): Promise<void> {
  const queries = scopes.map((scope) =>
    pool.query(
      `INSERT INTO consents (subject_id, client_id, scope)
       VALUES ($1, $2, $3)
       ON CONFLICT (subject_id, client_id, scope) DO NOTHING`,
      [subjectId, clientId, scope]
    )
  );
  await Promise.all(queries);
}

export async function hasConsent(subjectId: string, clientId: string, scopes: string[]): Promise<boolean> {
  if (scopes.length === 0) {
    return true;
  }

  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)
     FROM consents
     WHERE subject_id = $1
       AND client_id = $2
       AND scope = ANY($3::text[])`,
    [subjectId, clientId, scopes]
  );

  return Number(result.rows[0]?.count ?? "0") >= scopes.length;
}

export async function createClient(payload: {
  clientId: string;
  clientSecret: string | null;
  redirectUris: string[];
  scopes: string[];
  grantTypes: string[];
}): Promise<OAuthClient> {
  const result = await pool.query<OAuthClient>(
    `INSERT INTO oauth_clients (client_id, client_secret, redirect_uris, scopes, grant_types)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb)
     RETURNING client_id, client_secret, redirect_uris, scopes, grant_types, created_at::text`,
    [
      payload.clientId,
      payload.clientSecret,
      JSON.stringify(payload.redirectUris),
      JSON.stringify(payload.scopes),
      JSON.stringify(payload.grantTypes)
    ]
  );
  return result.rows[0];
}
