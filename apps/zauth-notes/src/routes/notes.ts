import { Router } from "express";
import { requireAuth, requireCsrf } from "../middleware/auth.js";
import { createNote, deleteNote, listNotes, parseTags, updateNote } from "../services/notesService.js";
import { sendApiError } from "../utils/http.js";

export const notesRouter = Router();

notesRouter.get("/api/notes", requireAuth, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const tag = String(req.query.tag ?? "").trim();

  try {
    const notes = await listNotes(req.notesUser!.id, q, tag);
    res.status(200).json({ notes });
  } catch {
    sendApiError(res, 500, "notes_fetch_failed", "Unable to fetch notes right now.");
  }
});

notesRouter.post("/api/notes", requireAuth, requireCsrf, async (req, res) => {
  const title = String(req.body.title ?? "").trim();
  const content = String(req.body.content ?? "");
  const tags = parseTags(req.body.tags);

  if (!title) {
    sendApiError(res, 400, "title_required", "Please add a title for your note.");
    return;
  }

  try {
    const note = await createNote(req.notesUser!.id, title, content, tags);
    res.status(201).json(note);
  } catch {
    sendApiError(res, 500, "note_create_failed", "Unable to create note.");
  }
});

notesRouter.patch("/api/notes/:id", requireAuth, requireCsrf, async (req, res) => {
  const noteId = Number(req.params.id);
  if (!Number.isFinite(noteId)) {
    sendApiError(res, 400, "invalid_note_id", "Invalid note id.");
    return;
  }

  const title = req.body.title === undefined ? undefined : String(req.body.title).trim();
  const content = req.body.content === undefined ? undefined : String(req.body.content);
  const tags = req.body.tags === undefined ? undefined : parseTags(req.body.tags);

  if (title !== undefined && !title) {
    sendApiError(res, 400, "title_required", "Title cannot be empty.");
    return;
  }

  try {
    const note = await updateNote(req.notesUser!.id, noteId, { title, content, tags });
    if (!note) {
      if (title === undefined && content === undefined && tags === undefined) {
        sendApiError(res, 400, "no_updates", "No updates provided.");
        return;
      }
      sendApiError(res, 404, "note_not_found", "Note not found.");
      return;
    }

    res.status(200).json(note);
  } catch {
    sendApiError(res, 500, "note_update_failed", "Unable to update note.");
  }
});

notesRouter.delete("/api/notes/:id", requireAuth, requireCsrf, async (req, res) => {
  const noteId = Number(req.params.id);
  if (!Number.isFinite(noteId)) {
    sendApiError(res, 400, "invalid_note_id", "Invalid note id.");
    return;
  }

  try {
    const deleted = await deleteNote(req.notesUser!.id, noteId);
    if (!deleted) {
      sendApiError(res, 404, "note_not_found", "Note not found.");
      return;
    }

    res.status(200).json({ deleted: true });
  } catch {
    sendApiError(res, 500, "note_delete_failed", "Unable to delete note.");
  }
});
