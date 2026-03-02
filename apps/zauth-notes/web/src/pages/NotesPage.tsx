import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiRequest, ApiRequestError } from "../lib/api";
import type { ToastTone } from "../components/ToastStack";
import type { NoteItem, SessionViewModel } from "../types";

type NotesPageProps = {
  session: SessionViewModel;
  onLoggedOut: () => Promise<void> | void;
  onSessionExpired: () => Promise<void> | void;
  onNotify: (tone: ToastTone, text: string) => void;
};

type NotesResponse = {
  notes: NoteItem[];
};

function parseTags(input: string): string[] {
  const values = input
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return Array.from(new Set(values)).slice(0, 32);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function activityLine(action: string): string {
  return `${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${action}`;
}

export function NotesPage({ session, onLoggedOut, onSessionExpired, onNotify }: NotesPageProps) {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [activity, setActivity] = useState<string[]>([]);

  const assurance = session.assurance;
  const csrfToken = session.csrf_token ?? "";

  const displayName = useMemo(() => {
    return session.user?.display_name || session.user?.email || session.user?.subject_id || "Authenticated user";
  }, [session.user]);

  const tagChips = useMemo(() => {
    const values = new Set<string>();
    for (const note of notes) {
      for (const tag of note.tags || []) {
        values.add(tag);
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [notes]);

  const selectedNote = useMemo(() => {
    if (selectedNoteId === null) {
      return null;
    }
    return notes.find((note) => note.id === selectedNoteId) ?? null;
  }, [notes, selectedNoteId]);

  const appendActivity = useCallback((line: string) => {
    setActivity((current) => [activityLine(line), ...current].slice(0, 6));
  }, []);

  const resetEditor = useCallback(() => {
    setSelectedNoteId(null);
    setDraftTitle("");
    setDraftContent("");
    setDraftTags("");
    setEditorError(null);
  }, []);

  const handleSessionError = useCallback(
    async (error: unknown, fallbackMessage: string) => {
      if (error instanceof ApiRequestError && error.status === 401) {
        onNotify("info", "Session expired. Please sign in again.");
        await onSessionExpired();
        return;
      }

      const message = error instanceof ApiRequestError ? error.message : fallbackMessage;
      setEditorError(message);
      onNotify("error", message);
    },
    [onNotify, onSessionExpired]
  );

  const loadNotes = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }
      if (tagFilter) {
        params.set("tag", tagFilter);
      }
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const data = await apiRequest<NotesResponse>(`/api/notes${suffix}`);
      setNotes(data.notes || []);
      setEditorError(null);
    } catch (error) {
      await handleSessionError(error, "Unable to load notes right now.");
    } finally {
      setIsLoading(false);
    }
  }, [handleSessionError, searchQuery, tagFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadNotes();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [loadNotes]);

  useEffect(() => {
    if (selectedNote && selectedNote.id === selectedNoteId) {
      return;
    }
    if (selectedNoteId !== null && !selectedNote) {
      resetEditor();
    }
  }, [selectedNote, selectedNoteId, resetEditor]);

  const selectNote = (note: NoteItem) => {
    setSelectedNoteId(note.id);
    setDraftTitle(note.title);
    setDraftContent(note.content);
    setDraftTags((note.tags || []).join(", "));
    setEditorError(null);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) {
      setEditorError("Title is required.");
      return;
    }

    try {
      setIsSaving(true);
      setEditorError(null);
      const payload = {
        title,
        content: draftContent,
        tags: parseTags(draftTags)
      };

      if (selectedNoteId !== null) {
        const updated = await apiRequest<NoteItem>(`/api/notes/${selectedNoteId}`, {
          method: "PATCH",
          body: payload,
          csrfToken
        });
        setNotes((current) => current.map((note) => (note.id === updated.id ? updated : note)));
        appendActivity(`Updated note "${updated.title}"`);
        onNotify("success", "Note updated.");
      } else {
        const created = await apiRequest<NoteItem>("/api/notes", {
          method: "POST",
          body: payload,
          csrfToken
        });
        setNotes((current) => [created, ...current]);
        setSelectedNoteId(created.id);
        setDraftTitle(created.title);
        setDraftContent(created.content);
        setDraftTags((created.tags || []).join(", "));
        appendActivity(`Created note "${created.title}"`);
        onNotify("success", "Note created.");
      }
    } catch (error) {
      await handleSessionError(error, "Unable to save note.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (selectedNoteId === null || !selectedNote) {
      return;
    }

    const confirmed = window.confirm(`Delete "${selectedNote.title}"?`);
    if (!confirmed) {
      return;
    }

    try {
      setIsDeleting(true);
      await apiRequest<{ deleted: boolean }>(`/api/notes/${selectedNoteId}`, {
        method: "DELETE",
        csrfToken
      });
      setNotes((current) => current.filter((note) => note.id !== selectedNoteId));
      appendActivity(`Deleted note "${selectedNote.title}"`);
      onNotify("info", "Note deleted.");
      resetEditor();
    } catch (error) {
      await handleSessionError(error, "Unable to delete note.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest<{ logged_out: boolean }>("/api/logout", { method: "POST" });
    } catch {
      // Best-effort logout: continue to local reset even if network response is missing.
    }
    await onLoggedOut();
  };

  if (!assurance) {
    return null;
  }

  const isBlocked = !assurance.assurance_ok;

  return (
    <main className="screen">
      <section className="shell notes-shell">
        <header className="workspace-header">
          <div className="workspace-title">
            <div className="workspace-copy">
              <h1>Notes</h1>
              <p>Your personal workspace</p>
            </div>
          </div>
          <div className="workspace-user">
            <div className="user-chip">
              <span className="user-chip-name">{displayName}</span>
              <span className="user-chip-sub">{session.user?.email || session.user?.subject_id}</span>
            </div>
            <button type="button" className="btn btn-secondary" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>

        {isBlocked ? (
          <section className="blocked-state">
            <h2>Session needs to be refreshed.</h2>
            <p>Please sign in again to continue using your notes.</p>
            <div className="blocked-actions">
              <a className="btn btn-primary" href="/login">
                Sign in again
              </a>
              <button type="button" className="btn btn-secondary" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          </section>
        ) : (
          <div className="workspace-grid">
            <section className="panel editor-panel">
              <div className="panel-head">
                <h2>{selectedNoteId ? "Edit note" : "Create note"}</h2>
                <button type="button" className="btn btn-link" onClick={resetEditor}>
                  New note
                </button>
              </div>

              <form className="note-form" onSubmit={handleSave}>
                <label className="field">
                  <span>Title</span>
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    placeholder="Sprint demo plan"
                    maxLength={160}
                    required
                  />
                </label>

                <label className="field">
                  <span>Content</span>
                  <textarea
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                    placeholder="Capture your product ideas and demo script..."
                    rows={10}
                  />
                </label>

                <label className="field">
                  <span>Tags</span>
                  <input
                    value={draftTags}
                    onChange={(event) => setDraftTags(event.target.value)}
                    placeholder="hackathon, security, product"
                  />
                </label>

                {editorError ? <p className="form-error">{editorError}</p> : null}

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={isSaving}>
                    {isSaving ? "Saving..." : selectedNoteId ? "Save changes" : "Create note"}
                  </button>
                  {selectedNoteId ? (
                    <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={isDeleting}>
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  ) : null}
                </div>
              </form>

              <div className="activity-panel">
                <h3>Activity</h3>
                {activity.length ? (
                  <ul>
                    {activity.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No actions yet.</p>
                )}
              </div>
            </section>

            <section className="panel list-panel">
              <div className="panel-head">
                <h2>Your notes</h2>
                <span className="count-pill">{notes.length}</span>
              </div>

              <label className="field">
                <span>Search</span>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search title or content"
                />
              </label>

              {tagChips.length ? (
                <div className="tag-row">
                  <button
                    type="button"
                    className={`tag-chip ${tagFilter === "" ? "is-active" : ""}`}
                    onClick={() => setTagFilter("")}
                  >
                    All
                  </button>
                  {tagChips.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`tag-chip ${tagFilter === tag ? "is-active" : ""}`}
                      onClick={() => setTagFilter((current) => (current === tag ? "" : tag))}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="note-list" aria-live="polite">
                {isLoading ? <p className="empty-state">Loading notes...</p> : null}
                {!isLoading && !notes.length ? <p className="empty-state">No notes yet. Create your first note.</p> : null}
                {!isLoading &&
                  notes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      className={`note-item ${note.id === selectedNoteId ? "is-active" : ""}`}
                      onClick={() => selectNote(note)}
                    >
                      <div className="note-item-top">
                        <strong>{note.title}</strong>
                        <span>{formatDate(note.updated_at)}</span>
                      </div>
                      <p>{note.content || "No content yet."}</p>
                      <div className="note-item-tags">
                        {(note.tags || []).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    </button>
                  ))}
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
