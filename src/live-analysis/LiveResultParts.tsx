import { motion } from 'framer-motion';
import {
  CircleCheck,
  CloudOff,
  KeyRound,
  Calculator,
  RotateCcw,
  ShieldAlert,
  Siren,
  TriangleAlert,
  Drama,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Panel } from '../components/ui/primitives';
import { LIVE_SIGNAL_WEIGHTS, MIN_CONFIDENCE, UNGROUNDED_FACTOR, type LiveAssessment } from '../engine/liveRiskEngine';
import { cx } from '../lib/format';
import { RISK_STYLE } from '../lib/riskStyle';
import type { AnalyzeResponse, ApiError, LiveSignal } from './types';

// ─────────── Original message with evidence highlighted ───────────

export function EvidenceText({ text, signals }: { text: string; signals: LiveSignal[] }) {
  const spans = signals
    .map((s, i) => ({ start: s.evidence_start, end: s.evidence_end, n: i + 1, label: s.label }))
    .filter((s): s is { start: number; end: number; n: number; label: string } => s.start !== null && s.end !== null)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const out: ReactNode[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start < cursor) {
      // Overlaps a phrase already highlighted: just add its marker.
      out.push(<sup key={`o${s.n}`} className="ml-0.5 font-mono text-[11px] font-bold text-red-300">{s.n}</sup>);
      continue;
    }
    out.push(text.slice(cursor, s.start));
    out.push(
      <mark key={s.n} title={s.label} className="rounded bg-red-500/20 px-0.5 text-red-50 underline decoration-red-400 decoration-2 underline-offset-4">
        {text.slice(s.start, s.end)}
        <sup className="ml-0.5 font-mono text-[11px] font-bold text-red-300 no-underline">{s.n}</sup>
      </mark>,
    );
    cursor = s.end;
  }
  out.push(text.slice(cursor));
  return <p className="whitespace-pre-wrap text-xl leading-relaxed text-zinc-100">{out}</p>;
}

// ─────────── Signal cards ───────────

export function LiveSignalList({ signals, assessment }: { signals: LiveSignal[]; assessment: LiveAssessment }) {
  if (!signals.length) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <CircleCheck size={24} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden />
        <div>
          <p className="text-lg font-semibold text-zinc-100">No manipulation signals detected</p>
          <p className="text-zinc-400">The Grifter found no social-engineering tactics in this message.</p>
        </div>
      </div>
    );
  }
  return (
    <ol className="grid gap-3 md:grid-cols-2">
      {signals.map((s, i) => {
        const c = assessment.contributions[i];
        const pct = Math.round(s.confidence * 100);
        return (
          <motion.li
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.1 }}
            className={cx('rounded-xl border bg-vault-900/70 p-4', c.status === 'counted' ? 'border-red-500/30' : 'border-vault-700 opacity-80')}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="flex items-center gap-2 text-lg font-semibold text-zinc-50">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/20 font-mono text-xs text-red-200">{i + 1}</span>
                {s.label}
              </p>
              <span className="shrink-0 font-mono text-sm text-red-300">
                {c.status === 'counted' ? `+${c.delta}%` : c.status === 'duplicate' ? 'dup' : 'ignored'}
              </span>
            </div>
            <blockquote className="mt-2 border-l-2 border-red-500/50 pl-3 text-[15px] italic text-zinc-200">“{s.evidence}”</blockquote>
            {!s.evidence_verbatim && (
              <p className="mt-1 flex items-center gap-1 font-mono text-[11px] text-gold-300">
                <TriangleAlert size={12} aria-hidden /> Not found word-for-word in the message · weight reduced
              </p>
            )}
            <p className="mt-2 text-[15px] leading-snug text-zinc-400">{s.explanation}</p>
            <div className="mt-3 flex items-center gap-2" aria-label={`Confidence ${pct} percent`}>
              <span className="op-label text-[10px]">Confidence</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-vault-700">
                <motion.span className="block h-full rounded-full bg-gold-400" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.3 + i * 0.1, duration: 0.6 }} />
              </span>
              <span className="w-10 text-right font-mono text-xs text-zinc-300">{pct}%</span>
            </div>
            {c.status === 'low-confidence' && <p className="mt-1 font-mono text-[11px] text-zinc-500">Below {MIN_CONFIDENCE * 100}% confidence: not counted</p>}
            {c.status === 'duplicate' && <p className="mt-1 font-mono text-[11px] text-zinc-500">Same tactic already counted: not double-counted</p>}
          </motion.li>
        );
      })}
    </ol>
  );
}

