import { motion } from 'framer-motion';
import {
  ArrowRight,
  BellRing,
  Eye,
  HeartHandshake,
  Hourglass,
  Lock,
  MessageSquareWarning,
  Mic,
  ScanSearch,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { Brand, VaultDial } from '../components/Brand';
import { AGENT_ICONS } from '../components/crew/agentVisuals';
import { CREW, FIELD_AGENTS } from '../data/crew';

const PIPELINE: { label: string; text: string; icon: LucideIcon }[] = [
  { label: 'Detect', text: 'Spot manipulation as the call unfolds', icon: Eye },
  { label: 'Understand', text: 'Weigh evidence from specialised agents', icon: ScanSearch },
  { label: 'Verify', text: 'Check claims against trusted context', icon: HeartHandshake },
  { label: 'Interrupt', text: 'Smart friction at the moment money moves', icon: Hourglass },
  { label: 'Protect', text: 'Hold the payment until it is safe', icon: Lock },
  { label: 'Educate', text: 'Explain the con, without blame', icon: MessageSquareWarning },
];

const SWIVEL: { q: string; a: string }[] = [
  {
    q: 'What does the shield notice?',
    a: 'Urgency, fear, secrecy and authority in the conversation, plus unusual payments, new recipients and identity mismatches.',
  },
  {
    q: 'When does it intervene?',
    a: 'Not on a hunch. Only when money is about to move and several independent crew members agree the risk is critical.',
  },
  {
    q: 'What happens next?',
    a: 'The payment is held. The Fixer offers safe options: call a trusted contact, verify on a known number, or simply wait.',
  },
  {
    q: 'Why would the user listen?',
    a: 'Every warning shows exactly what was noticed, in plain words, and gets confirmed by someone they already trust.',
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

function MissionSelector({ onBegin, onTestCrew, onLiveCall }: { onBegin: () => void; onTestCrew: () => void; onLiveCall: () => void }) {
  const missions: { n: string; title: string; text: string; badge: string; icon: LucideIcon; onClick: () => void; primary?: boolean }[] = [
    { n: '01', title: 'Run case file 001', text: 'Scripted cinematic demonstration', badge: 'Works offline', icon: ArrowRight, onClick: onBegin, primary: true },
    { n: '02', title: 'Test the crew', text: 'Type a suspicious communication', badge: 'Live · Gemini', icon: ScanSearch, onClick: onTestCrew },
    { n: '03', title: 'Live call', text: 'Analyze spoken communication', badge: 'Live · Voice + Gemini', icon: Mic, onClick: onLiveCall },
  ];
  return (
    <ul className="grid w-full gap-3 sm:grid-cols-3" aria-label="Choose a mission">
      {missions.map((m) => (
        <li key={m.n} className="flex">
        <button
          onClick={m.onClick}
          className={
            'group flex w-full flex-col items-start rounded-xl border p-4 text-left transition-colors ' +
            (m.primary ? 'border-gold-400/70 bg-gold-400/10 hover:bg-gold-400/20' : 'border-vault-600 bg-vault-900/70 hover:border-gold-500/60')
          }
        >
          <span className="flex w-full items-center justify-between">
            <span className="font-mono text-[11px] text-zinc-500">{m.n}</span>
            <m.icon size={18} className="text-gold-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
          <span className="mt-2 font-display text-xl uppercase tracking-[0.12em] text-zinc-50">{m.title}</span>
          <span className="mt-0.5 text-sm text-zinc-400">{m.text}</span>
          <span className="mt-3 rounded border border-emerald-500/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-emerald-300">{m.badge}</span>
        </button>
        </li>
      ))}
    </ul>
  );
}

export function LandingScreen({ onBegin, onTestCrew, onLiveCall }: { onBegin: () => void; onTestCrew: () => void; onLiveCall: () => void }) {
  const Mastermind = AGENT_ICONS.mastermind;
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="vignette pointer-events-none absolute inset-0" aria-hidden />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Brand />
        <div className="hidden items-center gap-4 sm:flex">
          <span className="op-label">RowdyHacks 2026</span>
          <span className="rounded border border-gold-500/40 px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-gold-300">
            Swivel · Social Engineering Shield
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 pb-24">
        {/* HERO */}
        <section className="grid items-center gap-10 pt-8 lg:grid-cols-[1.15fr_0.85fr] lg:pt-16">
          <motion.div initial="hidden" animate="show" transition={{ staggerChildren: 0.12 }}>
            <motion.p variants={fadeUp} className="op-label flex items-center gap-2 text-gold-400/80">
              <span className="h-px w-8 bg-gold-500/60" /> Classified · Counter-heist unit
            </motion.p>
            <motion.h1
              variants={fadeUp}
              className="mt-5 font-display text-7xl font-semibold leading-[0.9] tracking-tight text-zinc-50 sm:text-8xl lg:text-[8.5rem]"
            >
              THE CREW
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-5 font-display text-2xl uppercase tracking-wide text-gold-400 sm:text-3xl">
              Stop the heist before the vault opens.
            </motion.p>
            <motion.p variants={fadeUp} className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-300">
              Scammers don't hack the account. They manipulate the person who holds the key. THE CREW is an AI
              counter-heist team that detects social engineering <em className="not-italic text-zinc-50">while it's happening</em>,
              and steps in before the money leaves.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-9">
              <MissionSelector onBegin={onBegin} onTestCrew={onTestCrew} onLiveCall={onLiveCall} />
              <a href="#crew" className="op-label mt-4 inline-block text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline">
                Meet the crew ↓
              </a>
            </motion.div>
            <motion.div variants={fadeUp} className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-zinc-400">
              <span className="flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-400" aria-hidden /> Explainable evidence</span>
              <span className="flex items-center gap-2"><HeartHandshake size={16} className="text-emerald-400" aria-hidden /> Trusted-contact verification</span>
              <span className="flex items-center gap-2"><BellRing size={16} className="text-emerald-400" aria-hidden /> Friction only when it matters</span>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.2 }}
            className="relative mx-auto hidden lg:block"
          >
            <VaultDial size={400} />
            <div className="absolute -bottom-2 left-1/2 w-max -translate-x-1/2 rounded-md border border-vault-600 bg-vault-900/90 px-4 py-2 text-center">
              <p className="op-label">Case file 001</p>
              <p className="font-display text-lg uppercase tracking-wider text-zinc-100">The Grandparent Call</p>
            </div>
          </motion.div>
        </section>

        {/* CREW ROSTER */}
        <section id="crew" className="mt-28 scroll-mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="op-label text-gold-400/80">Personnel files</p>
              <h2 className="mt-2 font-display text-4xl uppercase tracking-wide text-zinc-50">Assemble the crew</h2>
            </div>
            <p className="max-w-md text-zinc-400">
              Not everyone is called in. The Mastermind deploys each specialist only when the situation needs them.
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            className="brackets panel mt-8 flex flex-col gap-6 p-6 sm:flex-row sm:items-center"
          >
            <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gold-400 text-vault-950">
              <Mastermind size={40} aria-hidden />
            </span>
            <div className="flex-1">
              <p className="op-label">File {CREW.mastermind.fileNo} · {CREW.mastermind.role}</p>
              <h3 className="font-display text-3xl uppercase tracking-wide text-zinc-50">{CREW.mastermind.name}</h3>
              <p className="mt-1 text-zinc-300">{CREW.mastermind.tagline} Watches every operation and decides who joins.</p>
            </div>
            <span className="rounded border border-gold-500/40 px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-gold-300">
              Gemini-ready orchestrator
            </span>
          </motion.div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FIELD_AGENTS.map((id, i) => {
              const a = CREW[id];
              const Icon = AGENT_ICONS[id];
              return (
                <motion.article
                  key={id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ delay: i * 0.07, duration: 0.45 }}
                  className="group panel relative overflow-hidden p-5 transition-colors hover:border-gold-500/50"
                >
                  <span className="absolute right-4 top-3 font-display text-5xl text-vault-700 transition-colors group-hover:text-gold-500/30" aria-hidden>
                    {a.fileNo}
                  </span>
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-gold-500/40 bg-gold-400/10 text-gold-300">
                    <Icon size={24} aria-hidden />
                  </span>
                  <p className="op-label mt-4">{a.role}</p>
                  <h3 className="font-display text-2xl uppercase tracking-wide text-zinc-50">{a.name}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-zinc-300">{a.tagline}</p>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {a.specialties.map((s) => (
                      <li key={s} className="rounded border border-vault-600 px-2 py-0.5 text-xs text-zinc-400">{s}</li>
                    ))}
                  </ul>
                  <p className="mt-4 border-t border-vault-700 pt-3 text-sm text-zinc-500">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-gold-500">Deployed </span>
                    {a.deployedWhen.replace(/^When/, 'when')}
                  </p>
                </motion.article>
              );
            })}
          </div>
        </section>

        {/* SWIVEL ANSWERS */}
        <section className="mt-28">
          <p className="op-label text-gold-400/80">Operational doctrine</p>
          <h2 className="mt-2 font-display text-4xl uppercase tracking-wide text-zinc-50">How the shield works</h2>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {PIPELINE.map((p, i) => (
              <li key={p.label} className="panel relative p-4">
                <span className="font-mono text-[11px] text-zinc-600">0{i + 1}</span>
                <p.icon size={22} className="mt-2 text-gold-400" aria-hidden />
                <p className="mt-2 font-display text-xl uppercase tracking-wide text-zinc-100">{p.label}</p>
                <p className="mt-1 text-sm text-zinc-400">{p.text}</p>
              </li>
            ))}
          </ol>
          <dl className="mt-6 grid gap-4 md:grid-cols-2">
            {SWIVEL.map((s) => (
              <div key={s.q} className="rounded-xl border border-vault-700 bg-vault-900/60 p-5">
                <dt className="font-display text-lg uppercase tracking-wide text-gold-300">{s.q}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-zinc-300">{s.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-24 flex flex-col items-center text-center">
          <p className="op-label">Case file 001 is ready</p>
          <p className="mt-3 max-w-2xl text-2xl text-zinc-200">
            Eleanor Parker, 78, is about to get a phone call about her grandson.
          </p>
          <div className="mt-8 w-full max-w-3xl">
            <MissionSelector onBegin={onBegin} onTestCrew={onTestCrew} onLiveCall={onLiveCall} />
          </div>
        </section>
      </main>
    </div>
  );
}
