import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { AudioLines, FileText, Home, Loader2, Mic, MicOff, RotateCcw, ScanSearch, ShieldCheck, Square, TriangleAlert, Users, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Brand } from '../components/Brand';
import { AgentCard } from '../components/crew/AgentCard';
import { Button, LiveDot, Panel } from '../components/ui/primitives';
import { CREW_ORDER, FIELD_AGENTS } from '../data/crew';
import { GetawayPanel } from '../intervention/GetawayPanel';
import { InterventionPanel } from '../intervention/InterventionPanel';
import { cx, formatClock } from '../lib/format';
import { LiveSignalList, ScoreBreakdown } from '../live-analysis/LiveResultParts';
import { OpsLog } from '../operation/OpsLog';
import { RiskMeter } from '../operation/RiskMeter';
import { SpotlightBanner } from '../operation/SpotlightBanner';
import type { VoiceController } from '../voice/useVoice';
import { VoiceToggle } from '../voice/VoiceToggle';
import { DEMO_CALL_SEGMENTS, LIVE_GUARDIAN_CLIP } from './liveCallScript';
import { findPhrase, LIVE_EXIT_PLANS, type LedgerSignal, type Segment } from './liveSession';
import { MAX_SEGMENT_SECONDS, useLiveCall, type LiveCallController } from './useLiveCall';

const LIVE_LEAD = 'We noticed several warning signs in this conversation.';
const LIVE_REASSURANCE =
  "You haven't done anything wrong. These callers are practised at sounding convincing. It's okay to end the call and check for yourself.";

// ─────────── Microphone control ───────────

