import crypto from "crypto";

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomId(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function deriveCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function computeAuditHash(prevHash: string | null, payload: string): string {
  return sha256(`${prevHash ?? "GENESIS"}:${payload}`);
}

export function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}