// ─────────── Verdict ───────────

const VERDICT_COPY = {
  low: {
    title: 'Low risk',
    body: 'No strong manipulation patterns were found. Stay alert if the conversation changes, especially if money, codes or secrecy come up.',
  },
  elevated: {
    title: 'Elevated risk',
    body: 'Some persuasion tactics were detected. Slow down, and verify the request before acting on it.',
  },
  high: {
    title: 'Potential heist detected',
    body: 'Strong scam indicators detected. This communication shows patterns commonly associated with social-engineering scams.',
  },
  critical: {
    title: 'Potential heist detected',
    body: 'Strong scam indicators detected. This communication shows patterns commonly associated with social-engineering scams.',
  },
} as const;

export function VerdictPanel({ assessment, response }: { assessment: LiveAssessment; response: AnalyzeResponse }) {
  const style = RISK_STYLE[assessment.level];
  const copy = VERDICT_COPY[assessment.level];
  const heist = assessment.level === 'high' || assessment.level === 'critical';
  const { claimed_identity, requested_action, summary } = response.analysis;
  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      aria-live="assertive"
      className={cx('overflow-hidden rounded-2xl border bg-vault-900', heist ? 'border-red-500/50 shadow-[0_0_60px_-25px_rgb(239_68_68/0.7)]' : 'border-vault-600')}
    >
      {heist && <div className="hazard-stripes h-2" aria-hidden />}
      <div className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cx('inline-flex items-center gap-2 rounded-md border px-3 py-1 font-display text-lg uppercase tracking-[0.18em]', style.bg, style.text)}>
            <style.icon size={18} aria-hidden /> {style.label} risk · {assessment.score}%
          </span>
        </div>
        <h2 className="mt-3 flex items-center gap-3 font-display text-4xl font-semibold uppercase tracking-wide text-zinc-50">
          {heist && <Siren size={36} className="text-red-500" aria-hidden />}
          {copy.title}
        </h2>
        <p className="mt-2 text-xl text-zinc-200">{copy.body}</p>
        {heist && (
          <p className="mt-4 flex items-start gap-3 rounded-xl border border-gold-500/40 bg-gold-400/10 p-4 text-lg text-gold-100">
            <ShieldAlert size={24} className="mt-0.5 shrink-0 text-gold-300" aria-hidden />
            Pause before sending money or sharing information. Verify the request using a phone number or website you already trust.
          </p>
        )}
        {(claimed_identity || requested_action) && (
          <dl className="mt-4 flex flex-wrap gap-2 text-sm">
            {claimed_identity && (
              <div className="rounded-md border border-vault-600 px-3 py-1.5">
                <dt className="op-label inline text-[10px]">Claims to be </dt>
                <dd className="inline text-zinc-100">{claimed_identity}</dd>
              </div>
            )}
            {requested_action && (
              <div className="rounded-md border border-vault-600 px-3 py-1.5">
                <dt className="op-label inline text-[10px]">Asks you to </dt>
                <dd className="inline text-zinc-100">{requested_action}</dd>
              </div>
            )}
          </dl>
        )}
        <div className="mt-4 flex gap-3 border-t border-vault-700 pt-4">
          <Drama size={20} className="mt-0.5 shrink-0 text-gold-400" aria-hidden />
          <p className="text-zinc-300">
            <span className="op-label mr-2 text-gold-300">The Grifter's read</span>
            {summary}
          </p>
        </div>
      </div>
    </motion.section>
  );
}

// ─────────── How the score was decided ───────────

