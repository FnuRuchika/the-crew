import { CREW } from '../data/crew';
import type { LiveAssessment } from '../engine/liveRiskEngine';
import type { LiveSignal, LiveSignalType } from '../live-analysis/types';
import type { AgentId, AgentRuntime, Deployment, Intervention, RiskSignal, SignalCategory } from '../types';

/**
 * Live Call session logic: pure functions, no React, no network.
 * A session is a growing conversation; evidence accumulates across segments but is
 * de-duplicated and scored with the same deterministic engine as TEST THE CREW.
 */

export type SegmentStatus = 'transcribing' | 'transcribed' | 'stt-failed';

export interface Segment {
  id: string;
  n: number;
  at: number; // session seconds
  source: 'mic' | 'demo';
  status: SegmentStatus;
  text?: string;
  error?: string;
  sttModel?: string;
  sttLatencyMs?: number;
}

/** A signal in the session ledger, tied to the segment where its evidence was heard. */
export interface LedgerSignal extends LiveSignal {
  key: string;
  segmentId?: string;
  firstSeenAt: number;
}

export const MAX_ANALYSIS_CHARS = 1800; // backend limit is 2000

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9$' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Conversation text sent to Gemini: the most recent segments that fit, oldest first. */
export function buildAnalysisText(segments: Segment[]): string {
  const lines: string[] = [];
  let used = 0;
  for (const s of [...segments].reverse()) {
    if (s.status !== 'transcribed' || !s.text) continue;
    const line = `CALLER: ${s.text}`;
    if (used + line.length + 1 > MAX_ANALYSIS_CHARS) {
      if (!lines.length) lines.unshift(line.slice(0, MAX_ANALYSIS_CHARS));
      break;
    }
    lines.unshift(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}

/** Find where a phrase occurs in some text (case/punctuation-insensitive). */
export function findPhrase(text: string, phrase: string): [number, number] | null {
  if (!phrase.trim()) return null;
  const i = text.toLowerCase().indexOf(phrase.toLowerCase().trim());
  if (i >= 0) return [i, i + phrase.trim().length];
  const words = norm(phrase).split(' ').filter(Boolean).map((w) => w.replace(/[$']/g, (c) => `\\${c}`));
  if (!words.length) return null;
  const m = new RegExp(words.join("[^a-z0-9$']+"), 'i').exec(text);
  return m ? [m.index, m.index + m[0].length] : null;
}

/**
 * Merge a fresh Gemini analysis of the conversation into the ledger.
 * Same tactic + same evidence ⇒ one entry (strongest confidence kept), so re-analysing
 * the whole conversation every segment never inflates the score.
 */
export function mergeSignals(ledger: LedgerSignal[], fresh: LiveSignal[], segments: Segment[], at: number): LedgerSignal[] {
  const out = ledger.map((s) => ({ ...s }));
  for (const sig of fresh) {
    const key = `${sig.type}|${norm(sig.evidence)}`;
    const existing = out.find((s) => s.key === key);
    if (existing) {
      if (sig.confidence > existing.confidence) Object.assign(existing, { confidence: sig.confidence, explanation: sig.explanation, label: sig.label });
      existing.evidence_verbatim = existing.evidence_verbatim || sig.evidence_verbatim;
      continue;
    }
    const seg = [...segments].reverse().find((s) => s.text && findPhrase(s.text, sig.evidence));
    out.push({ ...sig, key, segmentId: seg?.id, firstSeenAt: at });
  }
  return out;
}

// ─────────── Live Mastermind: deploy only what the evidence calls for ───────────

const MANIPULATION: LiveSignalType[] = [
  'artificial_urgency', 'emotional_leverage', 'authority_impersonation', 'isolation_secrecy',
  'family_emergency', 'romance_manipulation', 'prize_investment_claim', 'suspicious_link', 'other_manipulation',
];
const MONEY: LiveSignalType[] = ['unusual_payment_request'];
const ACCESS: LiveSignalType[] = ['credential_request', 'remote_access_request'];
const IDENTITY_CLAIM: LiveSignalType[] = ['authority_impersonation', 'family_emergency'];

export interface CrewUpdate {
  deployments: Deployment[];
  /** Mastermind narration, e.g. "Payment request identified." */
  notes: string[];
}

export function planLiveCrew(input: {
  agents: Record<AgentId, AgentRuntime>;
  ledger: LedgerSignal[];
  assessment: LiveAssessment;
  claimedIdentity: string | null;
}): CrewUpdate {
  const { agents, ledger, assessment, claimedIdentity } = input;
  const has = (types: LiveSignalType[]) => ledger.filter((s) => types.includes(s.type) && s.confidence >= 0.35);
  const fresh = (id: AgentId) => agents[id].activatedAt === undefined;
  const deployments: Deployment[] = [];
  const notes: string[] = [];
  const labels = (xs: LedgerSignal[]) => [...new Set(xs.map((s) => s.label))].slice(0, 3).join(' · ');

  const manip = has(MANIPULATION);
  if (manip.length) {
    if (fresh('grifter')) notes.push('Manipulation language detected.', 'Deploying GRIFTER.');
    deployments.push({ agentId: 'grifter', status: 'active', reason: labels(manip) });
  }

  const money = has(MONEY);
  const access = has(ACCESS);
  if (money.length || access.length) {
    if (fresh('lookout')) notes.push(money.length ? 'Payment request identified.' : 'Account access request identified.', 'Deploying LOOKOUT.');
    deployments.push({ agentId: 'lookout', status: 'active', reason: labels([...money, ...access]) });
  }

  if (claimedIdentity && has(IDENTITY_CLAIM).length) {
    if (fresh('insideMan')) notes.push(`Caller claims to be: ${claimedIdentity}.`, 'Deploying INSIDE MAN.');
    deployments.push({ agentId: 'insideMan', status: 'active', reason: `"${claimedIdentity}" can't be verified on this call. Use a number you already trust.` });
  }

  if (assessment.countedSignals >= 2) {
    if (fresh('safecracker')) notes.push('Evidence corroborated.', 'Deploying SAFECRACKER.');
    deployments.push({ agentId: 'safecracker', status: 'active', reason: `Risk ${assessment.score}% · ${assessment.level.toUpperCase()} from ${assessment.countedSignals} tactics` });
  }

  if (assessment.level === 'critical' && fresh('fixer')) {
    notes.push('Critical risk. Deploying FIXER.');
    deployments.push({ agentId: 'fixer', status: 'active', reason: 'Strong warning signs. Offering safe options.' });
  }

  // Only report agents whose status or note actually changed.
  return {
    deployments: deployments.filter((d) => agents[d.agentId].status !== d.status || agents[d.agentId].note !== d.reason),
    notes,
  };
}

export function applyDeployments(agents: Record<AgentId, AgentRuntime>, deployments: Deployment[], at: number) {
  const next = { ...agents };
  for (const d of deployments) {
    next[d.agentId] = { status: d.status, note: d.reason, activatedAt: next[d.agentId].activatedAt ?? (d.status === 'active' || d.status === 'monitoring' ? at : undefined) };
  }
  return next;
}

export function initialLiveAgents(): Record<AgentId, AgentRuntime> {
  return Object.fromEntries((Object.keys(CREW) as AgentId[]).map((id) => [id, { status: 'standby' } as AgentRuntime])) as Record<AgentId, AgentRuntime>;
}

// ─────────── Bridge to the existing intervention design ───────────

const CATEGORY: Record<LiveSignalType, SignalCategory> = {
  artificial_urgency: 'urgency',
  emotional_leverage: 'emotional-leverage',
  authority_impersonation: 'authority',
  isolation_secrecy: 'isolation',
  family_emergency: 'emergency-claim',
  unusual_payment_request: 'unusual-amount',
  credential_request: 'unusual-amount',
  remote_access_request: 'identity-mismatch',
  suspicious_link: 'pressure-escalation',
  romance_manipulation: 'emotional-leverage',
  prize_investment_claim: 'pressure-escalation',
  other_manipulation: 'pressure-escalation',
};

const FAMILY: Record<LiveSignalType, RiskSignal['family']> = {
  unusual_payment_request: 'payment',
  credential_request: 'payment',
  remote_access_request: 'payment',
  authority_impersonation: 'identity',
  artificial_urgency: 'conversation', emotional_leverage: 'conversation', isolation_secrecy: 'conversation',
  family_emergency: 'conversation', suspicious_link: 'conversation', romance_manipulation: 'conversation',
  prize_investment_claim: 'conversation', other_manipulation: 'conversation',
};

export function agentForSignal(type: LiveSignalType): AgentId {
  return MONEY.includes(type) || ACCESS.includes(type) ? 'lookout' : 'grifter';
}

/** Strongest signal per tactic, as RiskSignals for the shared intervention UI. */
export function toRiskSignals(ledger: LedgerSignal[], assessment: LiveAssessment): RiskSignal[] {
  return assessment.contributions
    .filter((c) => c.status === 'counted')
    .sort((a, b) => b.delta - a.delta)
    .map((c) => {
      const s = ledger[c.index];
      return {
        id: s.key,
        category: CATEGORY[s.type],
        family: FAMILY[s.type],
        label: s.label,
        detail: s.explanation,
        evidence: s.evidence,
        detectedBy: agentForSignal(s.type),
        detectedAt: s.firstSeenAt,
        severity: s.confidence >= 0.7 ? 'high' : 'medium',
      };
    });
}

export function buildLiveIntervention(ledger: LedgerSignal[], assessment: LiveAssessment, at: number): Intervention {
  return {
    id: `live-int-${at}`,
    triggeredAt: at,
    riskScore: assessment.score,
    headline: 'Potential heist detected',
    message: "You don't need to make a decision or send money right now.",
    reasons: toRiskSignals(ledger, assessment),
    actions: [
      { id: 'exit', label: 'End the call', description: "Hang up now. You don't owe the caller an explanation.", recommended: true },
      { id: 'verify-claimed-person', label: 'Verify independently', description: 'Call the organisation or person back on a number you already trust.' },
      { id: 'call-trusted-contact', label: 'Call a trusted contact', description: 'Talk it through with someone you trust before doing anything.' },
    ],
  };
}

export const LIVE_EXIT_PLANS: Record<'exit' | 'verify-claimed-person' | 'call-trusted-contact', { id: string; title: string; detail: string }[]> = {
  exit: [
    { id: 'hang-up', title: 'Hang up the call', detail: "You don't need to explain or argue. Simply end the call." },
    { id: 'no-callback', title: "Don't use any number or link they gave you", detail: 'Callers can fake caller ID and send convincing links.' },
    { id: 'block', title: 'Block the number', detail: 'If they call back, you will not have to answer.' },
    { id: 'report', title: 'Report the attempt', detail: 'To your bank if they were mentioned, and to the FTC at reportfraud.ftc.gov.' },
  ],
  'verify-claimed-person': [
    { id: 'hang-up', title: 'End this call first', detail: 'Never verify on the same call: the caller controls that line.' },
    { id: 'lookup', title: 'Find a number you already trust', detail: 'The back of your card, a statement, the official website, or your saved contacts.' },
    { id: 'call', title: 'Call them yourself', detail: "Ask if the request is real. A legitimate organisation won't mind." },
    { id: 'wait', title: "Don't move money until you're sure", detail: 'Real problems can wait for you to check.' },
  ],
  'call-trusted-contact': [
    { id: 'hang-up', title: 'End this call', detail: "It's okay to say you'll call back." },
    { id: 'call', title: 'Call someone you trust', detail: 'Use a number already saved in your phone.' },
    { id: 'share', title: 'Tell them exactly what was said', detail: 'A second opinion breaks the pressure.' },
    { id: 'decide', title: 'Decide together, without rushing', detail: 'You can always verify before acting.' },
  ],
};

export const AGENT_NAME = (id: AgentId) => CREW[id].name.replace(/^The /, '').toUpperCase();
