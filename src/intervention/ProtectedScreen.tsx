import { motion } from 'framer-motion';
import { FileText, RotateCcw } from 'lucide-react';
import { VaultDial } from '../components/Brand';
import { Button } from '../components/ui/primitives';
import { formatMoney } from '../lib/format';
import type { MissionReportData } from '../mission-report/buildMissionReport';

export function ProtectedScreen({ report, onReport, onReplay }: { report: MissionReportData; onReport: () => void; onReplay: () => void }) {
  const stats = [
    { label: 'Peak risk', value: `${report.peakRisk}%` },
    { label: 'Signals', value: String(report.signals.length) },
    { label: 'Crew deployed', value: `${report.crewDeployed.length}/6` },
    { label: 'Verified by', value: report.verifiedBy ?? 'Safe exit' },
  ];
  return (
    <div className="flex flex-col items-center text-center" role="status" aria-live="assertive">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}>
        <VaultDial size={190} locked />
      </motion.div>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="op-label mt-4 text-emerald-300">
        Vault secured · Operation complete
      </motion.p>
      <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="mt-3 font-display text-5xl font-semibold uppercase tracking-wide text-zinc-50 sm:text-6xl">
        Payment stopped
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.8, type: 'spring' }}
        className="mt-3 font-display text-6xl font-semibold uppercase tracking-wide text-emerald-400 sm:text-8xl"
      >
        {formatMoney(report.amountProtected)} protected
      </motion.p>
      <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="mt-9 grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-vault-600 bg-vault-900 px-3 py-3">
            <dt className="op-label text-[10px]">{s.label}</dt>
            <dd className="mt-1 truncate font-display text-2xl text-zinc-100">{s.value}</dd>
          </div>
        ))}
      </motion.dl>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }} className="mt-9 flex flex-wrap justify-center gap-3">
        <Button size="xl" onClick={onReport} autoFocus className="font-display uppercase tracking-[0.16em]">
          <FileText size={22} aria-hidden /> View mission report
        </Button>
        <Button size="xl" variant="secondary" onClick={onReplay}>
          <RotateCcw size={20} aria-hidden /> Replay
        </Button>
      </motion.div>
    </div>
  );
}