function MicControl({ live }: { live: LiveCallController }) {
  const { micState, micError, elapsed, levels, busy, session } = live;
  const listening = micState === 'listening';
  const demoLeft = DEMO_CALL_SEGMENTS.length - session.demoIndex;
  return (
    <Panel title="Microphone" icon={<Mic size={13} aria-hidden />} right={<span className="op-label">Segments of 1–{MAX_SEGMENT_SECONDS}s</span>}>
      <div className="flex flex-col items-center px-5 py-6 text-center">
        <div className="relative">
          {listening && <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-red-500" aria-hidden />}
          <button
            onClick={listening ? live.stopAndAnalyze : () => void live.startListening()}
            disabled={!listening && busy}
            aria-label={listening ? 'Stop and analyze' : 'Start listening'}
            className={cx(
              'relative inline-flex h-28 w-28 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              listening ? 'border-red-500 bg-red-500/15 text-red-300' : 'border-gold-400 bg-gold-400/10 text-gold-300 hover:bg-gold-400/20',
            )}
          >
            {micState === 'processing' || micState === 'requesting' ? <Loader2 size={40} className="animate-spin" aria-hidden /> : listening ? <Square size={36} aria-hidden /> : <Mic size={44} aria-hidden />}
          </button>
        </div>

        <p className="mt-4 font-display text-2xl uppercase tracking-[0.18em] text-zinc-50" role="status" aria-live="polite">
          {listening ? 'Listening…' : micState === 'requesting' ? 'Waiting for permission…' : micState === 'processing' ? 'Transcribing & analyzing…' : 'Start listening'}
        </p>

        {/* Activity meter */}
        <div className="mt-3 flex h-10 items-center gap-[3px]" aria-hidden>
          {levels.map((l, i) => (
            <span key={i} className={cx('w-[5px] rounded-full transition-[height] duration-75', listening ? 'bg-red-400' : 'bg-vault-600')} style={{ height: `${Math.max(8, l * 100)}%` }} />
          ))}
        </div>
        <p className="mt-1 font-mono text-sm tabular-nums text-zinc-400">
          {listening ? `${formatClock(elapsed, '')} / ${formatClock(MAX_SEGMENT_SECONDS, '')}` : `Mic: ${micState === 'denied' ? 'blocked' : micState === 'unsupported' ? 'unsupported' : 'off'}`}
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {listening ? (
            <>
              <Button size="lg" variant="danger" onClick={live.stopAndAnalyze}>
                <Square size={18} aria-hidden /> Stop &amp; analyze
              </Button>
              <Button size="lg" variant="ghost" onClick={live.cancelListening}>
                <X size={18} aria-hidden /> Discard
              </Button>
            </>
          ) : (
            <>
              <Button size="lg" onClick={() => void live.startListening()} disabled={busy} className="font-display uppercase tracking-[0.16em]">
                <Mic size={18} aria-hidden /> Start listening
              </Button>
              <Button size="lg" variant="secondary" onClick={() => void live.loadDemoAudio()} disabled={busy || demoLeft === 0}>
                <AudioLines size={18} aria-hidden /> {demoLeft ? `Load demo audio ${session.demoIndex + 1}/${DEMO_CALL_SEGMENTS.length}` : 'Demo audio used'}
              </Button>
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-zinc-500">Demo audio is a pre-recorded sample call. It's transcribed live by ElevenLabs, just like the microphone.</p>

        {micError && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-gold-500/40 bg-gold-400/10 px-3 py-2 text-left text-sm text-gold-100">
            {micState === 'denied' ? <MicOff size={16} className="mt-0.5 shrink-0" aria-hidden /> : <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />}
            {micError}
          </p>
        )}

        <p className="mt-5 flex items-start gap-2 text-left text-xs leading-relaxed text-zinc-500">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden />
          <span>
            Audio is used to analyze this session and is not stored by THE CREW. The microphone only records after you press Start, and stops when you press Stop.
            Recordings are transcribed by ElevenLabs and the text is analyzed by Gemini.
          </span>
        </p>
      </div>
    </Panel>
  );
}

// ─────────── Conversation timeline ───────────

function highlight(text: string, signals: LedgerSignal[]): ReactNode {
  const spans = signals
    .map((s) => findPhrase(text, s.evidence))
    .filter((x): x is [number, number] => x !== null)
    .sort((a, b) => a[0] - b[0]);
  const out: ReactNode[] = [];
  let cursor = 0;
  spans.forEach(([a, b], i) => {
    if (a < cursor) return;
    out.push(text.slice(cursor, a));
    out.push(
      <mark key={i} className="rounded bg-red-500/20 px-0.5 text-red-50 underline decoration-red-400 decoration-2 underline-offset-4">
        {text.slice(a, b)}
      </mark>,
    );
    cursor = b;
  });
  out.push(text.slice(cursor));
  return out;
}

function SegmentItem({ seg, signals, live }: { seg: Segment; signals: LedgerSignal[]; live: LiveCallController }) {
  return (
    <motion.li initial={{ opacity: 0, y: 10, x: -8 }} animate={{ opacity: 1, y: 0, x: 0 }} className="flex max-w-[92%] flex-col gap-1 self-start" data-segment={seg.n}>
      <span className="op-label flex flex-wrap items-center gap-2 text-[10px]">
        Caller · segment {seg.n} · {formatClock(seg.at)}
        <span className={cx('rounded border px-1 py-px', seg.source === 'demo' ? 'border-sky-500/50 text-sky-300' : 'border-vault-500 text-zinc-400')}>
          {seg.source === 'demo' ? 'Demo audio' : 'Mic'}
        </span>
        {seg.sttLatencyMs !== undefined && <span className="normal-case tracking-normal text-zinc-600">{seg.sttModel} · {(seg.sttLatencyMs / 1000).toFixed(1)}s</span>}
      </span>
      {seg.status === 'transcribing' && (
        <p className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-vault-600 bg-vault-800 px-4 py-2.5 text-zinc-400">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Transcribing with ElevenLabs…
        </p>
      )}
      {seg.status === 'stt-failed' && (
        <div className="rounded-2xl rounded-tl-sm border border-gold-500/40 bg-gold-400/5 px-4 py-3" role="alert">
          <p className="text-gold-100">Transcription failed: {seg.error}</p>
          <p className="mt-1 text-xs text-zinc-500">No transcript was guessed. Retry, discard, or switch to typed mode.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => live.retrySegment(seg.id)} disabled={live.busy}>
              <RotateCcw size={14} aria-hidden /> Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={() => live.discardSegment(seg.id)}>
              Discard
            </Button>
          </div>
        </div>
      )}
      {seg.status === 'transcribed' && seg.text && (
        <>
          <p className={cx('rounded-2xl rounded-tl-sm border bg-vault-800 px-4 py-2.5 text-[17px] leading-relaxed text-zinc-100', signals.length ? 'border-red-500/40' : 'border-vault-600')}>
            {highlight(seg.text, signals)}
          </p>
          {signals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[...new Set(signals.map((s) => s.label))].map((l) => (
                <span key={l} className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-red-300">
                  <TriangleAlert size={11} aria-hidden /> {l}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </motion.li>
  );
}

function Timeline({ live, onTyped }: { live: LiveCallController; onTyped: () => void }) {
  const { session } = live;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [session.segments.length, session.ledger.length]);
  return (
    <Panel title="Conversation timeline" icon={<AudioLines size={13} aria-hidden />} right={session.startedAt ? <span className="flex items-center gap-2 font-mono text-xs text-red-300"><LiveDot className="text-red-500" /> SESSION</span> : null}>
      <div className="max-h-[460px] overflow-y-auto scrollbar-thin p-5" aria-live="polite">
        {session.segments.length === 0 ? (
          <p className="text-zinc-500">No conversation yet. Record what the caller says (put the call on speaker), or load the demo audio. Each segment is added here and THE CREW re-assesses the whole conversation.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {session.segments.map((seg) => (
              <SegmentItem key={seg.id} seg={seg} signals={session.ledger.filter((s) => s.segmentId === seg.id)} live={live} />
            ))}
          </ol>
        )}
        {session.analysis.status === 'analyzing' && (
          <p className="mt-4 flex items-center gap-2 text-sm text-gold-300">
            <Loader2 size={15} className="animate-spin" aria-hidden /> The Grifter is analyzing the conversation with Gemini…
          </p>
        )}
        {session.analysis.status === 'failed' && (
          <div role="alert" className="mt-4 rounded-xl border border-gold-500/40 bg-vault-900 p-4">
            <p className="font-display text-lg uppercase tracking-wide text-gold-300">Analysis temporarily unavailable</p>
            <p className="mt-1 text-zinc-300">{session.analysis.error?.message} Your transcript is safe and the session continues.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={live.retryAnalysis} disabled={live.busy}>
                <RotateCcw size={14} aria-hidden /> Retry analysis
              </Button>
              <Button size="sm" variant="ghost" onClick={onTyped}>
                <ScanSearch size={14} aria-hidden /> Use typed mode
              </Button>
            </div>
          </div>
        )}
        <div ref={end} />
      </div>
    </Panel>
  );
}

// ─────────── Screen ───────────

export function LiveCallScreen({
  voice,
  onHome,
  onCaseFile,
  onTyped,
}: {
  voice: VoiceController;
  onHome: () => void;
  onCaseFile: () => void;
  onTyped: () => void;
}) {
  const live = useLiveCall();
  const { session } = live;
  const v = useRef(voice);
  v.current = voice;

  // Calm guardian voice when the intervention opens; silence as soon as the person acts.
  useEffect(() => {
    if (session.stage === 'open') void v.current.play(LIVE_GUARDIAN_CLIP);
    else v.current.stop();
  }, [session.stage]);
  useEffect(() => () => v.current.stop(), []);

  const deployed = FIELD_AGENTS.filter((id) => session.agents[id].activatedAt !== undefined).length;
  const overlay = session.stage === 'open' || session.stage === 'exit';
  const chosen = session.chosenAction as keyof typeof LIVE_EXIT_PLANS | null;

  return (
    <div className="relative min-h-screen">
      <div className="bg-grid pointer-events-none fixed inset-0 opacity-60" aria-hidden />
      <header className="sticky top-0 z-50 border-b border-vault-700 bg-vault-950/90 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 lg:px-5">
          <button onClick={onHome} className="rounded-md p-1 hover:bg-white/5" aria-label="Back to mission control">
            <Brand compact />
          </button>
          <span className="hidden h-6 w-px bg-vault-700 md:block" aria-hidden />
          <span className="hidden font-display text-lg uppercase tracking-wider text-zinc-100 md:inline">Live call</span>
          <span className="inline-flex items-center gap-2 rounded border border-gold-500/50 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-gold-300">
            {live.micState === 'listening' && <LiveDot className="scale-75 text-red-500" />}
            {session.stage !== 'none' ? 'Heist detected' : live.micState === 'listening' ? 'Listening' : session.startedAt ? 'Session active' : 'Standing by'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <VoiceToggle voice={voice} />
            <Button variant="secondary" size="sm" onClick={live.reset} aria-label="Reset live call session">
              <RotateCcw size={15} aria-hidden /> <span className="hidden sm:inline">Reset</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={onTyped} className="hidden lg:inline-flex">
              <ScanSearch size={15} aria-hidden /> Test the crew
            </Button>
            <Button variant="ghost" size="sm" onClick={onCaseFile} className="hidden lg:inline-flex">
              <FileText size={15} aria-hidden /> Case file 001
            </Button>
            <Button variant="ghost" size="sm" onClick={onHome} aria-label="Mission control">
              <Home size={15} aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto grid max-w-[1500px] gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
        <div className="flex min-w-0 flex-col gap-5">
          <SpotlightBanner spotlight={session.spotlight} />
          <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
            <MicControl live={live} />
            <Timeline live={live} onTyped={onTyped} />
          </div>
          {session.stage === 'closed' && (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-emerald-200">
              <ShieldCheck size={18} aria-hidden /> Safe exit plan delivered. You can keep recording, or reset to start a new call.
            </p>
          )}
          {session.ledger.length > 0 && (
            <div>
              <h3 className="mb-3 font-display text-xl uppercase tracking-wider text-zinc-200">
                Evidence noticed <span className="font-mono text-sm text-zinc-500">({session.ledger.length} pieces · {session.assessment.countedSignals} distinct tactics)</span>
              </h3>
              <LiveSignalList signals={session.ledger} assessment={session.assessment} />
              {session.summary && <p className="mt-3 text-sm text-zinc-400"><span className="op-label mr-2 text-gold-300">The Grifter's read</span>{session.summary}</p>}
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
          <RiskMeter assessment={{ score: session.assessment.score, level: session.assessment.level, contributions: [] }} history={session.history} />
          <Panel title="Crew deployed" icon={<Users size={13} aria-hidden />} right={<span className="font-mono text-xs text-gold-300">{deployed}/{FIELD_AGENTS.length}</span>}>
            <LayoutGroup>
              <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto scrollbar-thin p-3">
                {CREW_ORDER.map((id) => (
                  <AgentCard key={id} id={id} runtime={session.agents[id]} />
                ))}
              </ul>
            </LayoutGroup>
          </Panel>
          <OpsLog log={session.log} />
          {session.ledger.length > 0 && <ScoreBreakdown signals={session.ledger} assessment={session.assessment} />}
        </aside>
      </main>

      <AnimatePresence>
        {overlay && session.intervention && (
          <motion.div key="live-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto bg-vault-950/85 backdrop-blur-md">
            <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-8">
              {session.stage === 'open' ? (
                <InterventionPanel
                  intervention={session.intervention}
                  onChoose={live.chooseAction}
                  busy={false}
                  kicker="The Fixer · Safe options"
                  lead={LIVE_LEAD}
                  reassurance={LIVE_REASSURANCE}
                  onReadAloud={() => voice.play(LIVE_GUARDIAN_CLIP, { force: true })}
                  speaking={voice.speaking && voice.currentClipId === LIVE_GUARDIAN_CLIP.id}
                />
              ) : (
                <GetawayPanel steps={chosen ? LIVE_EXIT_PLANS[chosen] : LIVE_EXIT_PLANS.exit} onComplete={live.closeIntervention} busy={false} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
