import { SIGNAL_CATALOG } from '../data/signalCatalog';
import { SIGNAL_WEIGHTS } from '../engine/riskEngine';
import type { AgentId, RiskSignal, Severity, SignalCategory } from '../types';

let counter = 0;

export function severityFor(category: SignalCategory): Severity {
  const w = SIGNAL_WEIGHTS[category];
  if (w >= 0.25) return 'high';
  if (w >= 0.1) return 'medium';
  return 'low';
}

export function makeSignal(input: {
  category: SignalCategory;
  detectedBy: AgentId;
  detectedAt: number;
  detail?: string;
  evidence?: string;
  sourceEventId?: string;
}): RiskSignal {
  counter += 1;
  const def = SIGNAL_CATALOG[input.category];
  return {
    id: `sig-${input.category}-${counter}`,
    category: input.category,
    label: def.label,
    detail: input.detail ?? def.explanation,
    evidence: input.evidence,
    sourceEventId: input.sourceEventId,
    detectedBy: input.detectedBy,
    detectedAt: input.detectedAt,
    severity: severityFor(input.category),
  };
}
