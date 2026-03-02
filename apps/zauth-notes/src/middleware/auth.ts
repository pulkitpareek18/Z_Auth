import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { getUserById } from "../services/userService.js";
import { createCsrfToken, getSession, readSessionCookie, validateCsrfToken } from "../services/sessionService.js";
import { acrRank } from "../utils/assurance.js";
import { sendApiError } from "../utils/http.js";

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const sid = readSessionCookie(req.cookies as Record<string, unknown>);
  const session = await getSession(sid);

  if (!session) {
    next();
    return;
  }

  const user = await getUserById(session.user_id);
  if (!user) {
    next();
    return;
  }

  req.notesSession = session;
  req.notesUser = user;
  req.assurance = {
    acr: session.acr ?? "urn:zauth:aal1",
    amr: session.amr ?? ["passkey"],
    uid: session.uid ?? undefined,
    did: session.did ?? undefined
  };

  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  await optionalAuth(req, res, () => undefined);

  if (!req.notesUser || !req.notesSession || !req.assurance) {
    sendApiError(res, 401, "unauthorized", "Authentication required.");
    return;
  }

  if (acrRank(req.assurance.acr) < acrRank(config.notesRequiredAcr)) {
    sendApiError(res, 403, "assurance_too_low", "Higher assurance login required.", {
      required_acr: config.notesRequiredAcr,
      current_acr: req.assurance.acr
    });
    return;
  }

  next();
}

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (!req.notesSession) {
    sendApiError(res, 401, "unauthorized", "Authentication required.");
    return;
  }

  const token = req.header("x-csrf-token") ?? undefined;
  if (!validateCsrfToken(req.notesSession, token)) {
    sendApiError(res, 403, "csrf_invalid", "Invalid CSRF token.");
    return;
  }

  next();
}

export function csrfTokenForRequest(req: Request): string | null {
  if (!req.notesSession) {
    return null;
  }
  return createCsrfToken(req.notesSession);
}
