import { pool } from "./pool.js";

interface Migration {
  id: string;
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    id: "001",
    name: "initial_schema",
    sql: `-- Initial schema is created by init.ts on first boot`
  },
  {
    id: "002",
    name: "add_acr_amr_to_tokens",
    sql: `
      ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS acr TEXT;
      ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS amr JSONB;
      ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS uid TEXT;
      ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS did TEXT;
      ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS proof_verification_id TEXT;
      ALTER TABLE access_tokens ADD COLUMN IF NOT EXISTS acr TEXT;
      ALTER TABLE access_tokens ADD COLUMN IF NOT EXISTS amr JSONB;
      ALTER TABLE access_tokens ADD COLUMN IF NOT EXISTS uid TEXT;
      ALTER TABLE access_tokens ADD COLUMN IF NOT EXISTS did TEXT;
    `
  },
  {
    id: "003",
    name: "add_biometric_hash_remove_face_embedding",
    sql: `
      ALTER TABLE pramaan_identity_map ADD COLUMN IF NOT EXISTS biometric_hash TEXT;
      ALTER TABLE pramaan_identity_map ADD COLUMN IF NOT EXISTS zk_commitment TEXT;
      ALTER TABLE pramaan_identity_map DROP COLUMN IF EXISTS face_embedding;
      ALTER TABLE pramaan_identity_map DROP COLUMN IF EXISTS embedding_version;
    `
  },
  {
    id: "004",
    name: "add_recovery_code_generation_id",
    sql: `
      ALTER TABLE recovery_codes ADD COLUMN IF NOT EXISTS generation_id TEXT DEFAULT 'gen0';
    `
  },
  {
    id: "005",
    name: "add_identity_commitment_zk_field",
    sql: `
      ALTER TABLE identity_commitments ADD COLUMN IF NOT EXISTS zk_commitment TEXT;
    `
  },
  {
    id: "006",
    name: "add_enrollment_descriptor",
    sql: `
      ALTER TABLE pramaan_identity_map ADD COLUMN IF NOT EXISTS enrollment_descriptor TEXT;
    `
  },
  {
    id: "007",
    name: "add_user_enrolled_flag",
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS enrolled BOOLEAN NOT NULL DEFAULT FALSE;
      UPDATE users u SET enrolled = TRUE WHERE EXISTS (
        SELECT 1 FROM pramaan_identity_map p WHERE p.subject_id = u.subject_id
      );
    `
  },
  {
    id: "008",
    name: "add_chain_tx_hash",
    sql: `
      ALTER TABLE identity_commitment_log ADD COLUMN IF NOT EXISTS chain_tx_hash TEXT;
      ALTER TABLE zk_proof_receipts ADD COLUMN IF NOT EXISTS chain_tx_hash TEXT;
    `
  }
];

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = await client.query<{ id: string }>(
      `SELECT id FROM schema_migrations ORDER BY id`
    );
    const appliedIds = new Set(applied.rows.map(r => r.id));

    for (const migration of migrations) {
      if (appliedIds.has(migration.id)) continue;

      console.log(`[migrate] applying ${migration.id}_${migration.name}...`);
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO schema_migrations (id, name) VALUES ($1, $2)`,
          [migration.id, migration.name]
        );
        await client.query("COMMIT");
        console.log(`[migrate] applied ${migration.id}_${migration.name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
  }
}
