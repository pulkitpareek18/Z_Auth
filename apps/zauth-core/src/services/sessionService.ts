import type { Response } from "express";
import { config } from "../config.js";
import type { AssuranceContext, SessionRecord } from "../types/models.js";
import { randomId } from "../utils/crypto.js";
import { getCache } from "./cacheService.js";

const SESSION_PREFIX = "session:";

const DEFAULT_ASSURANCE: AssuranceContext = {
  acr: "urn:zauth:aal1",
  amr: ["passkey"]
};

export async function createSession(
  subjectId: string,
  username: string,
  assurance?: AssuranceContext
): Promise<SessionRecord> {
  const now = Date.now();
  const session: SessionRecord = {
    sessionId: randomId(24),
    subjectId,
    username,
    assurance: assurance ?? DEFAULT_ASSURANCE,
    createdAt: now,
    expiresAt: now + config.sessionTtlSeconds * 1000
  };
  await getCache().set(SESSION_PREFIX + session.sessionId, JSON.stringify(session), config.sessionTtlSeconds);
  return session;
}

export async function getSession(sessionId: string | undefined): Promise<SessionRecord | null> {
  if (!sessionId) {
    return null;
  }
  const raw = await getCache().get(SESSION_PREFIX + sessionId);
  if (!raw) {
    return null;
  }
  const session = JSON.parse(raw) as SessionRecord;
  if (session.expiresAt < Date.now()) {
    await deleteSession(sessionId);
    return null;
  }
  if (!session.assurance) {
    session.assurance = DEFAULT_ASSURANCE;
  }
  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await getCache().del(SESSION_PREFIX + sessionId);
}

export async function updateSessionAssurance(
  sessionId: string,
  assurance: AssuranceContext
): Promise<SessionRecord | null> {
  const current = await getSession(sessionId);
  if (!current) {
    return null;
  }

  const merged: SessionRecord = {
    ...current,
    assurance: {
      ...current.assurance,
      ...assurance,
      amr: Array.from(
        new Set([
          ...(current.assurance?.amr ?? []),
          ...(assurance.amr ?? [])
        ])
      )
    }
  };
  await getCache().set(SESSION_PREFIX + sessionId, JSON.stringify(merged), config.sessionTtlSeconds);
  return merged;
}

export function setSessionCookie(response: Response, sessionId: string): void {
  response.cookie("zauth_sid", sessionId, {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: config.sessionTtlSeconds * 1000
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie("zauth_sid", {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: "lax",
    path: "/"
  });
}
