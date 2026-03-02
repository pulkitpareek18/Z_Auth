import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { config } from "../config.js";
import { randomId } from "../utils/crypto.js";

type SigningContext = {
  kid: string;
  publicJwk: JWK;
  signJwt: (subject: string, audience: string, claims: Record<string, unknown>, expiresInSeconds: number) => Promise<string>;
};

let signingContext: SigningContext | null = null;

export async function initializeKeyService(): Promise<void> {
  if (signingContext) {
    return;
  }

  const { publicKey, privateKey } = await generateKeyPair("RS256", { modulusLength: 2048 });
  const publicJwk = await exportJWK(publicKey);
  const kid = randomId(16);

  signingContext = {
    kid,
    publicJwk: {
      ...publicJwk,
      use: "sig",
      alg: "RS256",
      kid,
      key_ops: ["verify"]
    },
    signJwt: async (subject, audience, claims, expiresInSeconds) => {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid })
        .setIssuedAt(now)
        .setIssuer(config.issuer)
        .setAudience(audience)
        .setSubject(subject)
        .setExpirationTime(now + expiresInSeconds)
        .sign(privateKey);
    }
  };
}

export function getJwks(): { keys: JWK[] } {
  if (!signingContext) {
    throw new Error("Signing keys are not initialized");
  }
  return { keys: [signingContext.publicJwk] };
}

export async function signIdToken(
  subject: string,
  clientId: string,
  claims: Record<string, unknown>,
  expiresInSeconds = 3600
): Promise<string> {
  if (!signingContext) {
    throw new Error("Signing keys are not initialized");
  }
  return signingContext.signJwt(subject, clientId, claims, expiresInSeconds);
}

export async function signAttestationJwt(
  subject: string,
  claims: Record<string, unknown>,
  expiresInSeconds = 900
): Promise<string> {
  if (!signingContext) {
    throw new Error("Signing keys are not initialized");
  }
  return signingContext.signJwt(subject, config.issuer, claims, expiresInSeconds);
}
