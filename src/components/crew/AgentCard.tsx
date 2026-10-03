import { motion } from 'framer-motion';
import { CREW } from '../../data/crew';
import { cx } from '../../lib/format';
import type { AgentId, AgentRuntime } from '../../types';
import { AGENT_ICONS, STATUS_STYLE } from './agentVisuals';

export function AgentAvatar({ id, status, size = 40 }: { id: AgentId; status: AgentRuntime['status']; size?: number }) {
  const Icon = AGENT_ICONS[id];
  const style = STATUS_STYLE[status];
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {status === 'active' && (
        <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-gold-400" aria-hidden />
      )}
      <span
        className={cx('relative inline-flex h-full w-full items-center justify-center rounded-full transition-colors duration-500', style.icon)}
      >
        <Icon size={size * 0.48} strokeWidth={2} aria-hidden />
      </span>
    </span>
  );
}

export function StatusChip({ status }: { status: AgentRuntime['status'] }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider', s.chip)}>
      {status === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {s.label}
    </span>
  );
}

/** Compact live card used in the operation crew panel. */
export function AgentCard({ id, runtime }: { id: AgentId; runtime: AgentRuntime }) {
  const agent = CREW[id];
  const s = STATUS_STYLE[runtime.status];
  const dim = runtime.status === 'standby' && !runtime.note;
  return (
    <motion.li
      layout
      className={cx(
        'flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-500',
        s.ring,
        runtime.status === 'active' ? 'bg-gold-400/[0.06]' : 'bg-vault-900/60',
        dim && 'opacity-60',
      )}
    >
      <AgentAvatar id={id} status={runtime.status} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cx('truncate font-display text-[15px] uppercase tracking-wide', runtime.status === 'standby' ? 'text-zinc-400' : 'text-zinc-100')}>
            {agent.name.replace(/^The /, '')}
          </p>
          <StatusChip status={runtime.status} />
        </div>
        <p className="truncate text-xs text-zinc-500">{agent.role}</p>
        {runtime.note && (
          <motion.p
            key={runtime.note}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1 text-[13px] leading-snug text-zinc-300"
          >
            {runtime.note}
          </motion.p>
        )}
      </div>
    </motion.li>
  );
}
