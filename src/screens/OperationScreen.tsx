import { AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import type { OperationController } from '../hooks/useOperation';
import { InterventionLayer } from '../intervention/InterventionLayer';
import { cx } from '../lib/format';
import { ConversationFeed } from '../operation/ConversationFeed';
import { CrewPanel } from '../operation/CrewPanel';
import { OperationHeader } from '../operation/OperationHeader';
import { OpsLog } from '../operation/OpsLog';
import { PaymentPanel } from '../operation/PaymentPanel';
import { RiskMeter } from '../operation/RiskMeter';
import { SignalBoard } from '../operation/SignalBoard';
import { SpotlightBanner } from '../operation/SpotlightBanner';
import { TargetDossier } from '../operation/TargetDossier';
import type { VoiceController } from '../voice/useVoice';
import type { CaseFileVoiceScript } from '../voice/voiceScript';

export function OperationScreen({
  op,
  onHome,
  onReport,
  voice,
  voiceScript,
}: {
  op: OperationController;
  onHome: () => void;
  onReport: () => void;
  voice?: VoiceController;
  voiceScript?: CaseFileVoiceScript;
}) {
  const { state } = op;
  const clipId = voice?.speaking ? voice.currentClipId : null;
  const speakingMessageId = clipId?.startsWith('msg:') ? clipId.slice(4) : null;
  const readAloud = voice && voiceScript ? () => voice.play(voiceScript.intervention, { force: true }) : undefined;
  const showPayment = state.payment !== null && ['payment', 'analyzing', 'intervention', 'verifying', 'cooldown', 'exit'].includes(state.phase);

  const handleNext = () => (state.phase === 'protected' ? onReport() : op.next());

  // Presenter shortcut: → or N advances the scenario.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (state.phase === 'protected') onReport();
        else if (op.canAdvance) op.next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [op, state.phase, onReport]);

  return (
    <div className="relative min-h-screen">
      <div className="bg-grid pointer-events-none fixed inset-0 opacity-60" aria-hidden />
      <OperationHeader op={op} caseNumber={state.mission.caseNumber} onHome={onHome} onNext={handleNext} voice={voice} />

      <main className="relative grid gap-4 p-4 lg:h-[calc(100vh-4rem)] lg:grid-cols-[300px_minmax(0,1fr)_340px] lg:overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)_370px]">
        {/* LEFT: target + crew */}
        <div className="flex min-h-0 flex-col gap-4">
          <TargetDossier mission={state.mission} />
          <CrewPanel agents={state.agents} />
        </div>

        {/* CENTER: spotlight + conversation (+ payment) */}
        <div className="flex min-h-0 flex-col gap-4">
          <SpotlightBanner spotlight={state.spotlight} />
          <div className={cx('grid min-h-[420px] flex-1 gap-4', showPayment && 'xl:grid-cols-2')}>
            <div className="min-h-0">
              <ConversationFeed
                messages={state.messages}
                signals={state.signals}
                phase={state.phase}
                callerNumber={state.mission.callerNumber}
                targetName={state.mission.target.name}
                clock={state.clock}
                onStart={op.next}
                canStart={op.canAdvance}
                compact={showPayment}
                speakingMessageId={speakingMessageId}
              />
            </div>
            <AnimatePresence>
              {showPayment && state.payment && (
                <div className="min-h-0">
                  <PaymentPanel
                    payment={state.payment}
                    phase={state.phase}
                    agents={state.agents}
                    signals={state.signals}
                    onSubmit={op.submitPayment}
                    busy={op.busy}
                    targetName={state.mission.target.name}
                  />
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT: risk + signals + log */}
        <div className="flex min-h-0 flex-col gap-4">
          <RiskMeter assessment={state.assessment} history={state.riskHistory} />
          <SignalBoard signals={state.signals} assessment={state.assessment} />
          <OpsLog log={state.log} className="shrink-0" />
        </div>
      </main>

      <InterventionLayer op={op} onReport={onReport} onReadAloud={readAloud} guardianSpeaking={clipId === voiceScript?.intervention.id} />
    </div>
  );
}
