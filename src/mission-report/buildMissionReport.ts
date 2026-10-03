import { FIELD_AGENTS } from '../data/crew';
import type { AgentId, MissionEvent, OperationState, RiskSignal, ThreatClassification } from '../types';

export interface MissionReportData {
  caseNumber: string;
  title: string;
  targetName: string;
  threat?: ThreatClassification;
  peakRisk: number;
  amountProtected: number;
  signals: (RiskSignal & { delta: number })[];
  crewDeployed: { id: AgentId; activatedAt: number; note?: string }[];
  interventionLabel: string;
  outcome: string;
  verifiedBy?: string;
  /** Seconds from first warning sign to intervention */
  timeToIntervention?: number;
  durationSeconds: number;
  timeline: MissionEvent[];
}

const INTERVENTION_LABEL = {
  'call-trusted-contact': 'Trusted-contact verification',
  'verify-claimed-person': 'Direct verification on a known number',
  wait: 'Cool-down',
  exit: 'Safe exit (call ended)',
} as const;

/** Derives the report from operation state. Nothing here is hard-coded to the scenario. */
export function buildMissionReport(state: OperationState): MissionReportData {
  const chosen = state.intervention?.chosenAction;
  const cooled = state.log.some((e) => e.title === 'Cool-down started');
  let interventionLabel = chosen ? INTERVENTION_LABEL[chosen] : 'None';
  if (cooled && chosen && chosen !== 'wait') interventionLabel = `Cool-down → ${interventionLabel.toLowerCase()}`;

  const firstSignal = state.signals[0]?.detectedAt;
  const stopped = state.payment?.status === 'stopped';

  return {
    caseNumber: state.mission.caseNumber,
    title: state.mission.title,
    targetName: state.mission.target.name,
    threat: state.mission.threat,
    peakRisk: Math.max(0, ...state.riskHistory.map((p) => p.score)),
    amountProtected: stopped ? state.payment!.amount : 0,
    signals: state.signals.map((s) => ({
      ...s,
      delta: state.assessment.contributions.find((c) => c.signalId === s.id)?.delta ?? 0,
    })),
    crewDeployed: FIELD_AGENTS.filter((id) => state.agents[id].activatedAt !== undefined).map((id) => ({
      id,
      activatedAt: state.agents[id].activatedAt!,
      note: state.agents[id].note,
    })),
    interventionLabel,
    outcome: stopped ? 'Payment prevented' : 'Payment not completed',
    verifiedBy: state.verification?.stage === 'confirmed' ? state.verification.contact.name.split(' ')[0] : undefined,
    timeToIntervention:
      state.intervention && firstSignal !== undefined ? state.intervention.triggeredAt - firstSignal : undefined,
    durationSeconds: state.clock,
    // Keep the story readable: drop Mastermind self-entries and end-of-mission "complete" bookkeeping.
    timeline: state.log.filter(
      (e) => !(e.type === 'deployment' && (e.agent === 'mastermind' || e.title.endsWith('COMPLETE'))),
    ),
  };
}
