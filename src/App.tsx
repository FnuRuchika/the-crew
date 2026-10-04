import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { grandparentScam } from './data/scenarios/grandparentScam';
import { useOperation } from './hooks/useOperation';
import { buildMissionReport } from './mission-report/buildMissionReport';
import { MissionReport } from './mission-report/MissionReport';
import { LiveAnalysisScreen } from './live-analysis/LiveAnalysisScreen';
import { LiveCallScreen } from './live-call/LiveCallScreen';
import { useCaseFileLedger } from './ledger/useCaseFileLedger';
import { useLedgerSnapshot } from './ledger/useLedger';
import { LandingScreen } from './screens/LandingScreen';
import { OperationScreen } from './screens/OperationScreen';
import { useCaseFileVoice } from './voice/useCaseFileVoice';
import { useVoice } from './voice/useVoice';
import { buildCaseFileVoiceScript } from './voice/voiceScript';

const caseFileVoice = buildCaseFileVoiceScript(grandparentScam);

type Screen = 'landing' | 'operation' | 'report' | 'live' | 'call';

/** Hash-based screen so refresh/back behave predictably without a router dependency. */
function screenFromHash(): Screen {
  const h = window.location.hash.replace('#/', '');
  return h === 'operation' ? 'operation' : h === 'report' ? 'report' : h === 'live' ? 'live' : h === 'call' ? 'call' : 'landing';
}

export default function App() {
  const voice = useVoice();
  // Auto-play waits for the current line to finish so speech is never cut off mid-sentence.
  const op = useOperation(grandparentScam, { holdAutoPlay: voice.speaking });
  const [screen, setScreenState] = useState<Screen>(() => {
    const s = screenFromHash();
    // A report needs a finished operation; fall back on refresh.
    return s === 'report' ? 'landing' : s;
  });

  const setScreen = useCallback((s: Screen) => {
    setScreenState(s);
    const hash = s === 'landing' ? '' : `#/${s}`;
    if (window.location.hash !== hash) history.pushState(null, '', hash || window.location.pathname);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onPop = () => {
      const s = screenFromHash();
      setScreenState(s === 'report' && op.state.phase !== 'protected' ? 'operation' : s);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [op.state.phase]);

  useCaseFileVoice(op.state, voice, caseFileVoice, screen === 'operation');
  // Evidence ledger (Tiger Data). Observes the operation; never changes it.
  const caseLedger = useLedgerSnapshot(useCaseFileLedger(op.state));

  const report = useMemo(() => (screen === 'report' ? buildMissionReport(op.state) : null), [screen, op.state]);

  const begin = () => {
    if (op.state.phase === 'protected') op.reset();
    setScreen('operation');
  };
  const replay = () => {
    op.reset();
    setScreen('operation');
  };
  const home = () => {
    op.setAutoPlay(false);
    voice.stop();
    setScreen('landing');
  };

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {screen === 'landing' && <LandingScreen onBegin={begin} onTestCrew={() => setScreen('live')} onLiveCall={() => setScreen('call')} />}
          {screen === 'call' && <LiveCallScreen voice={voice} onHome={home} onCaseFile={begin} onTyped={() => setScreen('live')} />}
          {screen === 'live' && <LiveAnalysisScreen onHome={home} onCaseFile={begin} />}
          {screen === 'operation' && <OperationScreen op={op} onHome={home} onReport={() => setScreen('report')} voice={voice} voiceScript={caseFileVoice} ledgerOffline={caseLedger.connection === 'offline' && op.state.phase !== 'briefing'} />}
          {screen === 'report' && report && <MissionReport report={report} onReplay={replay} onHome={home} voicePowered={voice.used} ledger={caseLedger.entries.length ? caseLedger : undefined} />}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
