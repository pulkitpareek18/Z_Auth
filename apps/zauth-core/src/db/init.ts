import { config } from "../config.js";
import { pool } from "./pool.js";
import { runMigrations } from "./migrate.js";

const schemaSql = `
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret TEXT,
  redirect_uris JSONB NOT NULL,
  scopes JSONB NOT NULL,
  grant_types JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  subject_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS passkey_credentials (
  credential_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES users(subject_id),
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  subject_id TEXT NOT NULL REFERENCES users(subject_id),
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  acr TEXT,
  amr JSONB,
  uid TEXT,
  did TEXT,
  proof_verification_id TEXT,
  code_challenge TEXT,
  code_challenge_method TEXT,
  nonce TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS access_tokens (
  token TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  subject_id TEXT NOT NULL REFERENCES users(subject_id),
  scope TEXT NOT NULL,
  acr TEXT,
  amr JSONB,
  uid TEXT,
  did TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token TEXT PRIMARY KEY,
  previous_token TEXT,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  subject_id TEXT NOT NULL REFERENCES users(subject_id),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consents (
  subject_id TEXT NOT NULL REFERENCES users(subject_id),
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (subject_id, client_id, scope)
);

CREATE TABLE IF NOT EXISTS policies (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pramaan_identity_map (
  uid TEXT PRIMARY KEY,
  did TEXT NOT NULL UNIQUE,
  hash1 TEXT NOT NULL,
  hash2 TEXT NOT NULL,
  commitment_root TEXT NOT NULL,
  subject_id TEXT NOT NULL REFERENCES users(subject_id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proof_challenges (
  challenge_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES pramaan_identity_map(uid),
  challenge TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  prev_hash TEXT,
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS liveness_events (
  id BIGSERIAL PRIMARY KEY,
  handoff_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  result TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  signals_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes_users (
  id BIGSERIAL PRIMARY KEY,
  subject_id TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES notes_users(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity_commitments (
  uid TEXT PRIMARY KEY,
  did TEXT NOT NULL UNIQUE,
  hash1 TEXT NOT NULL,
  hash2 TEXT NOT NULL,
  commitment_root TEXT NOT NULL,
  circuit_id TEXT NOT NULL,
  subject_id TEXT NOT NULL REFERENCES users(subject_id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zk_proof_requests (
  proof_request_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES pramaan_identity_map(uid),
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zk_proof_receipts (
  verification_id TEXT PRIMARY KEY,
  proof_request_id TEXT NOT NULL REFERENCES zk_proof_requests(proof_request_id),
  uid TEXT NOT NULL REFERENCES pramaan_identity_map(uid),
  handoff_id TEXT,
  verified BOOLEAN NOT NULL,
  reason TEXT,
  public_signals_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anchor_batches (
  batch_id TEXT PRIMARY KEY,
  merkle_root TEXT NOT NULL,
  chain_tx_hash TEXT,
  ipfs_cid TEXT,
  anchored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recovery_codes (
  id BIGSERIAL PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES users(subject_id),
  code_hash TEXT NOT NULL,
  generation_id TEXT NOT NULL DEFAULT 'gen0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Blockchain-ready: append-only nullifier table for recovery code consumption.
-- Instead of UPDATE consumed_at, we INSERT a nullifier — mirrors on-chain nullifier sets.
CREATE TABLE IF NOT EXISTS recovery_nullifiers (
  nullifier_hash TEXT PRIMARY KEY,
  code_id BIGINT NOT NULL,
  subject_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Blockchain-ready: append-only nullifier for ZK proof request consumption.
-- Instead of UPDATE consumed = TRUE, we INSERT — mirrors on-chain nullifier sets.
CREATE TABLE IF NOT EXISTS proof_request_nullifiers (
  proof_request_id TEXT PRIMARY KEY,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Blockchain-ready: append-only revocation log for passkey credentials.
-- Instead of DELETE FROM passkey_credentials, we INSERT a revocation event.
CREATE TABLE IF NOT EXISTS credential_revocations (
  credential_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Blockchain-ready: append-only identity commitment event log.
-- Each enrollment/re-enrollment creates a new versioned entry.
-- This maps 1:1 to blockchain IdentityCommitted events.
-- The pramaan_identity_map table remains as "current state" (smart contract storage).
CREATE TABLE IF NOT EXISTS identity_commitment_log (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT NOT NULL,
  did TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  hash1 TEXT NOT NULL,
  hash2 TEXT NOT NULL,
  commitment_root TEXT NOT NULL,
  circuit_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  zk_commitment TEXT,
  prev_commitment_root TEXT,
  anchor_batch_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zk_proof_requests_uid ON zk_proof_requests(uid);
CREATE INDEX IF NOT EXISTS idx_zk_proof_requests_expires ON zk_proof_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_zk_proof_receipts_uid ON zk_proof_receipts(uid);
CREATE INDEX IF NOT EXISTS idx_zk_proof_receipts_handoff ON zk_proof_receipts(handoff_id);
CREATE INDEX IF NOT EXISTS idx_identity_commitments_created ON identity_commitments(created_at);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_subject ON recovery_codes(subject_id);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_gen ON recovery_codes(generation_id);
CREATE INDEX IF NOT EXISTS idx_recovery_nullifiers_code ON recovery_nullifiers(code_id);
CREATE INDEX IF NOT EXISTS idx_commitment_log_uid ON identity_commitment_log(uid);
CREATE INDEX IF NOT EXISTS idx_commitment_log_created ON identity_commitment_log(created_at);
CREATE INDEX IF NOT EXISTS idx_credential_revocations_subject ON credential_revocations(subject_id);
`;

export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(schemaSql);

    await client.query(
      `INSERT INTO tenants (id, name, status)
       VALUES ('default', 'Default Tenant', 'active')
       ON CONFLICT (id) DO NOTHING`
    );

    await client.query(
      `INSERT INTO oauth_clients (client_id, client_secret, redirect_uris, scopes, grant_types)
       VALUES ($1, NULL, $2::jsonb, $3::jsonb, $4::jsonb)
       ON CONFLICT (client_id) DO NOTHING`,
      [
        config.demoClientId,
        JSON.stringify([config.demoRedirectUri, "http://localhost:3001/callback", "https://demo.geturstyle.shop/callback"]),
        JSON.stringify(["openid", "profile", "email", "zauth.identity"]),
        JSON.stringify(["authorization_code", "refresh_token"])
      ]
    );

    await client.query(
      `INSERT INTO oauth_clients (client_id, client_secret, redirect_uris, scopes, grant_types)
       VALUES ($1, NULL, $2::jsonb, $3::jsonb, $4::jsonb)
       ON CONFLICT (client_id) DO NOTHING`,
      [
        config.notesClientId,
        JSON.stringify([config.notesRedirectUri, "http://localhost:3002/callback", "https://notes.geturstyle.shop/callback"]),
        JSON.stringify(["openid", "profile", "email", "zauth.identity"]),
        JSON.stringify(["authorization_code", "refresh_token"])
      ]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await runMigrations();
}
