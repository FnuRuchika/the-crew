/**
 * THE CREW — domain model.
 *
 * These types are deliberately backend-friendly (plain JSON, no class instances)
 * so the same shapes can later be returned by a FastAPI service or persisted
 * to Tiger Data / PostgreSQL without translation.
 */

// ───────────────────────── Agents ─────────────────────────

export type AgentId =
  | 'mastermind'
  | 'grifter'
  | 'lookout'
  | 'insideMan'
  | 'safecracker'
  | 'fixer'
  | 'getaway';

/** standby = not needed yet · monitoring = watching passively · active = working · complete = done */
export type AgentStatus = 'standby' | 'monitoring' | 'active' | 'complete';

export interface Agent {
  id: AgentId;
  /** Display name, e.g. "The Grifter" */
  name: string;
  /** Short dossier number, e.g. "02" */
  fileNo: string;
  role: string;
  tagline: string;
  specialties: string[];
  /** Plain-language description of when the Mastermind brings this agent in */
  deployedWhen: string;
}

export interface AgentRuntime {
  status: AgentStatus;
  /** Latest thing this agent said / did — shown on its card */
  note?: string;
  /** Simulated mission clock (seconds) when first activated */
  activatedAt?: number;
}

/** A Mastermind decision: change an agent's status, with a reason. */
export interface Deployment {
  agentId: AgentId;
  status: AgentStatus;
  reason: string;
}

// ───────────────────────── Signals & risk ─────────────────────────

export type SignalCategory =
  | 'emergency-claim'
  | 'emotional-leverage'
  | 'urgency'
  | 'isolation'
  | 'authority'
  | 'pressure-escalation'
  | 'new-recipient'
  | 'unusual-amount'
  | 'identity-mismatch';

export type Severity = 'low' | 'medium' | 'high';

export interface RiskSignal {
  id: string;
  category: SignalCategory;
  label: string;
  /** Situation-specific, plain-language explanation shown to the user */
  detail: string;
  /** Exact phrase or data point that triggered the signal */
  evidence?: string;
  /** Conversation event the evidence came from, if any */
  sourceEventId?: string;
  detectedBy: AgentId;
  detectedAt: number;
  severity: Severity;
}

export type RiskLevel = 'low' | 'elevated' | 'high' | 'critical';

export interface RiskContribution {
  signalId: string;
  category: SignalCategory;
  /** Percentage points this signal added to the overall score */
  delta: number;
}

export interface RiskAssessment {
  score: number; // 0–100
  level: RiskLevel;
  contributions: RiskContribution[];
}

export interface RiskPoint {
  at: number;
  score: number;
}

// ───────────────────────── Conversation ─────────────────────────

export type Speaker = 'caller' | 'target' | 'system';

export interface ConversationEvent {
  id: string;
  /** Seconds since the call began (simulated clock) */
  at: number;
  speaker: Speaker;
  text: string;
  /** The person the caller is claiming to speak about / for (KnownPerson.id) */
  claimsIdentityOf?: string;
}

// ───────────────────────── People & money ─────────────────────────

export interface KnownPerson {
  id: string;
  name: string;
  relationship: string;
  /** Phone number on file — the trusted channel */
  phone: string;
}

export interface TrustedContact extends KnownPerson {
  /** Lower = asked first */
  priority: number;
  note: string;
}

export interface PayeeHistory {
  name: string;
  timesPaid: number;
  typicalAmount: number;
  lastPaid: string;
}

export interface TargetProfile {
  id: string;
  name: string;
  age: number;
  location: string;
  phone: string;
  account: { label: string; balance: number };
  knownPeople: KnownPerson[];
  trustedContacts: TrustedContact[];
  payees: PayeeHistory[];
}

export interface Recipient {
  name: string;
  account: string;
}

export type PaymentStatus = 'draft' | 'submitted' | 'held' | 'stopped' | 'sent';

export interface Payment {
  id: string;
  amount: number;
  currency: 'USD';
  recipient: Recipient;
  fromAccount: string;
  method: string;
  memo?: string;
  status: PaymentStatus;
}

