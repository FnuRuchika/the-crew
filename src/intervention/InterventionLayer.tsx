import { AnimatePresence, motion } from 'framer-motion';
import type { OperationController } from '../hooks/useOperation';
import { buildMissionReport } from '../mission-report/buildMissionReport';
import { CooldownPanel } from './CooldownPanel';
import { GetawayPanel } from './GetawayPanel';
import { InterventionPanel } from './InterventionPanel';
import { ProtectedScreen } from './ProtectedScreen';
import { VerificationPanel } from './VerificationPanel';

/**
 * Full-screen layer for everything after the Fixer steps in. Deliberately simpler than
 * the command centre behind it: one message, one decision at a time, large text.
 */
export function InterventionLayer({
  op,
  onReport,
  onReadAloud,
  guardianSpeaking,
}: {
  op: OperationController;
  onReport: () => void;
  onReadAloud?: () => Promise<boolean>;
  guardianSpeaking?: boolean;
}) {
  const { state, busy } = op;
  const { phase, intervention, payment, verification } = state;
  const open = ['intervention', 'verifying', 'cooldown', 'exit', 'protected'].includes(phase) && intervention !== null && payment !== null;
  const pressure = state.messages.find((m) => m.id === 'm-pressure');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto bg-vault-950/85 backdrop-blur-md"
        >
          {phase === 'intervention' && (
            <motion.div className="pointer-events-none fixed inset-x-0 top-16 h-1 bg-red-500" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }} aria-hidden />
          )}
          <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={phase}
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
              >
                {phase === 'intervention' && (
                  <InterventionPanel intervention={intervention!} payment={payment!} targetName={state.mission.target.name} onChoose={op.chooseAction} busy={busy} onReadAloud={onReadAloud} speaking={guardianSpeaking} />
                )}
                {phase === 'verifying' && verification && (
                  <VerificationPanel verification={verification} target={state.mission.target} onStop={op.stopPaymentAndExit} busy={busy} />
                )}
                {phase === 'cooldown' && (
                  <CooldownPanel intervention={intervention!} payment={payment!} pressure={pressure} onPressure={op.injectPressure} onChoose={op.chooseAction} busy={busy} />
                )}
                {phase === 'exit' && (
                  <GetawayPanel steps={state.exitPlan} payment={payment!} accountLabel={state.mission.target.account.label} onComplete={op.completeOperation} busy={busy} />
                )}
                {phase === 'protected' && <ProtectedScreen report={buildMissionReport(state)} onReport={onReport} onReplay={op.reset} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
