export type NotesUser = {
  id: number;
  subject_id: string;
  email: string | null;
  display_name: string | null;
};

export type Assurance = {
  acr: string;
  amr: string[];
  uid?: string;
  did?: string;
};

export type NotesSession = {
  session_id: string;
  user_id: number;
  subject_id: string;
  acr: string | null;
  amr: string[] | null;
  uid: string | null;
  did: string | null;
  expires_at: string;
};

export type SessionViewModel = {
  authenticated: boolean;
  user?: {
    id: number;
    subject_id: string;
    email: string | null;
    display_name: string | null;
  };
  assurance?: Assurance & {
    badge_label: string;
    assurance_ok: boolean;
    required_acr: string;
  };
  csrf_token?: string;
  login_url?: string;
};

export type NoteItem = {
  id: number;
  title: string;
  content: string;
  tags: string[];
  is_archived: boolean;
  updated_at: string;
  created_at: string;
};
