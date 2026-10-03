import { motion } from 'framer-motion';
import { CarFront, CircleCheck, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/primitives';
import { formatMoney } from '../lib/format';
import type { ExitStep, Payment } from '../types';

export function GetawayPanel({
  steps,
  payment,
  accountLabel,
  onComplete,
  busy,
}: {
  steps: ExitStep[];
  /** Optional: Live Call has no payment to stop */
  payment?: Payment;
  accountLabel?: string;
  onComplete: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-2xl border border-emerald-500/40 bg-vault-900 p-6 sm:p-9" role="dialog" aria-modal="true" aria-labelledby="exit-title">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-emerald-500/60 bg-emerald-500/10 p-5"
      >
        <ShieldCheck size={40} className="text-emerald-400" aria-hidden />
        <div>
          <p className="font-display text-3xl uppercase tracking-wider text-emerald-300">{payment ? 'Payment stopped' : "You're in control"}</p>
          <p className="text-lg text-zinc-200">
            {payment
              ? `${formatMoney(payment.amount)} stays in ${accountLabel}. Nothing was sent to ${payment.recipient.name}.`
              : 'Nothing has been sent. Take your time: the safe steps are below.'}
          </p>
        </div>
      </motion.div>

      <p className="op-label mt-8 flex items-center gap-2 text-gold-300">
        <CarFront size={14} aria-hidden /> The Getaway Driver
      </p>
      <h2 id="exit-title" className="mt-1 font-display text-3xl uppercase tracking-wide text-zinc-50 sm:text-4xl">
        Your safe way out
      </h2>
      <ol className="mt-5 flex flex-col gap-3">
        {steps.map((s, i) => (
          <motion.li
            key={s.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.35 }}
            className="flex gap-4 rounded-xl border border-vault-600 bg-vault-850 p-4"
          >
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5 + i * 0.35, type: 'spring' }}>
              <CircleCheck size={28} className="text-emerald-400" aria-hidden />
            </motion.span>
            <div>
              <p className="text-xl font-semibold text-zinc-50">
                <span className="sr-only">Step {i + 1}: </span>
                {s.title}
              </p>
              <p className="text-base text-zinc-300">{s.detail}</p>
            </div>
          </motion.li>
        ))}
      </ol>
      <Button size="xl" className="mt-7 w-full font-display uppercase tracking-[0.16em]" onClick={onComplete} disabled={busy}>
        Complete operation
      </Button>
    </div>
  );
}
