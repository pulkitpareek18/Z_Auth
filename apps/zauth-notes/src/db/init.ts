import { pool } from "./pool.js";

export async function initializeDatabase(): Promise<void> {
  await pool.query(`
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

CREATE TABLE IF NOT EXISTS notes_sessions (
  session_id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES notes_users(id),
  subject_id TEXT NOT NULL,
  acr TEXT,
  amr JSONB,
  uid TEXT,
  did TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_sessions_expires ON notes_sessions (expires_at);
  `);

  await pool.query(`ALTER TABLE notes_sessions ADD COLUMN IF NOT EXISTS acr TEXT`);
  await pool.query(`ALTER TABLE notes_sessions ADD COLUMN IF NOT EXISTS amr JSONB`);
  await pool.query(`ALTER TABLE notes_sessions ADD COLUMN IF NOT EXISTS uid TEXT`);
  await pool.query(`ALTER TABLE notes_sessions ADD COLUMN IF NOT EXISTS did TEXT`);
}
