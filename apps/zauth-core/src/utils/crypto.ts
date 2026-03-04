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

/** HMAC-SHA256 sign a payload string with a secret key. Returns hex digest. */
export function hmacSign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/** Verify an HMAC-SHA256 signature (timing-safe). */
export function hmacVerify(payload: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(hmacSign(payload, secret), "hex");
  const received = Buffer.from(signature, "hex");
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

export function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}
