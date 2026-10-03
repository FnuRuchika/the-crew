import { motion } from 'framer-motion';
import { BookOpen, FileText, Home, RotateCcw, ShieldCheck, Target } from 'lucide-react';
import { Brand } from '../components/Brand';
import { AgentAvatar } from '../components/crew/AgentCard';
import { Button, Panel } from '../components/ui/primitives';
import { CREW, FIELD_AGENTS } from '../data/crew';
import { cx, formatClock, formatDuration, formatMoney } from '../lib/format';
import { SEVERITY_STYLE } from '../lib/riskStyle';
import { EventTimeline } from './EventTimeline';
import type { MissionReportData } from './buildMissionReport';

const LESSONS = [
  {
    title: 'Hang up and call back on a number you already have',
    text: 'Caller ID and phone numbers can be faked. Your saved contacts cannot be.',
  },
  {
    title: '"Don\'t tell anyone" is the biggest red flag',
    text: 'Real emergencies welcome help from family. Only scams need secrecy.',
  },
  {
    title: 'Urgency is a tactic, not a fact',
    text: 'Courts and police do not take bail by bank transfer, gift card or crypto over the phone.',
  },
];

export function MissionReport({ report, onReplay, onHome }: { report: MissionReportData; onReplay: () => void; onHome: () => void }) {
  const summary = [
    { label: 'Amount protected', value: formatMoney(report.amountProtected), tone: 'text-emerald-300' },
    { label: 'Peak risk', value: `${report.peakRisk}%`, tone: 'text-red-300' },
    { label: 'Warning sign → intervention', value: report.timeToIntervention !== undefined ? formatDuration(report.timeToIntervention) : '—', tone: 'text-gold-300' },
    { label: 'Crew deployed', value: `${report.crewDeployed.length} of ${FIELD_AGENTS.length}`, tone: 'text-zinc-100' },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-vault-700 bg-vault-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5">
          <button onClick={onHome} className="rounded-md p-1 hover:bg-white/5" aria-label="Back to mission control">
            <Brand compact />
          </button>
          <span className="op-label ml-2 hidden sm:inline">Mission report</span>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={onReplay}>
              <RotateCcw size={15} aria-hidden /> Replay operation
            </Button>
            <Button variant="ghost" size="sm" onClick={onHome}>
              <Home size={15} aria-hidden /> Mission control
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-20 pt-10">
        {/* Dossier header */}
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="brackets panel relative overflow-hidden p-7 sm:p-9">
          <motion.div
            initial={{ opacity: 0, scale: 1.6, rotate: -18 }}
            animate={{ opacity: 1, scale: 1, rotate: -9 }}
            transition={{ delay: 0.35, type: 'spring', stiffness: 160, damping: 14 }}
            className="pointer-events-none absolute right-6 top-6 hidden rounded-md border-4 border-emerald-500/70 px-4 py-2 font-display text-2xl uppercase tracking-[0.2em] text-emerald-400/90 sm:block"
            aria-hidden
          >
            Operation complete
          </motion.div>
          <p className="op-label flex items-center gap-2 text-gold-400">
            <FileText size={13} aria-hidden /> Case file {report.caseNumber} · Classified
          </p>
          <h1 className="mt-3 font-display text-5xl uppercase tracking-wide text-zinc-50">Mission report</h1>
          <p className="mt-1 text-xl text-zinc-300">
            {report.title} · Protecting {report.targetName}
          </p>
          <dl className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {summary.map((s) => (
              <div key={s.label} className="rounded-xl border border-vault-600 bg-vault-900/80 p-4">
                <dt className="op-label text-[10px]">{s.label}</dt>
                <dd className={cx('mt-1 font-display text-3xl', s.tone)}>{s.value}</dd>
              </div>
            ))}
          </dl>
        </motion.section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="flex flex-col gap-6">
            {/* Threat */}
            <Panel title="Threat" icon={<Target size={13} aria-hidden />}>
              <div className="p-5">
                <p className="font-display text-3xl uppercase tracking-wide text-red-300">{report.threat?.type ?? 'Unclassified'}</p>
                {report.threat && (
                  <>
                    <p className="mt-2 text-zinc-300">{report.threat.summary}</p>
                    <p className="mt-2 font-mono text-xs text-zinc-500">Mastermind confidence {Math.round(report.threat.confidence * 100)}%</p>
                  </>
                )}
              </div>
            </Panel>

            {/* Signals */}
            <Panel title="Signals" right={<span className="op-label">Contribution to risk</span>}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[15px]">
                  <caption className="sr-only">Signals detected, with severity and contribution to risk</caption>
                  <thead>
                    <tr className="border-b border-vault-700">
                      <th className="op-label px-5 py-2 font-normal">Signal</th>
                      <th className="op-label px-3 py-2 font-normal">Detected by</th>
                      <th className="op-label px-3 py-2 font-normal">Severity</th>
                      <th className="op-label px-5 py-2 text-right font-normal">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.signals.map((s) => (
                      <tr key={s.id} className="border-b border-vault-800 last:border-0">
                        <td className="px-5 py-2.5">
                          <p className="font-medium text-zinc-100">{s.label}</p>
                          <p className="text-sm text-zinc-500">{s.evidence ? `“${s.evidence}”` : s.detail}</p>
                        </td>
                        <td className="px-3 py-2.5 text-zinc-300">{CREW[s.detectedBy].name.replace(/^The /, '')}</td>
                        <td className="px-3 py-2.5">
                          <span className={cx('rounded border px-1.5 py-0.5 font-mono text-[11px] font-bold', SEVERITY_STYLE[s.severity].chip)}>
                            {SEVERITY_STYLE[s.severity].label}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono text-red-300">+{s.delta}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            {/* Intervention + outcome */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="panel p-5">
                <p className="op-label">Intervention</p>
                <p className="mt-2 font-display text-2xl uppercase tracking-wide text-gold-300">{report.interventionLabel}</p>
                {report.verifiedBy && <p className="mt-1 text-zinc-400">Claim disproven by {report.verifiedBy} via a saved number.</p>}
              </div>
              <div className="panel border-emerald-500/40 p-5">
                <p className="op-label">Outcome</p>
                <p className="mt-2 flex items-center gap-2 font-display text-2xl uppercase tracking-wide text-emerald-300">
                  <ShieldCheck size={24} aria-hidden /> {report.outcome}
                </p>
                <p className="mt-1 text-zinc-400">{formatMoney(report.amountProtected)} protected</p>
              </div>
            </div>

            {/* Educate */}
            <Panel title="For next time" icon={<BookOpen size={13} aria-hidden />}>
              <ul className="grid gap-3 p-5 md:grid-cols-3">
                {LESSONS.map((l) => (
                  <li key={l.title} className="rounded-lg border border-vault-700 bg-vault-900/60 p-4">
                    <p className="font-semibold text-zinc-100">{l.title}</p>
                    <p className="mt-1 text-sm text-zinc-400">{l.text}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          {/* Crew */}
          <Panel title="Crew deployed" right={<span className="font-mono text-xs text-gold-300">{report.crewDeployed.length}/{FIELD_AGENTS.length}</span>} className="self-start">
            <ul className="flex flex-col gap-3 p-4">
              {report.crewDeployed.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <AgentAvatar id={c.id} status="complete" size={38} />
                  <div>
                    <p className="font-display text-lg uppercase tracking-wide text-zinc-100">{CREW[c.id].name}</p>
                    <p className="font-mono text-[11px] text-zinc-500">
                      {CREW[c.id].role} · in at {formatClock(c.activatedAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* Timeline */}
        <Panel title="Chronological event timeline" className="mt-6" right={<span className="op-label">{formatDuration(report.durationSeconds)} total</span>}>
          <div className="p-6">
            <EventTimeline events={report.timeline} />
          </div>
        </Panel>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={onReplay}>
            <RotateCcw size={18} aria-hidden /> Replay operation
          </Button>
          <Button size="lg" variant="secondary" onClick={onHome}>
            <Home size={18} aria-hidden /> Mission control
          </Button>
        </div>
      </main>
    </div>
  );
}
