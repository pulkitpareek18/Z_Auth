import { config } from "../config.js";
import { pool } from "../db/pool.js";
import type { LivenessChallenge, LivenessEvaluation, LivenessSequenceAction } from "../types/models.js";
import { randomId } from "../utils/crypto.js";
import { getCache } from "./cacheService.js";

const LIVENESS_PREFIX = "liveness:";
const LIVENESS_TTL_SECONDS = 5 * 60;

const ACTIONS: LivenessSequenceAction[] = ["blink", "turn_left", "turn_right"];

type LivenessSignal = {
  action: LivenessSequenceAction;
  timestamp: number;
  confidence?: number;
};

function key(sessionId: string): string {
  return LIVENESS_PREFIX + sessionId;
}

function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function saveChallenge(challenge: LivenessChallenge): Promise<void> {
  const ttl = Math.max(1, Math.floor((challenge.expiresAt - Date.now()) / 1000));
  await getCache().set(key(challenge.livenessSessionId), JSON.stringify(challenge), ttl);
}

export async function startLivenessChallenge(handoffId: string): Promise<LivenessChallenge> {
  const sequence = shuffle(ACTIONS).slice(0, 3);
  const challenge: LivenessChallenge = {
    livenessSessionId: randomId(18),
    handoffId,
    sequence,
    expiresAt: Date.now() + LIVENESS_TTL_SECONDS * 1000,
    status: "pending"
  };
  await saveChallenge(challenge);
  return challenge;
}

export async function getLivenessChallenge(sessionId: string): Promise<LivenessChallenge | null> {
  const raw = await getCache().get(key(sessionId));
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as LivenessChallenge;
}

function normalizeSignals(signals: unknown[]): LivenessSignal[] {
  return signals
    .map((signal) => {
      const value = signal as Record<string, unknown>;
      const action = String(value.action ?? "") as LivenessSequenceAction;
      const timestamp = Number(value.timestamp ?? 0);
      const confidence = value.confidence === undefined ? undefined : Number(value.confidence);
      return { action, timestamp, confidence };
    })
    .filter((signal) => ACTIONS.includes(signal.action) && Number.isFinite(signal.timestamp));
}

function evaluateChallenge(challenge: LivenessChallenge, signals: LivenessSignal[], confidence: number): LivenessEvaluation {
  if (challenge.expiresAt < Date.now()) {
    return {
      verified: false,
      score: 0,
      reason: "liveness_expired",
      mode: config.livenessMode
    };
  }

  if (config.livenessMode === "mock") {
    return {
      verified: true,
      score: 0.99,
      mode: config.livenessMode
    };
  }

  const expected = challenge.sequence;
  const observed = signals.map((signal) => signal.action);

  if (signals.length < expected.length) {
    return {
      verified: false,
      score: 0.2,
      reason: "insufficient_signals",
      mode: config.livenessMode
    };
  }

  for (let i = 0; i < expected.length; i += 1) {
    if (observed[i] !== expected[i]) {
      return {
        verified: false,
        score: 0.35,
        reason: "sequence_mismatch",
        mode: config.livenessMode
      };
    }
  }

  const durationMs = signals[signals.length - 1].timestamp - signals[0].timestamp;
  if (!Number.isFinite(durationMs) || durationMs < 1200) {
    return {
      verified: false,
      score: 0.4,
      reason: "duration_too_short",
      mode: config.livenessMode
    };
  }

  const signalConfidence = signals
    .map((signal) => signal.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const avgSignalConfidence =
    signalConfidence.length > 0
      ? signalConfidence.reduce((acc, value) => acc + value, 0) / signalConfidence.length
      : confidence;

  const score = Number((0.6 * confidence + 0.4 * avgSignalConfidence).toFixed(3));

  if (score < config.livenessMinConfidence) {
    return {
      verified: false,
      score,
      reason: "confidence_too_low",
      mode: config.livenessMode
    };
  }

  return {
    verified: true,
    score,
    mode: config.livenessMode
  };
}

export async function verifyLivenessChallenge(input: {
  sessionId: string;
  handoffId: string;
  events: unknown[];
  confidence: number;
  durationMs: number;
}): Promise<LivenessEvaluation> {
  const challenge = await getLivenessChallenge(input.sessionId);
  if (!challenge) {
    return {
      verified: false,
      score: 0,
      reason: "challenge_not_found",
      mode: config.livenessMode
    };
  }

  if (challenge.handoffId !== input.handoffId) {
    return {
      verified: false,
      score: 0,
      reason: "handoff_mismatch",
      mode: config.livenessMode
    };
  }

  const signals = normalizeSignals(input.events);
  const evaluation = evaluateChallenge(challenge, signals, input.confidence);

  const updated: LivenessChallenge = {
    ...challenge,
    status: evaluation.verified ? "verified" : "failed",
    score: evaluation.score
  };

  await saveChallenge(updated);

  await pool.query(
    `INSERT INTO liveness_events (handoff_id, session_id, result, score, signals_json)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      input.handoffId,
      input.sessionId,
      evaluation.verified ? "verified" : evaluation.reason ?? "failed",
      evaluation.score,
      JSON.stringify({
        events: signals,
        confidence: input.confidence,
        duration_ms: input.durationMs,
        min_confidence: config.livenessMinConfidence,
        mode: config.livenessMode
      })
    ]
  );

  return evaluation;
}
