import { CREW } from '../data/crew';
import type { AgentId, RiskLevel } from '../types';
import { ledgerApi, type CompletePayload, type LedgerEntry, type LedgerEvent, type LedgerMode, type StampedEvent } from './ledgerApi';

/**
 * Records one operation's evidence trail.
 *
 *  - ALWAYS keeps an in-memory session ledger (works with no backend at all).
 *  - Mirrors events to Tiger Data in small batches when the ledger is online.
 *  - First failure ⇒ "offline" for the rest of this operation: no retry loops, no waiting.
 *    Persistence is secondary to intervention; nothing here can block the safety flow.
 */
export type LedgerConnection = 'connecting' | 'online' | 'offline';

export interface LedgerSnapshot {
  connection: LedgerConnection;
  operationId: string | null;
  entries: LedgerEntry[];
  completed: boolean;
  /** Every event so far reached Tiger Data */
  fullyPersisted: boolean;
  /** The completed operation is fully persisted and can be reconstructed from Tiger Data */
  syncedClose: boolean;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9$' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Same rule as the backend: identical, one phrase contains the other, or ≥60% word overlap. */
export function sameEvidence(a: string, b: string): boolean {
  if (a === b || ` ${b} `.includes(` ${a} `) || ` ${a} `.includes(` ${b} `)) return true;
  const wa = new Set(a.split(' ')), wb = new Set(b.split(' '));
  const inter = [...wa].filter((w) => wb.has(w)).length;
  return inter / new Set([...wa, ...wb]).size >= 0.6;
}

const AGENT_TITLE: Record<string, string> = { active: 'deployed', monitoring: 'monitoring', complete: 'stood down', standby: 'on standby' };
const name = (id: AgentId) => CREW[id].name.replace(/^The /, '').toUpperCase();

export class LedgerRecorder {
  private connection: LedgerConnection = 'connecting';
  private operationId: string | null = null;
  private entries: LedgerEntry[] = [];
  private queue: StampedEvent[] = [];
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> = Promise.resolve();
  private signalKeys = new Map<string, string[]>(); // type → normalised evidence seen
  private lastRisk: number | null = null;
  private agentState = new Map<AgentId, string>();
  private completed = false;
  private closing = false;
  private readonly startedAt = new Date().toISOString();
  private syncedClose = false;
  private failedEvents = 0;
  private listeners = new Set<() => void>();
  private snapshot: LedgerSnapshot;
  private opening: Promise<void>;

  constructor(private mode: LedgerMode, private scenario?: string) {
    this.entries.push({ at: this.startedAt, kind: 'operation_started', agent: 'mastermind', title: 'Operation started', detail: scenario ?? null });
    this.snapshot = this.makeSnapshot();
    this.opening = this.open();
  }

  // ─────────── React integration ───────────
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;
  private makeSnapshot(): LedgerSnapshot {
    return { connection: this.connection, operationId: this.operationId, entries: [...this.entries], completed: this.completed, fullyPersisted: this.connection === 'online' && this.failedEvents === 0, syncedClose: this.syncedClose };
  }
  private emit() {
    this.snapshot = this.makeSnapshot();
    this.listeners.forEach((l) => l());
  }

  // ─────────── Connection ───────────
  private async open() {
    const r = await ledgerApi.create(this.mode, this.scenario, this.startedAt);
    if (!r) {
      this.goOffline();
      return;
    }
    this.operationId = r.id;
    this.connection = 'online';
    this.emit();
    this.schedule(0);
  }

  private goOffline() {
    this.connection = 'offline';
    this.queue = [];
    this.emit();
  }

  private schedule(ms = 300) {
    if (this.connection !== 'online' || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flushing = this.flushing.then(() => this.flush());
    }, ms);
  }

  private async flush() {
    if (this.connection !== 'online' || !this.operationId) return;
    while (this.queue.length) {
      const batch = this.queue.splice(0, 100);
      const ok = await ledgerApi.append(this.operationId, batch);
      if (!ok) {
        this.failedEvents += batch.length;
        this.goOffline();
        return;
      }
    }
  }

