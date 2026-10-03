import { motion, useSpring, useTransform } from 'framer-motion';
import { Gauge } from 'lucide-react';
import { useEffect } from 'react';
import { Panel } from '../components/ui/primitives';
import { RISK_THRESHOLDS } from '../engine/riskEngine';
import { cx, formatClock } from '../lib/format';
import { RISK_STYLE } from '../lib/riskStyle';
import type { RiskAssessment, RiskPoint } from '../types';

const SWEEP = 270;
const R = 78;
const C = 100;

function polar(angleDeg: number, r = R) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
}
const START = -SWEEP / 2;
const [sx, sy] = polar(START);
const [ex, ey] = polar(START + SWEEP);
const ARC = `M ${sx} ${sy} A ${R} ${R} 0 1 1 ${ex} ${ey}`;

function Sparkline({ history }: { history: RiskPoint[] }) {
  const w = 280;
  const h = 44;
  const maxT = Math.max(...history.map((p) => p.at), 1);
  const pts = history.map((p) => [(p.at / maxT) * (w - 8) + 4, h - 4 - (p.score / 100) * (h - 8)] as const);
  // Step line: risk only changes when evidence arrives.
  const d = pts.reduce((acc, [x, y], i) => (i === 0 ? `M ${x} ${y}` : `${acc} H ${x} V ${y}`), '');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" role="img" aria-label="Risk over time">
      <line x1="4" x2={w - 4} y1={h - 4 - 0.8 * (h - 8)} y2={h - 4 - 0.8 * (h - 8)} stroke="#ef4444" strokeOpacity="0.35" strokeDasharray="3 4" />
      <path d={d} fill="none" stroke="#e5b454" strokeWidth="2" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 4 : 2.5} fill={i === pts.length - 1 ? '#e5b454' : '#9a6f27'} stroke="#111114" strokeWidth="2">
          <title>{`${formatClock(history[i].at)}: ${history[i].score}%`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function RiskMeter({ assessment, history }: { assessment: RiskAssessment; history: RiskPoint[] }) {
  const style = RISK_STYLE[assessment.level];
  const LevelIcon = style.icon;
  const spring = useSpring(0, { stiffness: 60, damping: 18 });
  const pathLength = useTransform(spring, (v) => Math.max(0.0001, v / 100));
  const display = useTransform(spring, (v) => Math.round(v).toString());

  useEffect(() => {
    spring.set(assessment.score);
  }, [assessment.score, spring]);

  return (
    <Panel title="Risk level" icon={<Gauge size={13} aria-hidden />} right={<span className="op-label">Safecracker engine</span>}>
      <div className="flex flex-col items-center px-4 pb-3 pt-2">
        <div className="relative h-[150px] w-[170px]">
          <svg viewBox="0 0 200 190" className="absolute inset-0 h-full w-full" aria-hidden>
            <path d={ARC} fill="none" stroke="#222228" strokeWidth="14" strokeLinecap="round" />
            <motion.path
              d={ARC}
              fill="none"
              stroke={style.stroke}
              strokeWidth="14"
              strokeLinecap="round"
              style={{ pathLength }}
              animate={{ stroke: style.stroke }}
              transition={{ duration: 0.6 }}
            />
            {Object.values(RISK_THRESHOLDS).map((t) => {
              const [x1, y1] = polar(START + (SWEEP * t) / 100, R - 12);
              const [x2, y2] = polar(START + (SWEEP * t) / 100, R + 12);
              return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0c0c0e" strokeWidth="3" />;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-1" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={assessment.score} aria-label={`Risk ${assessment.score} percent, ${style.label}`}>
            <p className="font-display text-5xl font-semibold leading-none text-zinc-50 tabular-nums">
              <motion.span>{display}</motion.span>
              <span className="text-3xl text-zinc-400">%</span>
            </p>
          </div>
        </div>
        <motion.div
          key={assessment.level}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={cx('-mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-1 font-display text-lg uppercase tracking-[0.18em]', style.bg, style.text)}
        >
          <LevelIcon size={18} aria-hidden /> {style.label}
        </motion.div>
        <div className="mt-2 w-full">
          <div className="flex justify-between">
            <span className="op-label text-[10px]">Risk over time</span>
            <span className="op-label text-[10px] text-red-400/70">Critical ≥ {RISK_THRESHOLDS.critical}</span>
          </div>
          <Sparkline history={history} />
        </div>
      </div>
    </Panel>
  );
}
