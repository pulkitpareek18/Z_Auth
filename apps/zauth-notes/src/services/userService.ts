import { pool } from "../db/pool.js";
import type { NotesUser } from "../types/models.js";

export async function upsertNotesUser(subjectId: string, preferredUsername?: string, displayName?: string): Promise<NotesUser> {
  const result = await pool.query<NotesUser>(
    `INSERT INTO notes_users (subject_id, email, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (subject_id) DO UPDATE
     SET email = COALESCE(EXCLUDED.email, notes_users.email),
         display_name = COALESCE(EXCLUDED.display_name, notes_users.display_name)
     RETURNING id::int, subject_id, email, display_name`,
    [subjectId, preferredUsername ?? null, displayName ?? null]
  );

  return result.rows[0];
}

export async function getUserById(userId: number): Promise<NotesUser | null> {
  const result = await pool.query<NotesUser>(
    `SELECT id::int, subject_id, email, display_name FROM notes_users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}
