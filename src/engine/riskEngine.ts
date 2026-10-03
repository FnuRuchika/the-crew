import type { RiskAssessment, RiskLevel, RiskSignal, SignalCategory } from '../types';

/**
 * Risk engine abstraction.
 *
 * Phase 1 uses a deterministic, explainable rule engine. A later phase can swap in
 * a backend/AI implementation (e.g. FastAPI + Gemini) that satisfies the same interface.
 */
export interface RiskEngine {
  assess(signals: RiskSignal[]): RiskAssessment;
}

/**
 * Probability-style weight for each signal category (0–1).
 * Weights are combined with a "noisy-OR": each signal independently removes a share
 * of the remaining doubt, so evidence compounds but the score never claims 100% certainty.
 *
 * For the demo scenario this produces: 14 → 39 → 58 → 76 → 82 → 87 → 94.
 */
export const SIGNAL_WEIGHTS: Record<SignalCategory, number> = {
  'emergency-claim': 0.14,
  'emotional-leverage': 0.29,
  urgency: 0.31,
  isolation: 0.43,
  authority: 0.2,
  'pressure-escalation': 0.15,
  'new-recipient': 0.25,
  'unusual-amount': 0.3,
  'identity-mismatch': 0.52,
};

export const RISK_THRESHOLDS: Record<Exclude<RiskLevel, 'low'>, number> = {
  elevated: 30,
  high: 55,
  critical: 80,
};

export function levelForScore(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.critical) return 'critical';
  if (score >= RISK_THRESHOLDS.high) return 'high';
  if (score >= RISK_THRESHOLDS.elevated) return 'elevated';
  return 'low';
}

/**
 * Noisy-OR evidence combination, shared by every engine.
 * Each weight (0–1) removes that share of the remaining doubt: score = 1 − Π(1 − wᵢ).
 * Returns the 0–100 score and how many points each weight added, in order.
 */
export function combineEvidence(weights: number[]): { score: number; deltas: number[] } {
  let remainingDoubt = 1;
  const deltas = weights.map((w) => {
    const before = Math.round((1 - remainingDoubt) * 100);
    remainingDoubt *= 1 - Math.min(1, Math.max(0, w));
    return Math.round((1 - remainingDoubt) * 100) - before;
  });
  return { score: Math.round((1 - remainingDoubt) * 100), deltas };
}

export function createRuleBasedRiskEngine(weights = SIGNAL_WEIGHTS): RiskEngine {
  return {
    assess(signals) {
      const { score, deltas } = combineEvidence(signals.map((s) => weights[s.category] ?? 0));
      const contributions = signals.map((signal, i) => ({
        signalId: signal.id,
        category: signal.category,
        delta: deltas[i],
      }));
      return { score, level: levelForScore(score), contributions };
    },
  };
}

export const riskEngine: RiskEngine = createRuleBasedRiskEngine();
