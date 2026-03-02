import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import { config } from "../config.js";
import { getCache } from "./cacheService.js";
import {
  createUser,
  findUserByUsername,
  getCredentialById,
  listCredentialsForUser,
  updateCredentialCounter,
  upsertCredential
} from "./userService.js";

const REG_PREFIX = "webauthn:reg:";
const AUTH_PREFIX = "webauthn:auth:";
const CHALLENGE_TTL = 300;

export async function beginPasskeyRegistration(username: string, displayName?: string): Promise<unknown> {
  const normalized = username.trim().toLowerCase();
  const user = await createUser(normalized, displayName?.trim() || normalized);
  const existing = await listCredentialsForUser(user.subject_id);

  const options = await generateRegistrationOptions({
    rpName: "Z_Auth",
    rpID: config.rpId,
    userName: user.username,
    userDisplayName: user.display_name,
    userID: Buffer.from(user.subject_id, "utf8"),
    timeout: 60_000,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred"
    },
    supportedAlgorithmIDs: [-7, -257],
    excludeCredentials: existing.map((credential) => ({
      id: credential.credential_id,
      transports: (credential.transports ?? []) as any
    }))
  });

  await getCache().set(
    REG_PREFIX + normalized,
    JSON.stringify({ challenge: options.challenge, username: normalized }),
    CHALLENGE_TTL
  );

  return options;
}

export async function finishPasskeyRegistration(username: string, response: unknown): Promise<{ verified: boolean }> {
  const normalized = username.trim().toLowerCase();
  const challengeRaw = await getCache().get(REG_PREFIX + normalized);
  if (!challengeRaw) {
    return { verified: false };
  }

  const { challenge } = JSON.parse(challengeRaw) as { challenge: string };

  const verification = await verifyRegistrationResponse({
    response: response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
    expectedChallenge: challenge,
    expectedOrigin: config.expectedOrigin,
    expectedRPID: config.rpId,
    requireUserVerification: true
  });

  if (!verification.verified || !verification.registrationInfo) {
    return { verified: false };
  }

  const user = await findUserByUsername(normalized);
  if (!user) {
    return { verified: false };
  }

  const registrationInfo = verification.registrationInfo as {
    credential: {
      id: string;
      publicKey: Uint8Array;
      counter: number;
      transports?: string[];
    };
  };

  await upsertCredential(
    user.subject_id,
    registrationInfo.credential.id,
    Buffer.from(registrationInfo.credential.publicKey).toString("base64url"),
    registrationInfo.credential.counter,
    registrationInfo.credential.transports ?? []
  );

  await getCache().del(REG_PREFIX + normalized);
  return { verified: true };
}

export async function beginPasskeyAuthentication(username: string): Promise<unknown | null> {
  const normalized = username.trim().toLowerCase();
  const user = await findUserByUsername(normalized);
  if (!user) {
    return null;
  }

  const credentials = await listCredentialsForUser(user.subject_id);
  if (credentials.length === 0) {
    return null;
  }

  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    timeout: 60_000,
    userVerification: "preferred",
    allowCredentials: credentials.map((credential) => ({
      id: credential.credential_id,
      transports: (credential.transports ?? []) as any
    }))
  });

  await getCache().set(
    AUTH_PREFIX + normalized,
    JSON.stringify({ challenge: options.challenge, username: normalized }),
    CHALLENGE_TTL
  );

  return options;
}

export async function finishPasskeyAuthentication(
  username: string,
  response: unknown
): Promise<{ verified: boolean; subjectId?: string; username?: string }> {
  const normalized = username.trim().toLowerCase();
  const challengeRaw = await getCache().get(AUTH_PREFIX + normalized);
  if (!challengeRaw) {
    return { verified: false };
  }

  const { challenge } = JSON.parse(challengeRaw) as { challenge: string };
  const user = await findUserByUsername(normalized);
  if (!user) {
    return { verified: false };
  }

  const credentialId = (response as { id?: string }).id;
  if (!credentialId) {
    return { verified: false };
  }

  const credential = await getCredentialById(credentialId);
  if (!credential) {
    return { verified: false };
  }

  const verification = await verifyAuthenticationResponse({
    response: response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
    expectedChallenge: challenge,
    expectedOrigin: config.expectedOrigin,
    expectedRPID: config.rpId,
    credential: {
      id: credential.credential_id,
      publicKey: Buffer.from(credential.public_key, "base64url"),
      counter: credential.counter,
      transports: (credential.transports ?? []) as any
    },
    requireUserVerification: true
  });

  if (!verification.verified) {
    return { verified: false };
  }

  const newCounter = (verification.authenticationInfo as { newCounter?: number }).newCounter;
  if (typeof newCounter === "number") {
    await updateCredentialCounter(credential.credential_id, newCounter);
  }

  await getCache().del(AUTH_PREFIX + normalized);
  return {
    verified: true,
    subjectId: user.subject_id,
    username: user.username
  };
}
