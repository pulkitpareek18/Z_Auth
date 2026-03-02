import type { Response } from "express";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import type { Assurance, NotesSession, NotesUser } from "../types/models.js";
import { sha256Hex } from "../utils/security.js";
import { randomToken } from "../utils/security.js";

const SESSION_COOKIE = "notes_sid";
const OAUTH_STATE_COOKIE = "notes_oauth_state";
const PKCE_COOKIE = "notes_pkce_verifier";

export async function createSession(user: NotesUser, assurance: Assurance): Promise<string> {
  const sessionId = randomToken(24);
  await pool.query(
    `INSERT INTO notes_sessions (session_id, user_id, subject_id, acr, amr, uid, did, expires_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW() + ($8 || ' seconds')::interval)`,
    [
      sessionId,
      user.id,
      user.subject_id,
      assurance.acr,
      JSON.stringify(assurance.amr ?? []),
      assurance.uid ?? null,
      assurance.did ?? null,
      config.sessionTtlSeconds
    ]
  );
  return sessionId;
}

export async function getSession(sessionId: string | undefined): Promise<NotesSession | null> {
  if (!sessionId) {
    return null;
  }

  const result = await pool.query<NotesSession>(
    `SELECT session_id, user_id::int, subject_id, acr, amr, uid, did, expires_at::text
     FROM notes_sessions
     WHERE session_id = $1 AND expires_at > NOW()`,
    [sessionId]
  );

  return result.rows[0] ?? null;
}

export async function deleteSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) {
    return;
  }
  await pool.query(`DELETE FROM notes_sessions WHERE session_id = $1`, [sessionId]);
}

export function issueSessionCookie(res: Response, sessionId: string): void {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: config.sessionTtlSeconds * 1000
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: "lax",
    path: "/"
  });
}

export function issueOauthCookies(res: Response, state: string, verifier: string): void {
  const cookieOptions = {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60 * 1000
  };

  res.cookie(OAUTH_STATE_COOKIE, state, cookieOptions);
  res.cookie(PKCE_COOKIE, verifier, cookieOptions);
}

export function clearOauthCookies(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
  res.clearCookie(PKCE_COOKIE, { path: "/" });
}

export function readSessionCookie(cookies: Record<string, unknown>): string | undefined {
  const value = cookies[SESSION_COOKIE];
  return typeof value === "string" ? value : undefined;
}

export function readOauthStateCookie(cookies: Record<string, unknown>): string | undefined {
  const value = cookies[OAUTH_STATE_COOKIE];
  return typeof value === "string" ? value : undefined;
}

export function readPkceCookie(cookies: Record<string, unknown>): string | undefined {
  const value = cookies[PKCE_COOKIE];
  return typeof value === "string" ? value : undefined;
}

export function createCsrfToken(session: NotesSession): string {
  return sha256Hex(`${config.csrfSecret}:${session.session_id}:${session.subject_id}`);
}

export function validateCsrfToken(session: NotesSession, token: string | undefined): boolean {
  if (!token) {
    return false;
  }
  return createCsrfToken(session) === token;
}
