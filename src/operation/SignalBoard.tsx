import { AnimatePresence, motion } from 'framer-motion';
import { Radar } from 'lucide-react';
import { AGENT_ICONS } from '../components/crew/agentVisuals';
import { Panel } from '../components/ui/primitives';
import { CREW } from '../data/crew';
import { cx } from '../lib/format';
import { SEVERITY_STYLE } from '../lib/riskStyle';
import type { RiskAssessment, RiskSignal } from '../types';

export function SignalBoard({ signals, assessment }: { signals: RiskSignal[]; assessment: RiskAssessment }) {
  const ordered = [...signals].reverse();
  return (
    <Panel
      title="Signals detected"
      icon={<Radar size={13} aria-hidden />}
      right={<span className="font-mono text-xs text-zinc-400">{signals.length}</span>}
      className="min-h-48 flex-1"
      bodyClassName="overflow-y-auto scrollbar-thin"
    >
      {signals.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">No manipulation signals yet. The crew is listening.</p>
      ) : (
        <ul className="flex flex-col gap-2 p-3" aria-live="polite">
          <AnimatePresence initial={false}>
            {ordered.map((s, i) => {
              const Icon = AGENT_ICONS[s.detectedBy];
              const delta = assessment.contributions.find((c) => c.signalId === s.id)?.delta;
              const sev = SEVERITY_STYLE[s.severity];
              return (
                <motion.li
                  key={s.id}
                  layout
                  initial={{ opacity: 0, x: 24, scale: 0.97 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                  className={cx(
                    'rounded-lg border bg-vault-900/70 p-3',
                    i === 0 ? 'border-red-500/40 shadow-[0_0_24px_-12px_rgb(239_68_68/0.8)]' : 'border-vault-700',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-center gap-2 font-semibold text-zinc-100">
                      <Icon size={15} className="shrink-0 text-gold-400" aria-label={CREW[s.detectedBy].name} />
                      {s.label}
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {delta !== undefined && <span className="font-mono text-xs text-red-300">+{delta}%</span>}
                      <span className={cx('rounded border px-1.5 py-px font-mono text-[10px] font-bold', sev.chip)}>{sev.label}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-zinc-400">{s.detail}</p>
                  {s.evidence && (
                    <p className="mt-1.5 truncate font-mono text-[11px] text-zinc-500">
                      {CREW[s.detectedBy].name.replace(/^The /, '').toUpperCase()} · “{s.evidence}”
                    </p>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </Panel>
  );
}
