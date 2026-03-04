import { getCache } from "./cacheService.js";
import { randomId } from "../utils/crypto.js";
import type { AssuranceContext } from "../types/models.js";

const HANDOFF_PREFIX = "handoff:";
const HANDOFF_CODE_PREFIX = "handoff_code:";
const HANDOFF_TTL_SECONDS = 600;

function generateApprovalCode(): string {
  let candidate = "";
  while (candidate.length < 6) {
    candidate += randomId(6).replace(/[^a-zA-Z0-9]/g, "");
  }
  return candidate.slice(0, 6).toUpperCase();
}

export type HandoffRecord = {
  handoffId: string;
  code: string;
  requestId?: string;
  loginHint?: string;
  mode?: "signin" | "signup";
  status: "pending" | "approved" | "consumed" | "denied";
  approvedBySubjectId?: string;
  approvedByUsername?: string;
  assurance?: AssuranceContext;
  createdAt: number;
  expiresAt: number;
};

function keyById(handoffId: string): string {
  return HANDOFF_PREFIX + handoffId;
}

function keyByCode(code: string): string {
  return HANDOFF_CODE_PREFIX + code;
}

async function save(record: HandoffRecord): Promise<void> {
  const ttl = Math.max(1, Math.floor((record.expiresAt - Date.now()) / 1000));
  await getCache().set(keyById(record.handoffId), JSON.stringify(record), ttl);
  await getCache().set(keyByCode(record.code), record.handoffId, ttl);
}

function normalizeLoginHint(loginHint?: string): string | undefined {
  const normalized = loginHint?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function normalizeMode(mode?: string): "signin" | "signup" {
  return mode === "signup" ? "signup" : "signin";
}

export async function startHandoff(requestId?: string, loginHint?: string, mode?: string): Promise<HandoffRecord> {
  const handoffId = randomId(18);
  const code = generateApprovalCode();
  const now = Date.now();
  const normalizedHint = normalizeLoginHint(loginHint);

  const record: HandoffRecord = {
    handoffId,
    code,
    requestId,
    loginHint: normalizedHint,
    mode: normalizeMode(mode),
    status: "pending",
    createdAt: now,
    expiresAt: now + HANDOFF_TTL_SECONDS * 1000
  };

  await save(record);
  return record;
}

export async function getHandoffById(handoffId: string): Promise<HandoffRecord | null> {
  const raw = await getCache().get(keyById(handoffId));
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as HandoffRecord;
}

export async function getHandoffByCode(code: string): Promise<HandoffRecord | null> {
  const handoffId = await getCache().get(keyByCode(code));
  if (!handoffId) {
    return null;
  }
  return getHandoffById(handoffId);
}

export async function approveHandoffByCode(
  code: string,
  approvedBySubjectId: string,
  approvedByUsername: string,
  assurance?: AssuranceContext
): Promise<HandoffRecord | null> {
  const handoffId = await getCache().get(keyByCode(code));
  if (!handoffId) {
    return null;
  }

  const record = await getHandoffById(handoffId);
  if (!record) {
    return null;
  }

  if (record.expiresAt < Date.now() || record.status !== "pending") {
    return null;
  }

  const approved: HandoffRecord = {
    ...record,
    status: "approved",
    approvedBySubjectId,
    approvedByUsername,
    assurance
  };
  await save(approved);
  return approved;
}

export async function denyHandoffByCode(code: string): Promise<HandoffRecord | null> {
  const handoffId = await getCache().get(keyByCode(code));
  if (!handoffId) {
    return null;
  }

  const record = await getHandoffById(handoffId);
  if (!record) {
    return null;
  }

  if (record.expiresAt < Date.now() || record.status !== "pending") {
    return null;
  }

  const denied: HandoffRecord = {
    ...record,
    status: "denied"
  };
  await save(denied);
  return denied;
}

export async function consumeApprovedHandoff(handoffId: string): Promise<HandoffRecord | null> {
  const record = await getHandoffById(handoffId);
  if (!record) {
    return null;
  }

  if (record.expiresAt < Date.now() || record.status !== "approved") {
    return null;
  }

  const consumed: HandoffRecord = {
    ...record,
    status: "consumed"
  };

  await save(consumed);
  return consumed;
}
