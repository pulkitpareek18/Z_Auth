import { v4 as uuidv4 } from "uuid";
import { pool } from "../db/pool.js";
import type { PasskeyCredential, UserPrincipal } from "../types/models.js";

export async function findUserByUsername(username: string): Promise<UserPrincipal | null> {
  const result = await pool.query<UserPrincipal>(
    `SELECT subject_id, tenant_id, username, display_name, created_at::text
     FROM users
     WHERE username = $1`,
    [username]
  );
  return result.rows[0] ?? null;
}

export async function findUserBySubject(subjectId: string): Promise<UserPrincipal | null> {
  const result = await pool.query<UserPrincipal>(
    `SELECT subject_id, tenant_id, username, display_name, created_at::text
     FROM users
     WHERE subject_id = $1`,
    [subjectId]
  );
  return result.rows[0] ?? null;
}

export async function createUser(username: string, displayName: string, tenantId = "default"): Promise<UserPrincipal> {
  const existing = await findUserByUsername(username);
  if (existing) {
    return existing;
  }

  const subjectId = `sub_${uuidv4()}`;
  const result = await pool.query<UserPrincipal>(
    `INSERT INTO users (subject_id, tenant_id, username, display_name)
     VALUES ($1, $2, $3, $4)
     RETURNING subject_id, tenant_id, username, display_name, created_at::text`,
    [subjectId, tenantId, username, displayName]
  );

  return result.rows[0];
}

export async function upsertCredential(
  subjectId: string,
  credentialId: string,
  publicKey: string,
  counter: number,
  transports: string[]
): Promise<void> {
  await pool.query(
    `INSERT INTO passkey_credentials (credential_id, subject_id, public_key, counter, transports)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (credential_id) DO UPDATE SET
       subject_id = EXCLUDED.subject_id,
       public_key = EXCLUDED.public_key,
       counter = EXCLUDED.counter,
       transports = EXCLUDED.transports`,
    [credentialId, subjectId, publicKey, counter, JSON.stringify(transports)]
  );
}

export async function getCredentialById(credentialId: string): Promise<PasskeyCredential | null> {
  const result = await pool.query<PasskeyCredential>(
    `SELECT credential_id, subject_id, public_key, counter::int, transports, created_at::text
     FROM passkey_credentials
     WHERE credential_id = $1`,
    [credentialId]
  );
  return result.rows[0] ?? null;
}

export async function listCredentialsForUser(subjectId: string): Promise<PasskeyCredential[]> {
  const result = await pool.query<PasskeyCredential>(
    `SELECT credential_id, subject_id, public_key, counter::int, transports, created_at::text
     FROM passkey_credentials
     WHERE subject_id = $1`,
    [subjectId]
  );
  return result.rows;
}

export async function updateCredentialCounter(credentialId: string, counter: number): Promise<void> {
  await pool.query(
    `UPDATE passkey_credentials
     SET counter = $2
     WHERE credential_id = $1`,
    [credentialId, counter]
  );
}
