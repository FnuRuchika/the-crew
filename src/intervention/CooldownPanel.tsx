import { motion } from 'framer-motion';
import { Clock, Drama, HeartHandshake, PhoneCall, PhoneOff, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/primitives';
import { formatMoney } from '../lib/format';
import type { ConversationEvent, Intervention, InterventionActionId, Payment } from '../types';

/** Demo acceleration: 10 simulated minutes play out in ~20 real seconds. */
const TOTAL = 600;
const SPEED = 30;

const ICON: Partial<Record<InterventionActionId, LucideIcon>> = {
  'call-trusted-contact': HeartHandshake,
  'verify-claimed-person': PhoneCall,
  exit: PhoneOff,
};

export function CooldownPanel({
  intervention,
  payment,
  pressure,
  onPressure,
  onChoose,
  busy,
}: {
  intervention: Intervention;
  payment: Payment;
  pressure?: ConversationEvent;
  onPressure: () => void;
  onChoose: (id: InterventionActionId) => void;
  busy: boolean;
}) {
  const [remaining, setRemaining] = useState(TOTAL);
  const pressured = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - SPEED / 4)), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!pressured.current && remaining <= TOTAL - 120) {
      pressured.current = true;
      onPressure();
    }
  }, [remaining, onPressure]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(Math.floor(remaining % 60)).padStart(2, '0');
  const done = remaining === 0;
  const actions = intervention.actions.filter((a) => a.id !== 'wait');

  return (
    <div className="rounded-2xl border border-gold-500/40 bg-vault-900 p-6 sm:p-9" role="dialog" aria-modal="true" aria-labelledby="cool-title">
      <p className="op-label flex items-center gap-2 text-gold-300">
        <Clock size={14} aria-hidden /> The Fixer · Cool-down
      </p>
      <h2 id="cool-title" className="mt-2 font-display text-3xl uppercase tracking-wide text-zinc-50 sm:text-4xl">
        {done ? 'Cool-down complete' : 'Taking a breath'}
      </h2>
      <div className="mt-6 flex flex-wrap items-center gap-8">
        <p className="font-display text-8xl font-semibold tabular-nums text-gold-300" role="timer" aria-label={`${mm} minutes ${ss} seconds remaining`}>
          {mm}:{ss}
        </p>
        <div className="max-w-md space-y-2 text-lg text-zinc-200">
          <p>
            Your {formatMoney(payment.amount)} payment is <strong className="text-gold-200">on hold</strong>.
          </p>
          <p className="text-zinc-400">Scammers rely on speed. A real emergency will still be real in ten minutes.</p>
          <p className="font-mono text-xs text-zinc-600">Demo: time runs {SPEED}× faster.</p>
        </div>
      </div>

      {pressure && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-xl border border-red-500/40 bg-red-500/5 p-4">
          <p className="op-label text-red-300">The caller is pushing</p>
          <p className="mt-1 text-xl text-zinc-100">“{pressure.text}”</p>
          <p className="mt-2 flex items-center gap-2 text-base text-zinc-300">
            <Drama size={18} className="text-gold-400" aria-hidden />
            <span><strong className="text-gold-300">The Grifter:</strong> this is pressure escalation. Anyone who truly needs your help would understand a short pause.</span>
          </p>
        </motion.div>
      )}

      <p className="mt-6 text-lg text-zinc-300">
        {done ? 'The payment stays on hold until it is verified. What would you like to do?' : "Don't wait if you don't have to:"}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {actions.map((a) => {
          const Icon = ICON[a.id] ?? Clock;
          return (
            <Button key={a.id} variant={a.recommended ? 'success' : 'secondary'} size="xl" onClick={() => onChoose(a.id)} disabled={busy} className="h-full flex-col items-start gap-1 py-4 text-left">
              <span className="flex items-center gap-2 font-display text-xl uppercase tracking-wider">
                <Icon size={22} aria-hidden /> {a.label}
              </span>
              <span className={a.recommended ? 'text-sm font-medium text-vault-950/75' : 'text-sm font-normal text-zinc-400'}>{a.description}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
