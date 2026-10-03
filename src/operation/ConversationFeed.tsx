import { AnimatePresence, motion } from 'framer-motion';
import { PhoneCall, PhoneIncoming, Play, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button, LiveDot, Panel } from '../components/ui/primitives';
import { cx, formatClock } from '../lib/format';
import type { ConversationEvent, OperationPhase, RiskSignal } from '../types';

function highlight(text: string, evidence: string[]): ReactNode {
  const ranges = evidence
    .map((e) => {
      const i = text.toLowerCase().indexOf(e.toLowerCase());
      return i >= 0 ? [i, i + e.length] : null;
    })
    .filter((r): r is number[] => r !== null)
    .sort((a, b) => a[0] - b[0]);
  if (!ranges.length) return text;
  const out: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], k) => {
    if (start < cursor) return;
    out.push(text.slice(cursor, start));
    out.push(
      <mark key={k} className="rounded bg-red-500/20 px-0.5 text-red-100 underline decoration-red-400 decoration-2 underline-offset-4">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  out.push(text.slice(cursor));
  return out;
}

export function ConversationFeed({
  messages,
  signals,
  phase,
  callerNumber,
  targetName,
  clock,
  onStart,
  canStart,
  compact,
}: {
  messages: ConversationEvent[];
  signals: RiskSignal[];
  phase: OperationPhase;
  callerNumber: string;
  targetName: string;
  clock: number;
  onStart: () => void;
  canStart: boolean;
  compact?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, signals.length]);

  const onCall = messages.length > 0 && !['exit', 'protected'].includes(phase);
  const firstName = targetName.split(' ')[0];

  return (
    <Panel
      title={onCall ? (compact ? 'Live call' : 'Live call · intercept') : 'Communications'}
      icon={<PhoneCall size={13} aria-hidden />}
      right={
        onCall ? (
          <span className="flex items-center gap-2 font-mono text-xs text-red-300">
            <LiveDot className="text-red-500" /> LIVE{compact ? '' : ` · ${callerNumber}`} · {formatClock(clock, '')}
          </span>
        ) : null
      }
      className="h-full"
      bodyClassName="flex flex-col"
    >
      <div ref={scroller} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 sm:px-5" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
            <motion.span
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 1.8, repeat: Infinity }}
              className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-gold-500/40 bg-gold-400/10 text-gold-300"
            >
              <PhoneIncoming size={28} aria-hidden />
            </motion.span>
            <p className="mt-4 font-display text-2xl uppercase tracking-wide text-zinc-100">Awaiting incoming call</p>
            <p className="mt-2 max-w-sm text-zinc-400">
              The Mastermind is standing by on {firstName}'s line. Advance the scenario with <strong className="text-zinc-200">Next event</strong> or turn on Auto play.
            </p>
            <Button className="mt-6" onClick={onStart} disabled={!canStart}>
              <Play size={16} aria-hidden /> Start call
            </Button>
          </div>
        ) : (
          <ol className={cx('flex flex-col', compact ? 'gap-3' : 'gap-4')}>
            <AnimatePresence initial={false}>
              {messages.map((m) => {
                const flagged = signals.filter((s) => s.sourceEventId === m.id);
                if (m.speaker === 'system') {
                  return (
                    <motion.li
                      key={m.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="self-center rounded-full border border-vault-600 bg-vault-900 px-3 py-1 text-center font-mono text-xs text-zinc-400"
                    >
                      {m.text}
                    </motion.li>
                  );
                }
                const isCaller = m.speaker === 'caller';
                return (
                  <motion.li
                    key={m.id}
                    initial={{ opacity: 0, y: 10, x: isCaller ? -8 : 8 }}
                    animate={{ opacity: 1, y: 0, x: 0 }}
                    transition={{ duration: 0.35 }}
                    className={cx('flex max-w-[88%] flex-col gap-1', isCaller ? 'self-start' : 'items-end self-end')}
                  >
                    <span className="op-label text-[10px]">
                      {isCaller ? `Caller · ${callerNumber}` : firstName} · {formatClock(m.at)}
                    </span>
                    <p
                      className={cx(
                        'rounded-2xl px-4 py-2.5 leading-relaxed',
                        compact ? 'text-[15px]' : 'text-[17px]',
                        isCaller
                          ? cx('rounded-tl-sm border bg-vault-800 text-zinc-100', flagged.length ? 'border-red-500/40' : 'border-vault-600')
                          : 'rounded-tr-sm border border-gold-500/25 bg-gold-400/10 text-gold-100',
                      )}
                    >
                      {isCaller ? highlight(m.text, flagged.map((f) => f.evidence ?? '').filter(Boolean)) : m.text}
                    </p>
                    {flagged.length > 0 && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap gap-1.5">
                        {flagged.map((f) => (
                          <span
                            key={f.id}
                            className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-red-300"
                          >
                            <TriangleAlert size={11} aria-hidden /> {f.label}
                          </span>
                        ))}
                      </motion.div>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </Panel>
  );
}