export function ScoreBreakdown({ signals, assessment }: { signals: LiveSignal[]; assessment: LiveAssessment }) {
  return (
    <Panel title="How the score was decided" icon={<Calculator size={13} aria-hidden />}>
      <div className="p-4 text-sm">
        <p className="text-zinc-300">
          <strong className="text-zinc-100">AI interprets. THE CREW decides.</strong> Gemini only identifies tactics. The score comes from a fixed,
          deterministic formula: weight × confidence per tactic, combined so evidence compounds but never passes 100%.
        </p>
        {signals.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full font-mono text-xs">
              <caption className="sr-only">Score contribution per signal</caption>
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="py-1 font-normal">#</th>
                  <th className="py-1 font-normal">Weight × conf</th>
                  <th className="py-1 text-right font-normal">Adds</th>
                </tr>
              </thead>
              <tbody>
                {assessment.contributions.map((c) => (
                  <tr key={c.index} className="border-t border-vault-800 text-zinc-300">
                    <td className="py-1">{c.index + 1}</td>
                    <td className="py-1">
                      {LIVE_SIGNAL_WEIGHTS[c.type].toFixed(2)} × {c.confidence.toFixed(2)}
                      {!c.grounded && ` × ${UNGROUNDED_FACTOR}`}
                    </td>
                    <td className="py-1 text-right">{c.status === 'counted' ? `+${c.delta}` : '0'}</td>
                  </tr>
                ))}
                <tr className="border-t border-vault-600 text-zinc-100">
                  <td className="py-1" colSpan={2}>
                    Risk = 1 − Π(1 − effective)
                  </td>
                  <td className="py-1 text-right">{assessment.score}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ─────────── Errors: honest, recoverable ───────────

const ERROR_COPY: Record<string, { title: string; hint?: string; icon: LucideIcon }> = {
  not_configured: { title: 'Live analysis offline', hint: 'Add GEMINI_API_KEY to backend/.env and restart the backend.', icon: KeyRound },
  backend_unreachable: { title: 'Crew server unreachable', hint: 'Start it: cd backend && .venv/bin/uvicorn main:app --port 8000', icon: CloudOff },
  auth_failed: { title: 'Gemini key rejected', hint: 'Check GEMINI_API_KEY in backend/.env.', icon: KeyRound },
  rate_limited: { title: 'Rate limit reached', hint: 'Wait a few seconds, then retry.', icon: RotateCcw },
  gemini_unavailable: { title: 'Gemini is busy', hint: 'Google reports high demand. Retrying in a few seconds usually works.', icon: RotateCcw },
  timeout: { title: 'Transmission timed out', icon: CloudOff },
  malformed_response: { title: 'Unreadable analysis', hint: "Gemini's answer didn't pass validation. Retrying usually works.", icon: TriangleAlert },
  model_unavailable: { title: 'Model unavailable', hint: 'Set GEMINI_MODEL in backend/.env to a model your key can use.', icon: TriangleAlert },
  invalid_input: { title: 'Check the message', icon: TriangleAlert },
  blocked: { title: 'Analysis declined', hint: 'Gemini declined to analyse this text. Try rephrasing it.', icon: TriangleAlert },
};

export function LiveErrorPanel({ error, onRetry, onCaseFile }: { error: ApiError; onRetry: () => void; onCaseFile: () => void }) {
  const copy = ERROR_COPY[error.code] ?? { title: 'Analysis failed', icon: TriangleAlert };
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} role="alert" className="rounded-2xl border border-gold-500/40 bg-vault-900 p-6">
      <p className="op-label text-gold-300">System message · {error.code}</p>
      <h2 className="mt-2 flex items-center gap-3 font-display text-3xl uppercase tracking-wide text-zinc-50">
        <copy.icon size={28} className="text-gold-400" aria-hidden /> {copy.title}
      </h2>
      <p className="mt-2 text-lg text-zinc-200">{error.message}</p>
      {copy.hint && <p className="mt-1 font-mono text-sm text-zinc-400">{copy.hint}</p>}
      <p className="mt-3 text-sm text-zinc-500">No result was produced. THE CREW never shows a simulated AI result in live mode.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={onRetry} size="lg">
          <RotateCcw size={18} aria-hidden /> Retry
        </Button>
        <Button variant="secondary" size="lg" onClick={onCaseFile}>
          Run Case File 001 (works offline)
        </Button>
      </div>
    </motion.section>
  );
}