  private push(event: LedgerEvent) {
    if (this.completed) return;
    const stamped = { ...event, occurred_at: new Date().toISOString(), seq: ++this.seq } as StampedEvent;
    if (this.connection !== 'offline') {
      this.queue.push(stamped);
      this.schedule();
    }
  }

  private local(entry: Omit<LedgerEntry, 'at'>) {
    this.entries.push({ at: new Date().toISOString(), ...entry });
  }

  // ─────────── Recording API ───────────

  /** Returns true if this is new evidence (not seen before in this operation). */
  signal(s: Extract<LedgerEvent, { kind: 'signal' }>): boolean {
    const ev = norm(s.evidence || s.label);
    const seen = this.signalKeys.get(s.signal_type) ?? [];
    const isNew = !seen.some((k) => sameEvidence(k, ev));
    // Repeats are still sent: the database counts them on the existing row, never as a new row.
    this.push(s);
    if (isNew) {
      this.signalKeys.set(s.signal_type, [...seen, ev]);
      this.local({ kind: 'signal', agent: s.detected_by, title: `${s.label} detected`, detail: s.explanation ?? null, evidence: s.evidence ?? null });
      this.emit();
    }
    return isNew;
  }

  risk(score: number, level: RiskLevel, reason?: string) {
    if (score === this.lastRisk) return;
    const verb = this.lastRisk === null || score > this.lastRisk ? 'increased' : 'decreased';
    this.lastRisk = score;
    this.push({ kind: 'risk', score, level, reason });
    this.local({ kind: 'risk', agent: 'safecracker', title: `Risk ${verb} to ${score}: ${level.toUpperCase()}`, score, level, detail: reason ?? null });
    this.emit();
  }

  agent(agent: AgentId, action: 'active' | 'monitoring' | 'standby' | 'complete', reason?: string) {
    if (this.agentState.get(agent) === action) return;
    this.agentState.set(agent, action);
    this.push({ kind: 'agent', agent, action, reason: reason?.slice(0, 240) });
    this.local({ kind: 'agent', agent, title: `${name(agent)} ${AGENT_TITLE[action]}`, detail: reason ?? null });
    this.emit();
  }

  intervention(triggerScore: number, reasons: string[]) {
    const r = reasons.slice(0, 12).map((x) => x.slice(0, 80));
    this.push({ kind: 'intervention', trigger_score: triggerScore, reasons: r });
    this.local({ kind: 'intervention', agent: 'fixer', title: 'Intervention triggered', detail: r.join(' · '), score: triggerScore, level: 'critical' });
    this.emit();
  }

  action(id: Extract<LedgerEvent, { kind: 'action' }>['action_selected'], title: string) {
    this.push({ kind: 'action', action_selected: id, title: title.slice(0, 160) });
    this.local({ kind: 'action_selected', agent: 'fixer', title });
    this.emit();
  }

  outcome(text: string, agent?: AgentId) {
    this.push({ kind: 'outcome', outcome: text.slice(0, 200), agent });
    this.local({ kind: 'outcome', agent: agent ?? null, title: text });
    this.emit();
  }

  milestone(milestone: Extract<LedgerEvent, { kind: 'milestone' }>['milestone'], title: string, detail?: string, agent?: AgentId) {
    this.push({ kind: 'milestone', milestone, title: title.slice(0, 160), detail: detail?.slice(0, 300), agent });
    this.local({ kind: milestone, agent: agent ?? null, title, detail: detail ?? null });
    this.emit();
  }

  /** Close the operation. Resolves once Tiger Data has everything (or immediately if offline). */
  async complete(body: CompletePayload): Promise<void> {
    if (this.closing) return; // set synchronously: repeated calls can't double-close
    this.closing = true;
    await this.opening;
    this.local({ kind: 'operation_closed', agent: 'mastermind', title: 'Operation closed', detail: body.outcome ?? null });
    this.completed = true;
    this.emit();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flushing = this.flushing.then(() => this.flush());
    await this.flushing;
    if (this.connection === 'online' && this.operationId) {
      const ok = await ledgerApi.complete(this.operationId, body);
      if (!ok) this.goOffline();
      else this.syncedClose = this.failedEvents === 0;
    }
    this.emit();
  }
}
