import type { LiveSignal, LiveSignalType } from '../live-analysis/types';
import type { RiskLevel } from '../types';
import { combineEvidence, levelForScore } from './riskEngine';

/**
 * Deterministic risk scoring for Gemini-detected signals.
 *
 * Gemini interprets the message; this engine makes the safety call:
 *  1. Each signal type has a fixed base weight (0–1): how strongly that tactic predicts a scam.
 *  2. effective = base × confidence. Signals below MIN_CONFIDENCE are ignored as noise.
 *  3. Evidence not found verbatim in the message is weighted × UNGROUNDED_FACTOR.
 *  4. Only the strongest signal of each type counts, so repeated tactics can't inflate the score.
 *  5. Effective weights combine with noisy-OR: score = 1 − Π(1 − effective). It never exceeds 100.
 *  6. Thresholds are the same as the scripted demo: 30 elevated · 55 high · 80 critical.
 *
 * Same Gemini output ⇒ same score: counted signals are sorted deterministically.
 */
export const LIVE_SIGNAL_WEIGHTS: Record<LiveSignalType, number> = {
  credential_request: 0.5,
  remote_access_request: 0.5,
  unusual_payment_request: 0.45,
  isolation_secrecy: 0.43,
  prize_investment_claim: 0.35,
  artificial_urgency: 0.31,
  authority_impersonation: 0.3,
  romance_manipulation: 0.3,
  suspicious_link: 0.3,
  emotional_leverage: 0.29,
  family_emergency: 0.2,
  other_manipulation: 0.15,
};

export const MIN_CONFIDENCE = 0.35;
export const UNGROUNDED_FACTOR = 0.75;

export type LiveContributionStatus = 'counted' | 'duplicate' | 'low-confidence';

export interface LiveContribution {
  index: number; // position in analysis.signals
  type: LiveSignalType;
  baseWeight: number;
  confidence: number;
  grounded: boolean;
  effectiveWeight: number;
  delta: number; // points added to the final score
  status: LiveContributionStatus;
}

export interface LiveAssessment {
  score: number;
  level: RiskLevel;
  contributions: LiveContribution[]; // same order as analysis.signals
  countedSignals: number;
}

export function scoreLiveSignals(signals: LiveSignal[]): LiveAssessment {
  const rows: LiveContribution[] = signals.map((s, index) => {
    const baseWeight = LIVE_SIGNAL_WEIGHTS[s.type] ?? LIVE_SIGNAL_WEIGHTS.other_manipulation;
    const confidence = Math.min(1, Math.max(0, s.confidence));
    const effectiveWeight = baseWeight * confidence * (s.evidence_verbatim ? 1 : UNGROUNDED_FACTOR);
    return {
      index,
      type: s.type,
      baseWeight,
      confidence,
      grounded: s.evidence_verbatim,
      effectiveWeight,
      delta: 0,
      status: confidence < MIN_CONFIDENCE ? 'low-confidence' : 'counted',
    };
  });

  // Strongest instance per type wins; ties broken by original order (stable & deterministic).
  const best = new Map<LiveSignalType, LiveContribution>();
  for (const r of rows) {
    if (r.status !== 'counted') continue;
    const prev = best.get(r.type);
    if (!prev || r.effectiveWeight > prev.effectiveWeight) {
      if (prev) prev.status = 'duplicate';
      best.set(r.type, r);
    } else {
      r.status = 'duplicate';
    }
  }

  // Deterministic order: heaviest evidence first (so deltas read naturally), then by type name.
  const counted = [...best.values()].sort((a, b) => b.effectiveWeight - a.effectiveWeight || a.type.localeCompare(b.type));
  const { score, deltas } = combineEvidence(counted.map((r) => r.effectiveWeight));
  counted.forEach((r, i) => (r.delta = deltas[i]));

  return { score, level: levelForScore(score), contributions: rows, countedSignals: counted.length };
}
