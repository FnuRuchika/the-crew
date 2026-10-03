import { AnimatePresence, motion } from 'framer-motion';
import { Radio } from 'lucide-react';
import { AgentAvatar } from '../components/crew/AgentCard';
import type { OperationState } from '../types';

/** "GRIFTER ACTIVATED · Reason: Emotional leverage detected": the latest crew move. */
export function SpotlightBanner({ spotlight }: { spotlight: OperationState['spotlight'] }) {
  return (
    <div className="relative h-[68px] shrink-0" aria-live="polite">
      <AnimatePresence mode="wait">
        {spotlight ? (
          <motion.div
            key={spotlight.key}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 flex items-center gap-3 overflow-hidden rounded-xl border border-gold-400/50 bg-gradient-to-r from-gold-400/15 via-vault-850 to-vault-850 px-4"
          >
            <motion.span
              className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-gold-300/15 to-transparent"
              initial={{ x: '-100%' }}
              animate={{ x: '400%' }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
              aria-hidden
            />
            <AgentAvatar id={spotlight.agentId} status="active" size={40} />
            <div className="min-w-0">
              <p className="font-display text-xl uppercase tracking-[0.14em] text-gold-300">{spotlight.title}</p>
              <p className="truncate text-sm text-zinc-300">
                <span className="text-zinc-500">Reason:</span> {spotlight.reason}
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center gap-3 rounded-xl border border-dashed border-vault-600 px-4 text-zinc-500"
          >
            <Radio size={18} aria-hidden />
            <span className="font-mono text-xs uppercase tracking-widest">Mastermind listening · crew on standby</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
