import { Terminal } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Panel } from '../components/ui/primitives';
import { cx, formatClock } from '../lib/format';
import type { MissionEvent } from '../types';

const TYPE_COLOR: Record<MissionEvent['type'], string> = {
  operation: 'text-gold-300',
  conversation: 'text-zinc-500',
  signal: 'text-red-300',
  deployment: 'text-gold-400',
  payment: 'text-sky-300',
  assessment: 'text-orange-300',
  intervention: 'text-gold-300',
  verification: 'text-emerald-300',
  outcome: 'text-emerald-300',
};

export function OpsLog({ log, className }: { log: MissionEvent[]; className?: string }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [log.length]);
  return (
    <Panel title="Mastermind ops log" icon={<Terminal size={13} aria-hidden />} className={className} bodyClassName="flex flex-col">
      <ol ref={ref} className="h-full max-h-28 overflow-y-auto scrollbar-thin px-3 py-2 font-mono text-[11px] leading-relaxed">
        {log.length === 0 && <li className="text-zinc-600">Awaiting operation…</li>}
        {log.map((e) => (
          <li key={e.id} className="flex gap-2">
            <span className="shrink-0 text-zinc-600">{formatClock(e.at, '')}</span>
            <span className={cx('min-w-0', TYPE_COLOR[e.type])}>
              {e.title}
              {e.detail && e.type !== 'conversation' && <span className="text-zinc-500"> · {e.detail}</span>}
            </span>
          </li>
        ))}
        <li className="text-gold-500/70" aria-hidden>
          <span className="animate-blink">▍</span>
        </li>
      </ol>
    </Panel>
  );
}
