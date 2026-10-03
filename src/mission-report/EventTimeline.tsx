import { motion } from 'framer-motion';
import { Landmark, MessageSquare, Radio } from 'lucide-react';
import { AGENT_ICONS } from '../components/crew/agentVisuals';
import { cx, formatClock } from '../lib/format';
import type { MissionEvent } from '../types';

const DOT: Record<MissionEvent['type'], string> = {
  operation: 'border-gold-400 text-gold-300',
  conversation: 'border-vault-500 text-zinc-400',
  signal: 'border-red-500 text-red-300',
  deployment: 'border-gold-500 text-gold-300',
  payment: 'border-sky-400 text-sky-300',
  assessment: 'border-orange-400 text-orange-300',
  intervention: 'border-gold-400 text-gold-300',
  verification: 'border-emerald-400 text-emerald-300',
  outcome: 'border-emerald-400 text-emerald-300',
};

const TYPE_LABEL: Record<MissionEvent['type'], string> = {
  operation: 'Operation',
  conversation: 'Call',
  signal: 'Signal',
  deployment: 'Crew',
  payment: 'Payment',
  assessment: 'Assessment',
  intervention: 'Intervention',
  verification: 'Verification',
  outcome: 'Outcome',
};

export function EventTimeline({ events }: { events: MissionEvent[] }) {
  return (
    <ol className="relative ml-3 border-l border-vault-600">
      {events.map((e, i) => {
        const Icon = e.agent ? AGENT_ICONS[e.agent] : e.type === 'payment' ? Landmark : e.type === 'conversation' ? MessageSquare : Radio;
        return (
          <motion.li
            key={e.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i * 0.03, 1.2) }}
            className="relative pb-4 pl-7 last:pb-0"
          >
            <span className={cx('absolute -left-[13px] top-0 inline-flex h-6 w-6 items-center justify-center rounded-full border-2 bg-vault-900', DOT[e.type])}>
              <Icon size={12} aria-hidden />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="font-mono text-xs text-zinc-500">{formatClock(e.at)}</span>
              <span className={cx('font-mono text-[10px] uppercase tracking-widest', DOT[e.type].split(' ')[1])}>{TYPE_LABEL[e.type]}</span>
              <span className={cx('text-[15px]', e.type === 'outcome' ? 'font-semibold text-emerald-300' : 'text-zinc-100')}>{e.title}</span>
              {e.riskScore !== undefined && <span className="font-mono text-xs text-zinc-500">risk {e.riskScore}%</span>}
            </div>
            {e.detail && <p className="mt-0.5 text-sm text-zinc-400">{e.detail}</p>}
          </motion.li>
        );
      })}
    </ol>
  );
}