// ───────────────────────── Intervention ─────────────────────────

export type InterventionActionId =
  | 'call-trusted-contact'
  | 'verify-claimed-person'
  | 'wait'
  | 'exit';

export interface InterventionAction {
  id: InterventionActionId;
  label: string;
  description: string;
  recommended?: boolean;
  /** Person to call on a trusted (on-file) number */
  contactId?: string;
}

export interface Intervention {
  id: string;
  triggeredAt: number;
  riskScore: number;
  headline: string;
  message: string;
  reasons: RiskSignal[];
  actions: InterventionAction[];
  chosenAction?: InterventionActionId;
}

export interface VerificationLine {
  speaker: 'contact' | 'target';
  text: string;
}

/** Server-side voice roles (backend/services/elevenlabs_service.py: VoiceRole). */
export type VoiceRole = 'caller' | 'guardian' | 'family_female' | 'family_male';

export interface VerificationScript {
  contactId: string;
  /** Voice used for this contact's lines in voice mode */
  voiceRole?: VoiceRole;
  lines: VerificationLine[];
  /** Mission-log summary once verification completes */
  finding: string;
}

export type VerificationStage = 'dialing' | 'connected' | 'confirmed';

export interface VerificationState {
  contact: KnownPerson;
  stage: VerificationStage;
  transcript: VerificationLine[];
  finding?: string;
}

export interface ExitStep {
  id: string;
  title: string;
  detail: string;
}

// ───────────────────────── Mission ─────────────────────────

export interface ThreatClassification {
  type: string;
  summary: string;
  confidence: number; // 0–1
}

export type MissionStatus = 'standby' | 'active' | 'intervening' | 'complete';

export interface Mission {
  id: string;
  caseNumber: string;
  title: string;
  status: MissionStatus;
  target: TargetProfile;
  callerNumber: string;
  threat?: ThreatClassification;
}

export type MissionEventType =
  | 'operation'
  | 'conversation'
  | 'signal'
  | 'deployment'
  | 'payment'
  | 'assessment'
  | 'intervention'
  | 'verification'
  | 'outcome';

export interface MissionEvent {
  id: string;
  /** Seconds since operation start (simulated clock) */
  at: number;
  type: MissionEventType;
  agent?: AgentId;
  title: string;
  detail?: string;
  riskScore?: number;
}

// ───────────────────────── Scenario (mock data) ─────────────────────────

/** One "beat" of the story — advanced by NEXT EVENT. */
export interface ScenarioBeat {
  id: string;
  messages: ConversationEvent[];
  /** If set, this beat ends with the target opening a payment */
  opensPayment?: boolean;
}

export interface Scenario {
  id: string;
  caseNumber: string;
  title: string;
  target: TargetProfile;
  callerNumber: string;
  beats: ScenarioBeat[];
  payment: Omit<Payment, 'status'>;
  /** Simulated time at which the target submits the payment */
  paymentAt: number;
  /** Pressure message used if the target chooses to wait */
  pressureMessage: ConversationEvent;
  verifications: VerificationScript[];
}

// ───────────────────────── Operation (UI state) ─────────────────────────

export type OperationPhase =
  | 'briefing'
  | 'live'
  | 'payment'
  | 'analyzing'
  | 'intervention'
  | 'verifying'
  | 'cooldown'
  | 'exit'
  | 'protected';

export interface OperationState {
  phase: OperationPhase;
  mission: Mission;
  beatIndex: number;
  clock: number;
  messages: ConversationEvent[];
  signals: RiskSignal[];
  assessment: RiskAssessment;
  riskHistory: RiskPoint[];
  agents: Record<AgentId, AgentRuntime>;
  log: MissionEvent[];
  payment: Payment | null;
  intervention: Intervention | null;
  verification: VerificationState | null;
  exitPlan: ExitStep[];
  /** Agent currently "speaking" — used for spotlight animation */
  spotlight: { agentId: AgentId; title: string; reason: string; key: number } | null;
}
