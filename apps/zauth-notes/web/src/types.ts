export type ApiError = {
  error: string;
  message?: string;
  details?: unknown;
};

export type AssuranceViewModel = {
  acr: string;
  amr: string[];
  uid?: string;
  did?: string;
  badge_label: string;
  assurance_ok: boolean;
  required_acr: string;
};

export type SessionUserViewModel = {
  id: number;
  subject_id: string;
  email: string | null;
  display_name: string | null;
};

export type SessionViewModel = {
  authenticated: boolean;
  user?: SessionUserViewModel;
  assurance?: AssuranceViewModel;
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
