import { ChevronRight, Home, Pause, Play, RotateCcw } from 'lucide-react';
import { Brand } from '../components/Brand';
import type { VoiceController } from '../voice/useVoice';
import { VoiceToggle } from '../voice/VoiceToggle';
import { Button, Kbd, LiveDot } from '../components/ui/primitives';
import { cx } from '../lib/format';
import type { OperationController } from '../hooks/useOperation';
import type { OperationPhase } from '../types';

const PHASE_STATUS: Record<OperationPhase, { label: string; tone: string }> = {
  briefing: { label: 'Standing by', tone: 'text-zinc-400 border-vault-600' },
  live: { label: 'Operation active', tone: 'text-gold-300 border-gold-500/50' },
  payment: { label: 'Payment attempt', tone: 'text-sky-300 border-sky-500/50' },
  analyzing: { label: 'Crew analyzing', tone: 'text-gold-300 border-gold-500/50' },
  intervention: { label: 'Heist in progress', tone: 'text-red-300 border-red-500/60' },
  verifying: { label: 'Trusted verification', tone: 'text-emerald-300 border-emerald-500/50' },
  cooldown: { label: 'Cool-down · payment held', tone: 'text-gold-300 border-gold-500/50' },
  exit: { label: 'Safe exit', tone: 'text-emerald-300 border-emerald-500/50' },
  protected: { label: 'Operation complete', tone: 'text-emerald-300 border-emerald-500/50' },
};

export function OperationHeader({
  op,
  caseNumber,
  onHome,
  onNext,
  voice,
  ledgerOffline = false,
}: {
  op: OperationController;
  caseNumber: string;
  onHome: () => void;
  onNext: () => void;
  voice?: VoiceController;
  ledgerOffline?: boolean;
}) {
  const status = PHASE_STATUS[op.state.phase];
  const done = op.state.phase === 'protected';
  return (
    <header className="sticky top-0 z-50 border-b border-vault-700 bg-vault-950/90 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-5">
        <button onClick={onHome} className="rounded-md p-1 hover:bg-white/5" aria-label="Back to mission control">
          <Brand compact />
        </button>
        <span className="hidden h-6 w-px bg-vault-700 md:block" aria-hidden />
        <div className="hidden items-baseline gap-2 md:flex">
          <span className="op-label">Case file</span>
          <span className="font-display text-lg tracking-wider text-zinc-100">{caseNumber}</span>
        </div>
        <span className={cx('ml-1 inline-flex items-center gap-2 rounded border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest', status.tone)}>
          {!done && op.state.phase !== 'briefing' && <LiveDot className="scale-75" />}
          {status.label}
        </span>

        <div className="ml-auto flex items-center gap-2" role="group" aria-label="Demo controls">
          {ledgerOffline && (
            <span className="hidden font-mono text-[11px] uppercase tracking-wider text-zinc-500 lg:inline" title="The evidence ledger is unreachable. Events are kept for this session.">
              Ledger offline
            </span>
          )}
          <span className="op-label mr-1 hidden xl:inline">Demo control</span>
          <Button variant="ghost" size="sm" onClick={onHome} className="hidden sm:inline-flex" aria-label="Mission control">
            <Home size={15} aria-hidden />
          </Button>
          {voice && <VoiceToggle voice={voice} />}
          <Button variant="secondary" size="sm" onClick={op.reset} aria-label="Reset operation">
            <RotateCcw size={15} aria-hidden /> <span className="hidden sm:inline">Reset</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => op.setAutoPlay(!op.autoPlay)}
            aria-pressed={op.autoPlay}
            disabled={done}
            className={op.autoPlay ? 'border-gold-400/70 text-gold-300' : ''}
          >
            {op.autoPlay ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
            <span className="hidden sm:inline">Auto play</span>
          </Button>
          <Button size="sm" onClick={onNext} disabled={!op.canAdvance && !done} className="min-w-40">
            {done ? 'Mission report' : op.nextLabel}
            <ChevronRight size={16} aria-hidden />
            <Kbd>→</Kbd>
          </Button>
        </div>
      </div>
    </header>
  );
}
