import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { FileText, Home, Radio, ScanSearch, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Brand } from '../components/Brand';
import { AgentCard } from '../components/crew/AgentCard';
import { Button, Kbd, LiveDot, Panel } from '../components/ui/primitives';
import { cx } from '../lib/format';
import { RiskMeter } from '../operation/RiskMeter';
import { SpotlightBanner } from '../operation/SpotlightBanner';
import { EvidenceText, LiveErrorPanel, LiveSignalList, ScoreBreakdown, VerdictPanel } from './LiveResultParts';
import { LIVE_CREW, useLiveAnalysis, type HealthState } from './useLiveAnalysis';

const MAX_CHARS = 2000;
const PLACEHOLDER =
  "I'm calling from your bank. Don't hang up. Your account is compromised and you need to transfer $900 immediately.";

const EXAMPLES: { label: string; text: string }[] = [
  { label: 'Bank impersonation', text: "I'm calling from your bank. Don't hang up. Someone compromised your account. Transfer $900 immediately." },
  { label: 'Grandparent scam', text: "Your grandson has been arrested. Don't tell his parents. Buy $2,000 in gift cards and read me the numbers." },
  { label: 'Tech support', text: 'This is Microsoft support. Your computer is infected. Install AnyDesk now and read me the code on your screen so I can fix it.' },
  { label: 'Ordinary message', text: 'Hi Mom, dinner is at 7 tonight. Can you bring dessert?' },
];

function HealthChip({ health }: { health: HealthState }) {
  const map = {
    checking: { text: 'Checking link…', tone: 'text-zinc-400 border-vault-600' },
    online: { text: 'Live · Gemini online', tone: 'text-emerald-300 border-emerald-500/50' },
    'no-key': { text: 'Gemini key not configured', tone: 'text-gold-300 border-gold-500/50' },
    offline: { text: 'Crew server offline', tone: 'text-red-300 border-red-500/50' },
  } as const;
  const s = map[health.kind];
  return (
    <span className={cx('inline-flex items-center gap-2 rounded border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest', s.tone)}>
      {health.kind === 'online' && <LiveDot className="scale-75" />}
      {s.text}
      {health.kind === 'online' && <span className="hidden normal-case tracking-normal text-zinc-500 lg:inline">{health.health.model}</span>}
    </span>
  );
}

