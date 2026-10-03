import { motion } from 'framer-motion';
import { Clock, HeartHandshake, PhoneCall, PhoneOff, Siren, TriangleAlert, Volume2, Wrench, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../components/ui/primitives';
import { SIGNAL_CATALOG } from '../data/signalCatalog';
import { cx, formatMoney } from '../lib/format';
import { services } from '../services';
import type { Intervention, InterventionActionId, Payment, RiskSignal } from '../types';

const ACTION_ICON: Record<InterventionActionId, LucideIcon> = {
  'call-trusted-contact': HeartHandshake,
  'verify-claimed-person': PhoneCall,
  wait: Clock,
  exit: PhoneOff,
};

const FAMILY_TITLE = {
  conversation: 'In the conversation',
  payment: 'In the payment',
  identity: 'About the caller',
} as const;

export function EvidenceList({ signals, large = true }: { signals: RiskSignal[]; large?: boolean }) {
  const families = (['conversation', 'payment', 'identity'] as const)
    .map((f) => ({ f, items: signals.filter((s) => SIGNAL_CATALOG[s.category].family === f) }))
    .filter((g) => g.items.length);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {families.map(({ f, items }) => (
        <div key={f} className={cx(f === 'conversation' && 'md:row-span-2')}>
          <p className="op-label mb-2 text-zinc-400">{FAMILY_TITLE[f]}</p>
          <ul className="flex flex-col gap-2">
            {items.map((s, i) => (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.12 }}
                className="flex gap-3 rounded-lg border border-vault-600 bg-vault-850 p-3"
              >
                <TriangleAlert size={large ? 22 : 18} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
                <div>
                  <p className={cx('font-semibold text-zinc-50', large ? 'text-lg' : 'text-base')}>
                    {s.label} <span className="sr-only">(warning)</span>
                  </p>
                  <p className={cx('leading-snug text-zinc-300', large ? 'text-base' : 'text-sm')}>{s.detail}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function InterventionPanel({
  intervention,
  payment,
  targetName,
  onChoose,
  busy,
}: {
  intervention: Intervention;
  payment: Payment;
  targetName: string;
  onChoose: (id: InterventionActionId) => void;
  busy: boolean;
}) {
  const first = targetName.split(' ')[0];
  const recommended = intervention.actions.find((a) => a.recommended);
  const others = intervention.actions.filter((a) => !a.recommended);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, []);

  const readAloud = () => {
    const reasons = intervention.reasons.map((r) => r.label).join('. ');
    services.voice.speak(
      `${first}, we've paused this payment. ${intervention.message} ${reasons}. You haven't done anything wrong. ` +
        (recommended ? `The safest next step is to ${recommended.label.replace('—', ',')}.` : ''),
    );
  };

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="heist-title" aria-describedby="heist-desc" className="overflow-hidden rounded-2xl border border-red-500/50 bg-vault-900 shadow-[0_0_80px_-20px_rgb(239_68_68/0.6)]">
      <div className="hazard-stripes h-2.5" aria-hidden />
      <div className="p-6 sm:px-9 sm:py-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="op-label flex items-center gap-2 text-gold-300">
            <Wrench size={14} aria-hidden /> The Fixer · Payment on hold
          </p>
          <span className="rounded border border-red-500/60 bg-red-500/10 px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-widest text-red-300">
            Risk {intervention.riskScore}% · Critical
          </span>
        </div>

        <motion.h2
          id="heist-title"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-3 flex items-center gap-4 font-display text-4xl font-semibold uppercase leading-none tracking-wide text-zinc-50 sm:text-[3.5rem]"
        >
          <motion.span animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: 1.4, repeat: Infinity }} className="text-red-500">
            <Siren size={52} aria-hidden />
          </motion.span>
          {intervention.headline}
        </motion.h2>

        <div id="heist-desc" className="mt-5 space-y-2">
          <p className="text-2xl leading-snug text-zinc-50">
            {first}, we've paused this {formatMoney(payment.amount)} payment.{' '}
            <span className="text-gold-200">{intervention.message}</span>
          </p>
          <p className="text-lg text-zinc-300">
            You haven't done anything wrong. These tactics are designed to fool caring people. Your money is safe while you check.
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <h3 className="font-display text-xl uppercase tracking-wider text-zinc-200">What we noticed</h3>
          {services.voice.available && (
            <Button variant="ghost" size="sm" onClick={readAloud}>
              <Volume2 size={16} aria-hidden /> Read this to me
            </Button>
          )}
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {intervention.reasons.map((s, i) => (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="flex items-start gap-2.5 rounded-lg border border-vault-600 bg-vault-850 px-3 py-2.5"
            >
              <TriangleAlert size={20} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
              <span className="min-w-0">
                <span className="block text-[17px] font-semibold leading-tight text-zinc-50">{s.label}</span>
                {s.evidence && <span className="block text-sm leading-snug text-zinc-400">{s.evidence}</span>}
              </span>
            </motion.li>
          ))}
        </ul>

        <h3 className="mt-7 font-display text-xl uppercase tracking-wider text-zinc-200">Choose a safe next step</h3>
        <div className="mt-3 flex flex-col gap-3">
          {recommended && (
            <Button
              ref={primaryRef}
              variant="success"
              size="xl"
              onClick={() => onChoose(recommended.id)}
              disabled={busy}
              className="w-full justify-start text-left"
            >
              <HeartHandshake size={30} className="shrink-0" aria-hidden />
              <span className="flex flex-col">
                <span className="font-display text-2xl uppercase tracking-wider">{recommended.label}</span>
                <span className="text-base font-medium text-vault-950/80">{recommended.description}</span>
              </span>
              <span className="ml-auto hidden rounded bg-vault-950/15 px-2 py-1 font-mono text-xs uppercase tracking-wider sm:inline">Recommended</span>
            </Button>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            {others.map((a) => {
              const Icon = ACTION_ICON[a.id];
              return (
                <Button
                  key={a.id}
                  variant="secondary"
                  size="xl"
                  onClick={() => onChoose(a.id)}
                  disabled={busy}
                  className="h-full flex-col items-start justify-start gap-1 py-4 text-left"
                >
                  <span className="flex items-center gap-2 font-display text-xl uppercase tracking-wider">
                    <Icon size={22} aria-hidden /> {a.label}
                  </span>
                  <span className="text-sm font-normal text-zinc-400">{a.description}</span>
                </Button>
              );
            })}
          </div>
        </div>

        <details className="group mt-8 rounded-xl border border-vault-700 bg-vault-900/60">
          <summary className="cursor-pointer list-none px-5 py-4 font-display text-lg uppercase tracking-wider text-zinc-300 hover:text-zinc-100">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>›</span>
            Why each of these matters
          </summary>
          <div className="px-5 pb-5">
            <EvidenceList signals={intervention.reasons} />
          </div>
        </details>
      </div>
    </div>
  );
}
