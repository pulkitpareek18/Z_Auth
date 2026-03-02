import { pool } from "../db/pool.js";
import type { NoteItem } from "../types/models.js";

export function parseTags(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input.map((tag) => String(tag).trim())
    : String(input ?? "")
        .split(",")
        .map((tag) => tag.trim());

  const unique = new Set<string>();
  for (const tag of raw) {
    if (!tag) {
      continue;
    }
    if (tag.length > 40) {
      continue;
    }
    unique.add(tag.toLowerCase());
    if (unique.size >= 32) {
      break;
    }
  }

  return Array.from(unique);
}

export async function listNotes(userId: number, q?: string, tag?: string): Promise<NoteItem[]> {
  const where: string[] = ["user_id = $1", "is_archived = FALSE"];
  const params: unknown[] = [userId];

  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    where.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length})`);
  }

  if (tag && tag.trim()) {
    params.push(tag.trim().toLowerCase());
    where.push(`tags @> to_jsonb(ARRAY[$${params.length}]::text[])`);
  }

  const result = await pool.query<NoteItem>(
    `SELECT id::int, title, content, tags, is_archived, updated_at::text, created_at::text
     FROM notes
     WHERE ${where.join(" AND ")}
     ORDER BY updated_at DESC
     LIMIT 200`,
    params
  );

  return result.rows;
}

export async function createNote(userId: number, title: string, content: string, tags: string[]): Promise<NoteItem> {
  const result = await pool.query<NoteItem>(
    `INSERT INTO notes (user_id, title, content, tags)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id::int, title, content, tags, is_archived, updated_at::text, created_at::text`,
    [userId, title, content, JSON.stringify(tags)]
  );

  return result.rows[0];
}

export async function updateNote(
  userId: number,
  noteId: number,
  updates: {
    title?: string;
    content?: string;
    tags?: string[];
  }
): Promise<NoteItem | null> {
  const fields: string[] = [];
  const values: unknown[] = [userId, noteId];

  if (updates.title !== undefined) {
    values.push(updates.title);
    fields.push(`title = $${values.length}`);
  }

  if (updates.content !== undefined) {
    values.push(updates.content);
    fields.push(`content = $${values.length}`);
  }

  if (updates.tags !== undefined) {
    values.push(JSON.stringify(updates.tags));
    fields.push(`tags = $${values.length}::jsonb`);
  }

  if (fields.length === 0) {
    return null;
  }

  fields.push("updated_at = NOW()");

  const result = await pool.query<NoteItem>(
    `UPDATE notes
     SET ${fields.join(", ")}
     WHERE user_id = $1 AND id = $2
     RETURNING id::int, title, content, tags, is_archived, updated_at::text, created_at::text`,
    values
  );

  return result.rows[0] ?? null;
}

export async function deleteNote(userId: number, noteId: number): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM notes WHERE id = $1 AND user_id = $2`,
    [noteId, userId]
  );

  return Boolean(result.rowCount);
}