export function LiveAnalysisScreen({ onHome, onCaseFile }: { onHome: () => void; onCaseFile: () => void }) {
  const live = useLiveAnalysis();
  const [text, setText] = useState('');
  const { phase, run } = live;
  const trimmed = text.trim();
  const tooLong = text.length > MAX_CHARS;
  const canSubmit = trimmed.length >= 3 && !tooLong && !live.busy;

  const submit = () => {
    if (canSubmit) void live.analyze(trimmed);
  };

  useEffect(() => {
    if (phase === 'done') document.getElementById('live-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [phase]);

  const assessment = run?.assessment;
  const meterAssessment = assessment
    ? { score: assessment.score, level: assessment.level, contributions: [] }
    : { score: 0, level: 'low' as const, contributions: [] };
  const history = assessment ? [{ at: 0, score: 0 }, { at: 1, score: assessment.score }] : [{ at: 0, score: 0 }];

  return (
    <div className="relative min-h-screen">
      <div className="bg-grid pointer-events-none fixed inset-0 opacity-60" aria-hidden />

      <header className="sticky top-0 z-50 border-b border-vault-700 bg-vault-950/90 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 lg:px-5">
          <button onClick={onHome} className="rounded-md p-1 hover:bg-white/5" aria-label="Back to mission control">
            <Brand compact />
          </button>
          <span className="hidden h-6 w-px bg-vault-700 md:block" aria-hidden />
          <span className="hidden font-display text-lg uppercase tracking-wider text-zinc-100 md:inline">Test the crew</span>
          <HealthChip health={live.health} />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onCaseFile}>
              <FileText size={15} aria-hidden /> <span className="hidden sm:inline">Run case file 001</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={onHome} aria-label="Mission control">
              <Home size={15} aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto grid max-w-[1400px] gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
        <div className="flex min-w-0 flex-col gap-5">
          <SpotlightBanner spotlight={live.spotlight} />

          {/* INPUT */}
          <Panel title="Intercepted communication" icon={<Radio size={13} aria-hidden />} right={<span className="op-label">Live · Gemini</span>}>
            <div className="p-5">
              <label htmlFor="transmission" className="text-lg text-zinc-300">
                Paste or type something a caller or sender said.
              </label>
              <textarea
                id="transmission"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={PLACEHOLDER}
                rows={4}
                maxLength={MAX_CHARS + 200}
                aria-describedby="transmission-count"
                className="mt-3 w-full resize-y rounded-xl border border-vault-600 bg-vault-950/80 px-4 py-3 text-xl leading-relaxed text-zinc-50 placeholder:text-zinc-600 focus:border-gold-500/70 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="op-label text-[10px]">Try</span>
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex.label}
                      onClick={() => setText(ex.text)}
                      disabled={live.busy}
                      className="rounded-full border border-vault-600 px-3 py-1 text-sm text-zinc-300 transition-colors hover:border-gold-500/60 hover:text-zinc-50 disabled:opacity-40"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
                <span id="transmission-count" className={cx('font-mono text-xs', tooLong ? 'text-red-300' : 'text-zinc-500')}>
                  {text.length}/{MAX_CHARS}
                </span>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={submit} disabled={!canSubmit} className="font-display uppercase tracking-[0.16em]">
                  <ScanSearch size={20} aria-hidden /> {live.busy ? 'Analyzing…' : 'Analyze transmission'}
                </Button>
                {(text || run) && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => {
                      setText('');
                      live.reset();
                    }}
                    disabled={live.busy}
                  >
                    <X size={18} aria-hidden /> Clear
                  </Button>
                )}
                <span className="hidden text-sm text-zinc-500 sm:inline">
                  <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> to analyze
                </span>
              </div>
            </div>
          </Panel>

          {/* RESULTS */}
          <div id="live-results" className="scroll-mt-20">
            <AnimatePresence mode="wait">
              {phase === 'error' && run?.error && (
                <LiveErrorPanel key="err" error={run.error} onRetry={() => void live.analyze(run.text)} onCaseFile={onCaseFile} />
              )}
              {phase === 'done' && run?.response && assessment && (
                <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-5">
                  <VerdictPanel assessment={assessment} response={run.response} />
                  <Panel title="Transmission · evidence highlighted">
                    <div className="p-5">
                      <EvidenceText text={run.text} signals={run.response.analysis.signals} />
                    </div>
                  </Panel>
                  <div>
                    <h3 className="mb-3 font-display text-xl uppercase tracking-wider text-zinc-200">
                      Detected signals <span className="font-mono text-sm text-zinc-500">({run.response.analysis.signals.length})</span>
                    </h3>
                    <LiveSignalList signals={run.response.analysis.signals} assessment={assessment} />
                  </div>
                  <p className="font-mono text-xs text-zinc-600">
                    Analysis by {run.response.model} in {(run.response.latency_ms / 1000).toFixed(1)}s · message not stored
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT: crew + risk */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
          <Panel title="Crew deployed" icon={<Users size={13} aria-hidden />}>
            <LayoutGroup>
              <ul className="flex flex-col gap-2 p-3">
                {LIVE_CREW.map((id) => (
                  <AgentCard key={id} id={id} runtime={live.agents[id as keyof typeof live.agents]} />
                ))}
              </ul>
            </LayoutGroup>
          </Panel>
          <RiskMeter assessment={meterAssessment} history={history} />
          {phase === 'done' && run?.response && assessment && <ScoreBreakdown signals={run.response.analysis.signals} assessment={assessment} />}
        </aside>
      </main>
    </div>
  );
}
