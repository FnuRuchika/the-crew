import { motion } from 'framer-motion';
import { Database, HardDrive, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AGENT_ICONS } from '../components/crew/agentVisuals';
import { Panel } from '../components/ui/primitives';
import { CREW } from '../data/crew';
import { cx, formatDuration, formatMoney } from '../lib/format';
import type { AgentId } from '../types';
import { ledgerApi, type LedgerEntry, type RemoteLedger } from './ledgerApi';
import type { LedgerSnapshot } from './LedgerRecorder';

const KIND_TONE: Record<string, string> = {
  operation_started: 'text-gold-300',
  operation_closed: 'text-emerald-300',
  signal: 'text-red-300',
  risk: 'text-orange-300',
  agent: 'text-gold-400',
  intervention: 'text-red-300',
  action_selected: 'text-gold-300',
  verification: 'text-emerald-300',
  outcome: 'text-emerald-300',
  payment_initiated: 'text-sky-300',
  segment_analyzed: 'text-zinc-400',
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const who = (e: LedgerEntry) =>
  e.kind === 'operation_started' || e.kind === 'operation_closed'
    ? 'OPERATION'
    : e.kind === 'verification'
      ? 'TRUSTED VERIFICATION'
      : e.agent
        ? CREW[e.agent as AgentId]?.name.replace(/^The /, '').toUpperCase()
        : 'CREW';

const ALWAYS = new Set(['operation_started', 'operation_closed', 'signal', 'intervention', 'action_selected', 'verification', 'outcome', 'payment_initiated']);

/**
 * Judge-facing view: the story of the decision. Everything stays in Tiger Data; this only
 * hides low-value lifecycle rows (stand-downs, monitoring/standby updates, intermediate risk
 * steps within the same level, segment metadata) until "Show full audit trail" is pressed.
 */
export function keyEvents(entries: LedgerEntry[]): LedgerEntry[] {
  const risks = entries.filter((e) => e.kind === 'risk' && e.score != null);
  const peak = risks.reduce<LedgerEntry | null>((best, e) => (!best || (e.score ?? 0) > (best.score ?? 0) ? e : best), null);
  const deployed = new Set<string>();
  let lastLevel: string | null = null;
  return entries.filter((e) => {
    if (ALWAYS.has(e.kind)) return true;
    if (e.kind === 'risk') {
      const levelChange = e.level !== lastLevel;
      lastLevel = e.level ?? lastLevel;
      return levelChange || e === peak;
    }
    if (e.kind === 'agent') {
      const isDeploy = / deployed$/.test(e.title) && e.agent && e.agent !== 'mastermind' && !deployed.has(e.agent);
      if (isDeploy) deployed.add(e.agent!);
      return Boolean(isDeploy);
    }
    return false; // segment_analyzed, notes and other internals
  });
}

/**
 * THE CREW's black box. When the operation reached Tiger Data, the timeline below is
 * reconstructed from the database; otherwise it shows the in-memory session copy.
 */
export function EvidenceLedger({ snapshot, waitForSync = true }: { snapshot: LedgerSnapshot; waitForSync?: boolean }) {
  const [remote, setRemote] = useState<RemoteLedger | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'failed'>('idle');
  const [fullTrail, setFullTrail] = useState(false);
  const fetched = useRef<string | null>(null);
  const ready = snapshot.operationId && snapshot.connection === 'online' && (!waitForSync || snapshot.syncedClose);

  useEffect(() => {
    if (!ready || !snapshot.operationId || fetched.current === snapshot.operationId) return;
    fetched.current = snapshot.operationId; // one fetch per operation (also under StrictMode)
    setState('loading');
    void ledgerApi.ledger(snapshot.operationId).then((r) => {
      setRemote(r);
      setState(r ? 'loaded' : 'failed');
    });
  }, [ready, snapshot.operationId]);

  const fromDb = state === 'loaded' && remote;
  const waiting = !fromDb && snapshot.connection !== 'offline' && state !== 'failed' && (state === 'loading' || (waitForSync && snapshot.completed && !snapshot.syncedClose) || snapshot.connection === 'connecting');
  const allEntries = fromDb ? remote.entries : snapshot.entries;
  const entries = fullTrail ? allEntries : keyEvents(allEntries);
  const sum = fromDb ? remote.summary : null;

  return (
    <Panel
      title="Evidence ledger"
      icon={<Database size={13} aria-hidden />}
      right={
        fromDb ? (
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-300">
            <Database size={12} aria-hidden /> Reconstructed from Tiger Data · OP-{remote.operation.id.slice(0, 8).toUpperCase()}
          </span>
        ) : waiting ? (
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
            <Loader2 size={12} className="animate-spin" aria-hidden /> Syncing ledger…
          </span>
        ) : (
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-500" title="The evidence ledger was unreachable. This is the copy kept in this session.">
            <HardDrive size={12} aria-hidden /> Ledger offline · session copy
          </span>
        )
      }
    >
      <div className="p-6">
        {sum && (
          <dl className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Peak risk', `${sum.peak_risk}%`],
              ['Signals', `${sum.signals_detected}${sum.repeat_observations ? ` (+${sum.repeat_observations} repeats)` : ''}`],
              ['Crew deployed', String(sum.crew_deployed.length)],
              ['Intervention', sum.intervention ? `at ${sum.intervention.trigger_score}%` : 'None'],
              ['To critical', remote?.escalation.seconds_to_critical != null ? formatDuration(remote.escalation.seconds_to_critical) : '—'],
              ['Protected', sum.amount_protected != null ? formatMoney(sum.amount_protected) : sum.outcome ? 'Safe exit' : '—'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-vault-700 bg-vault-900/70 px-3 py-2">
                <dt className="op-label text-[10px]">{k}</dt>
                <dd className="mt-0.5 font-display text-lg text-zinc-100">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        <ol className="relative ml-2 border-l border-vault-600" aria-label="Evidence ledger, chronological">
          {entries.map((e, i) => {
            const Icon = e.agent ? AGENT_ICONS[e.agent as AgentId] : null;
            return (
              <motion.li
                key={`${e.at}-${i}`}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.03, 1) }}
                className="relative grid grid-cols-[76px_1fr] gap-3 pb-4 pl-5 last:pb-0"
              >
                <span className={cx('absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 bg-vault-900', e.kind === 'signal' || e.kind === 'intervention' ? 'border-red-400' : e.kind.startsWith('operation') || e.kind === 'outcome' || e.kind === 'verification' ? 'border-emerald-400' : 'border-gold-500')} aria-hidden />
                <time className="pt-0.5 font-mono text-xs tabular-nums text-zinc-500" dateTime={e.at}>
                  {clock(e.at)}
                </time>
                <div className="min-w-0">
                  <p className={cx('flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest', KIND_TONE[e.kind] ?? 'text-zinc-400')}>
                    {Icon && <Icon size={12} aria-hidden />} {who(e)}
                  </p>
                  <p className="text-[15px] text-zinc-100">
                    {e.title}
                    {e.times_seen && e.times_seen > 1 ? <span className="ml-2 font-mono text-xs text-zinc-500">seen ×{e.times_seen}</span> : null}
                  </p>
                  {e.evidence && <p className="mt-0.5 text-sm text-zinc-300">Evidence: <span className="italic">“{e.evidence}”</span></p>}
                  {e.detail && e.kind !== 'signal' && <p className="mt-0.5 text-sm text-zinc-500">{e.detail}</p>}
                </div>
              </motion.li>
            );
          })}
        </ol>

        {allEntries.length > entries.length || fullTrail ? (
          <div className="mt-5 flex items-center justify-center gap-3 font-mono text-[11px] text-zinc-500">
            <span>
              {fullTrail ? `Full audit trail · ${allEntries.length} events` : `${entries.length} key events of ${allEntries.length}`}
            </span>
            <button onClick={() => setFullTrail((v) => !v)} aria-pressed={fullTrail} className="rounded border border-vault-600 px-2 py-0.5 uppercase tracking-wider text-zinc-400 hover:border-gold-500/60 hover:text-zinc-200">
              {fullTrail ? 'Show key events' : 'Show full audit trail'}
            </button>
          </div>
        ) : null}

        {fromDb && <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-600">Operational intelligence powered by Tiger Data</p>}
      </div>
    </Panel>
  );
}
