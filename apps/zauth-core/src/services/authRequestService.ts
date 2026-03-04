import type { AuthRequest } from "../types/models.js";
import { config } from "../config.js";
import { randomId } from "../utils/crypto.js";
import { logger } from "../utils/logger.js";
import { getCache, getCacheType } from "./cacheService.js";

const AUTH_REQ_PREFIX = "authreq:";

export async function createAuthRequest(
  input: Omit<AuthRequest, "requestId" | "createdAt">
): Promise<AuthRequest> {
  const request: AuthRequest = {
    ...input,
    requestId: randomId(18),
    createdAt: Date.now()
  };
  await getCache().set(AUTH_REQ_PREFIX + request.requestId, JSON.stringify(request), config.authRequestTtlSeconds);
  logger.info("authRequest created", { requestId: request.requestId, clientId: request.clientId, ttl: config.authRequestTtlSeconds, cache: getCacheType() });
  return request;
}

export async function getAuthRequest(requestId: string): Promise<AuthRequest | null> {
  const raw = await getCache().get(AUTH_REQ_PREFIX + requestId);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as AuthRequest;
}

export async function deleteAuthRequest(requestId: string): Promise<void> {
  await getCache().del(AUTH_REQ_PREFIX + requestId);
}

export async function isAuthRequestValid(requestId: string): Promise<boolean> {
  const normalized = requestId.trim();
  if (!normalized) {
    return false;
  }
  const request = await getAuthRequest(normalized);
  return Boolean(request);
}

/**
 * Extend the TTL of an existing auth request (e.g., after handoff approval).
 * This prevents the auth request from expiring between mobile approval and
 * consent submission on desktop.
 */
export async function extendAuthRequest(requestId: string, extraSeconds?: number): Promise<void> {
  const request = await getAuthRequest(requestId);
  if (!request) {
    logger.warn("extendAuthRequest: request not found, cannot extend", { requestId });
    return;
  }
  const ttl = extraSeconds ?? config.authRequestTtlSeconds;
  await getCache().set(AUTH_REQ_PREFIX + requestId, JSON.stringify(request), ttl);
  logger.info("extendAuthRequest: TTL refreshed", { requestId, ttl });
}
