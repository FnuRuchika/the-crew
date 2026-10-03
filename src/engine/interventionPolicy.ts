import type { Payment, RiskAssessment, RiskSignal } from '../types';
import { RISK_THRESHOLDS } from './riskEngine';

export interface InterventionDecision {
  intervene: boolean;
  reason: string;
}

/**
 * When is friction justified?
 *
 * We do NOT interrupt a conversation just because it sounds suspicious. The shield
 * steps in at the moment of irreversible harm: money is about to leave AND the
 * accumulated evidence is critical, with corroboration from more than one evidence family.
 */
export function evaluateIntervention(
  assessment: RiskAssessment,
  payment: Payment | null,
  signals: RiskSignal[],
): InterventionDecision {
  if (!payment || payment.status !== 'submitted') {
    return { intervene: false, reason: 'No money is moving yet. Keep watching.' };
  }
  const families = new Set(signals.map((s) => s.detectedBy));
  if (assessment.score < RISK_THRESHOLDS.critical) {
    return { intervene: false, reason: `Risk ${assessment.score}% is below the critical threshold.` };
  }
  if (families.size < 2) {
    return { intervene: false, reason: 'Only one crew member has evidence. Waiting for corroboration.' };
  }
  return {
    intervene: true,
    reason: `Payment in flight with ${assessment.score}% risk, corroborated by ${families.size} crew members.`,
  };
}
