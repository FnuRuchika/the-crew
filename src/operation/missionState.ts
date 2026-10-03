import { CREW } from '../data/crew';
import type {
  AgentId,
  AgentRuntime,
  ConversationEvent,
  Deployment,
  MissionEvent,
  OperationState,
  RiskAssessment,
  RiskSignal,
  Scenario,
} from '../types';

/**
 * Pure state transitions for an operation. No timers, no side effects.
 * The useOperation hook sequences these; a backend could replay them from stored events.
 */

let eventCounter = 0;

export function createInitialState(scenario: Scenario): OperationState {
  const agents = Object.fromEntries(
    (Object.keys(CREW) as AgentId[]).map((id) => [id, { status: 'standby' } satisfies AgentRuntime]),
  ) as Record<AgentId, AgentRuntime>;

  return {
    phase: 'briefing',
    mission: {
      id: `mission-${scenario.id}`,
      caseNumber: scenario.caseNumber,
      title: scenario.title,
      status: 'standby',
      target: scenario.target,
      callerNumber: scenario.callerNumber,
    },
    beatIndex: 0,
    clock: 0,
    messages: [],
    signals: [],
    assessment: { score: 0, level: 'low', contributions: [] },
    riskHistory: [{ at: 0, score: 0 }],
    agents,
    log: [],
    payment: null,
    intervention: null,
    verification: null,
    exitPlan: [],
    spotlight: null,
  };
}

export function withLog(state: OperationState, event: Omit<MissionEvent, 'id' | 'at'> & { at?: number }): OperationState {
  eventCounter += 1;
  const entry: MissionEvent = { id: `ev-${eventCounter}`, at: event.at ?? state.clock, ...event };
  return { ...state, log: [...state.log, entry] };
}

export function withClock(state: OperationState, at: number): OperationState {
  return at > state.clock ? { ...state, clock: at } : state;
}

export function withMessage(state: OperationState, message: ConversationEvent): OperationState {
  let next = withClock({ ...state, messages: [...state.messages, message] }, message.at);
  if (message.speaker === 'caller') {
    next = withLog(next, { type: 'conversation', title: 'Caller', detail: `“${message.text}”`, at: message.at });
  } else if (message.speaker === 'system') {
    next = withLog(next, { type: 'conversation', title: 'Phone', detail: message.text, at: message.at });
  }
  return next;
}

export function withSignals(
  state: OperationState,
  signals: RiskSignal[],
  assessment: RiskAssessment,
): OperationState {
  if (!signals.length) return state;
  let next: OperationState = {
    ...state,
    signals: [...state.signals, ...signals],
    assessment,
    riskHistory: [...state.riskHistory, { at: Math.max(state.clock, ...signals.map((s) => s.detectedAt)), score: assessment.score }],
  };
  for (const s of signals) {
    next = withClock(next, s.detectedAt);
    next = withLog(next, {
      type: 'signal',
      agent: s.detectedBy,
      title: `Signal: ${s.label}`,
      detail: s.evidence ? `Evidence: “${s.evidence}”` : s.detail,
      riskScore: assessment.score,
      at: s.detectedAt,
    });
  }
  return next;
}

const STATUS_VERB: Record<string, string> = {
  active: 'ACTIVATED',
  monitoring: 'MONITORING',
  standby: 'STANDBY',
  complete: 'COMPLETE',
};

export function withDeployments(state: OperationState, deployments: Deployment[]): OperationState {
  let next = state;
  for (const d of deployments) {
    const prev = next.agents[d.agentId];
    const runtime: AgentRuntime = {
      status: d.status,
      note: d.reason,
      activatedAt:
        prev.activatedAt ?? (d.status === 'active' || d.status === 'monitoring' ? next.clock : undefined),
    };
    next = { ...next, agents: { ...next.agents, [d.agentId]: runtime } };
    next = withLog(next, {
      type: 'deployment',
      agent: d.agentId,
      title: `${CREW[d.agentId].name} · ${STATUS_VERB[d.status]}`,
      detail: d.reason,
    });
    if (d.status === 'active' && d.agentId !== 'mastermind') {
      next = {
        ...next,
        spotlight: {
          agentId: d.agentId,
          title: `${CREW[d.agentId].name.replace(/^The /, '')} ${STATUS_VERB[d.status]}`,
          reason: d.reason,
          key: (next.spotlight?.key ?? 0) + 1,
        },
      };
    }
  }
  return next;
}

export function withAgentNote(state: OperationState, agentId: AgentId, note: string): OperationState {
  return { ...state, agents: { ...state.agents, [agentId]: { ...state.agents[agentId], note } } };
}
