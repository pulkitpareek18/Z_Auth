import type { Assurance, NotesSession, NotesUser } from "./models.js";

declare global {
  namespace Express {
    interface Request {
      notesUser?: NotesUser;
      notesSession?: NotesSession;
      assurance?: Assurance;
    }
  }
}

export {};
