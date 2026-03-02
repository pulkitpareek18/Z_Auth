export type OAuthClient = {
  client_id: string;
  client_secret: string | null;
  redirect_uris: string[];
  scopes: string[];
  grant_types: string[];
  created_at: string;
};

export type UserPrincipal = {
  subject_id: string;
  tenant_id: string;
  username: string;
  display_name: string;
  created_at: string;
};

export type PasskeyCredential = {
  credential_id: string;
  subject_id: string;
  public_key: string;
  counter: number;
  transports: string[];
  created_at: string;
};

export type PramaanIdentityMap = {
  uid: string;
  did: string;
  hash1: string;
  hash2: string;
  commitment_root: string;
  subject_id: string;
  tenant_id: string;
  created_at: string;
};

export type AuthRequest = {
  requestId: string;
  responseType: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  nonce?: string;
  createdAt: number;
};

export type SessionRecord = {
  sessionId: string;
  subjectId: string;
  username: string;
  assurance?: AssuranceContext;
  createdAt: number;
  expiresAt: number;
};

export type HandoffRequest = {
  handoffId: string;
  code: string;
  requestId?: string;
  loginHint?: string;
  mode?: "signin" | "signup";
  status: "pending" | "approved" | "consumed" | "denied";
  approvedBySubjectId?: string;
  approvedByUsername?: string;
  assurance?: AssuranceContext;
  createdAt: number;
  expiresAt: number;
};

export type HandoffContext = {
  handoffId: string;
  status: "pending" | "approved" | "consumed" | "denied" | "expired";
  loginHint?: string;
  accountLocked: boolean;
  mode: "signin" | "signup";
  expiresAt: number;
};

export type HandoffStartResponseV2 = {
  handoff_id: string;
  code: string;
  qr_payload: string;
  verify_url: string;
  expires_at: string;
  expires_in_ms: number;
  poll_interval_ms: number;
  zk_required: boolean;
  approve_path: string;
  login_hint: string | null;
  account_locked: boolean;
  request_valid: true;
  mode: "signin" | "signup";
};

export type HandoffContextResponse = {
  handoff_id: string;
  status: "pending" | "approved" | "consumed" | "denied" | "expired";
  login_hint: string | null;
  account_locked: boolean;
  mode: "signin" | "signup";
  expires_at: string;
};

export type RequestExpiredError = {
  error: "request_expired";
  message?: string;
};

export type LivenessSequenceAction = "blink" | "turn_left" | "turn_right";

export type LivenessChallenge = {
  livenessSessionId: string;
  handoffId: string;
  sequence: LivenessSequenceAction[];
  expiresAt: number;
  status: "pending" | "verified" | "failed" | "expired";
  score?: number;
};

export type LivenessEvaluation = {
  verified: boolean;
  score: number;
  reason?: string;
  mode: "mock" | "challenge";
};

export type AssuranceContext = {
  acr: string;
  amr: string[];
  uid?: string;
  did?: string;
  proofVerificationId?: string;
  zkpVerifiedAt?: number;
};

export type IdentityCommitment = {
  uid: string;
  did: string;
  hash1: string;
  hash2: string;
  commitment_root: string;
  circuit_id: string;
  subject_id: string;
  tenant_id: string;
  created_at: string;
};

export type ZkProofRequest = {
  proof_request_id: string;
  uid: string;
  challenge: string;
  purpose: string;
  expires_at: string;
  consumed: boolean;
  created_at: string;
};

export type ZkProofReceipt = {
  verification_id: string;
  proof_request_id: string;
  uid: string;
  handoff_id?: string;
  verified: boolean;
  reason?: string;
  public_signals_hash: string;
  created_at: string;
};

export type AnchorBatch = {
  batch_id: string;
  merkle_root: string;
  chain_tx_hash?: string;
  ipfs_cid?: string;
  anchored_at: string;
};

export type RecoveryCode = {
  id: number;
  subject_id: string;
  code_hash: string;
  consumed_at?: string | null;
};
