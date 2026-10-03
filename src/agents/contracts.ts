import type {
  ConversationEvent,
  Deployment,
  ExitStep,
  Intervention,
  KnownPerson,
  OperationState,
  Payment,
  RiskAssessment,
  RiskSignal,
  SignalCategory,
  TargetProfile,
  ThreatClassification,
} from '../types';

/**
 * Agent contracts. Every crew member is async so a Phase-1 local rule implementation
 * can be swapped for a FastAPI / Gemini-backed implementation without touching the UI.
 */

export interface AnalysisContext {
  clock: number;
  target: TargetProfile;
  alreadyDetected: Set<SignalCategory>;
}

/** THE GRIFTER: conversational manipulation. Future: Gemini structured output. */
export interface ConversationAnalyst {
  analyze(events: ConversationEvent[], ctx: AnalysisContext): Promise<RiskSignal[]>;
}

/** THE LOOKOUT: behavioural / payment anomalies. */
export interface PaymentMonitor {
  analyze(payment: Payment, ctx: AnalysisContext): Promise<RiskSignal[]>;
}

/** THE INSIDE MAN: trusted context and identity checks. */
export interface IdentityVerifier {
  check(input: {
    claimedPersonId?: string;
    callerNumber: string;
    payment: Payment | null;
    ctx: AnalysisContext;
  }): Promise<RiskSignal[]>;
  resolveTrustedChannel(personId: string, target: TargetProfile): KnownPerson | undefined;
}

/** THE SAFECRACKER: evidence fusion. */
export interface RiskAssessor {
  assess(signals: RiskSignal[]): Promise<RiskAssessment>;
}

/** THE FIXER: designs the intervention. */
export interface InterventionPlanner {
  plan(input: {
    clock: number;
    assessment: RiskAssessment;
    signals: RiskSignal[];
    target: TargetProfile;
    claimedPersonId?: string;
  }): Promise<Intervention>;
}

/** THE GETAWAY DRIVER: the safe exit plan. */
export interface ExitPlanner {
  plan(input: { callerNumber: string; target: TargetProfile; verified: boolean }): Promise<ExitStep[]>;
}

export type MastermindTrigger =
  | 'operation-start'
  | 'conversation'
  | 'payment-submitted'
  | 'evidence-gathered'
  | 'intervention'
  | 'threat-confirmed'
  | 'mission-complete';

/** THE MASTERMIND: decides which crew members are needed. Future: Gemini orchestrator. */
export interface Mastermind {
  plan(trigger: MastermindTrigger, state: OperationState, newSignals?: RiskSignal[]): Promise<Deployment[]>;
  classifyThreat(signals: RiskSignal[]): Promise<ThreatClassification>;
}

export interface Crew {
  mastermind: Mastermind;
  grifter: ConversationAnalyst;
  lookout: PaymentMonitor;
  insideMan: IdentityVerifier;
  safecracker: RiskAssessor;
  fixer: InterventionPlanner;
  getaway: ExitPlanner;
}
