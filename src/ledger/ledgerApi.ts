import type { AgentId, RiskLevel } from '../types';

/** Evidence Ledger API (backend → Tiger Data). Every call is short-timeout and never throws. */
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const TIMEOUT_MS = 4000;

export type LedgerMode = 'case_file' | 'typed' | 'live_call';

export type LedgerEvent =
  | { kind: 'signal'; signal_type: string; label: string; confidence?: number; severity?: 'low' | 'medium' | 'high'; evidence?: string; explanation?: string; detected_by: AgentId; source: 'scripted_rules' | 'payment_rules' | 'identity_rules' | 'gemini' }
  | { kind: 'risk'; score: number; level: RiskLevel; reason?: string }
  | { kind: 'agent'; agent: AgentId; action: 'active' | 'monitoring' | 'standby' | 'complete'; reason?: string }
  | { kind: 'intervention'; trigger_score: number; reasons: string[] }
  | { kind: 'action'; action_selected: 'call-trusted-contact' | 'verify-claimed-person' | 'wait' | 'exit'; title: string }
  | { kind: 'outcome'; outcome: string; agent?: AgentId }
  | { kind: 'milestone'; milestone: 'operation_started' | 'segment_analyzed' | 'payment_initiated' | 'verification' | 'note'; title: string; detail?: string; agent?: AgentId };

export type StampedEvent = LedgerEvent & { occurred_at: string; seq: number };

export interface CompletePayload {
  final_status: 'protected' | 'safe_exit' | 'assessed' | 'abandoned';
  peak_risk: number;
  amount_protected?: string;
  threat_type?: string;
  outcome?: string;
}

export interface LedgerEntry {
  at: string;
  kind: string;
  agent?: AgentId | null;
  title: string;
  detail?: string | null;
  evidence?: string | null;
  score?: number | null;
  level?: RiskLevel | null;
  times_seen?: number | null;
}

export interface RemoteLedger {
  source: 'tiger_data';
  operation: { id: string; mode: LedgerMode; status: string; started_at: string; ended_at: string | null; peak_risk: number; threat_type: string | null; outcome: string | null; amount_protected: number | null };
  summary: {
    peak_risk: number;
    signals_detected: number;
    repeat_observations: number;
    crew_deployed: AgentId[];
    intervention: { at: string; trigger_score: number; reasons: string[]; action_selected: string | null; outcome: string | null } | null;
    outcome: string | null;
    amount_protected: number | null;
  };
  escalation: { trajectory: { at: string; score: number }[]; first_signal_at: string | null; critical_at: string | null; seconds_to_critical: number | null };
  entries: LedgerEntry[];
}

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE}${path}`, { ...init, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const ledgerApi = {
  create: (mode: LedgerMode, scenario: string | undefined, startedAt: string) =>
    call<{ id: string; started_at: string }>('/api/operations', { method: 'POST', body: JSON.stringify({ mode, scenario, started_at: startedAt }) }),
  append: (id: string, events: StampedEvent[]) =>
    call<{ accepted: number; inserted: number; signals_new: number; signals_duplicate: number }>(`/api/operations/${id}/events`, { method: 'POST', body: JSON.stringify({ events }) }),
  complete: (id: string, body: CompletePayload) => call<{ ok: true }>(`/api/operations/${id}/complete`, { method: 'PATCH', body: JSON.stringify(body) }),
  ledger: (id: string) => call<RemoteLedger>(`/api/operations/${id}/ledger`),
};
