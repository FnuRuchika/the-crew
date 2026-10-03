import { motion } from 'framer-motion';
import { Check, Landmark, Loader2, Lock, Send } from 'lucide-react';
import { AgentAvatar } from '../components/crew/AgentCard';
import { Button } from '../components/ui/primitives';
import { CREW } from '../data/crew';
import { cx, formatMoney } from '../lib/format';
import type { AgentId, AgentRuntime, OperationPhase, Payment, RiskSignal } from '../types';

const ANALYSTS: AgentId[] = ['lookout', 'insideMan', 'safecracker'];

function AnalysisRow({ id, runtime, findings }: { id: AgentId; runtime: AgentRuntime; findings: RiskSignal[] }) {
  const working = runtime.status === 'active' && (id === 'safecracker' ? !runtime.note?.startsWith('Verdict') : findings.length === 0);
  const done = !working && runtime.activatedAt !== undefined;
  return (
    <li className={cx('flex items-start gap-3 rounded-lg border p-3 transition-colors', done ? 'border-vault-600 bg-vault-900/60' : 'border-vault-700')}>
      <AgentAvatar id={id} status={runtime.status} size={34} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-display text-sm uppercase tracking-wider text-zinc-100">
          {CREW[id].name.replace(/^The /, '')}
          {working && <Loader2 size={13} className="animate-spin text-gold-400" aria-label="working" />}
          {done && <Check size={14} className="text-emerald-400" aria-label="done" />}
        </p>
        {runtime.activatedAt === undefined ? (
          <p className="text-sm text-zinc-500">Standing by…</p>
        ) : id === 'safecracker' ? (
          <p className="text-sm text-zinc-300">{working ? 'Combining evidence…' : runtime.note}</p>
        ) : findings.length ? (
          <ul className="mt-0.5 space-y-0.5">
            {findings.map((f) => (
              <motion.li key={f.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="text-sm text-red-200">
                • {f.label}
                {f.category === 'identity-mismatch' && f.evidence ? `: ${f.evidence}` : ''}
              </motion.li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-300">{runtime.note}</p>
        )}
      </div>
    </li>
  );
}

export function PaymentPanel({
  payment,
  phase,
  agents,
  signals,
  onSubmit,
  busy,
  targetName,
}: {
  payment: Payment;
  phase: OperationPhase;
  agents: Record<AgentId, AgentRuntime>;
  signals: RiskSignal[];
  onSubmit: () => void;
  busy: boolean;
  targetName: string;
}) {
  const analyzing = phase !== 'payment';
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel flex h-full min-h-0 flex-col overflow-hidden"
      aria-label="Payment attempt"
    >
      <header className="flex items-center justify-between border-b border-vault-700 bg-sky-500/[0.06] px-4 py-2.5">
        <h2 className="op-label flex items-center gap-2 text-sky-300">
          <Landmark size={13} aria-hidden /> Payment attempt · {targetName.split(' ')[0]}'s banking app
        </h2>
        <span className={cx('rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider', analyzing ? 'border-gold-500/50 text-gold-300' : 'border-vault-600 text-zinc-400')}>
          {payment.status === 'draft' ? 'Draft' : payment.status === 'submitted' ? 'Under review' : payment.status}
        </span>
      </header>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        <div className="rounded-xl border border-vault-600 bg-gradient-to-b from-vault-800 to-vault-900 p-4">
          <p className="op-label text-[10px]">Send money</p>
          <p className="mt-1 font-display text-5xl font-semibold tracking-tight text-zinc-50 tabular-nums">
            {formatMoney(payment.amount, { cents: true })}
          </p>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
            <dt className="text-zinc-500">To</dt>
            <dd className="font-semibold text-zinc-100">{payment.recipient.name}</dd>
            <dt className="text-zinc-500">Account</dt>
            <dd className="font-mono text-sm text-zinc-300">{payment.recipient.account}</dd>
            <dt className="text-zinc-500">From</dt>
            <dd className="text-zinc-300">{payment.fromAccount}</dd>
            <dt className="text-zinc-500">Method</dt>
            <dd className="text-zinc-300">{payment.method}</dd>
            {payment.memo && (
              <>
                <dt className="text-zinc-500">Memo</dt>
                <dd className="text-zinc-300">{payment.memo}</dd>
              </>
            )}
          </dl>
        </div>

        {!analyzing ? (
          <Button size="lg" className="mt-4 w-full" onClick={onSubmit} disabled={busy}>
            <Send size={18} aria-hidden /> Send {formatMoney(payment.amount)} now
          </Button>
        ) : (
          <div className="mt-4">
            <p className="flex items-center gap-2 text-[15px] text-gold-200">
              <Lock size={16} aria-hidden /> Hold on. The crew is checking this payment before it leaves.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {ANALYSTS.map((id) => (
                <AnalysisRow key={id} id={id} runtime={agents[id]} findings={signals.filter((s) => s.detectedBy === id)} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.section>
  );
}
