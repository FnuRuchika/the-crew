import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { grandparentScam } from './data/scenarios/grandparentScam';
import { useOperation } from './hooks/useOperation';
import { buildMissionReport } from './mission-report/buildMissionReport';
import { MissionReport } from './mission-report/MissionReport';
import { LiveAnalysisScreen } from './live-analysis/LiveAnalysisScreen';
import { LandingScreen } from './screens/LandingScreen';
import { OperationScreen } from './screens/OperationScreen';

type Screen = 'landing' | 'operation' | 'report' | 'live';

/** Hash-based screen so refresh/back behave predictably without a router dependency. */
function screenFromHash(): Screen {
  const h = window.location.hash.replace('#/', '');
  return h === 'operation' ? 'operation' : h === 'report' ? 'report' : h === 'live' ? 'live' : 'landing';
}

export default function App() {
  const op = useOperation(grandparentScam);
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
    setScreen('landing');
  };

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {screen === 'landing' && <LandingScreen onBegin={begin} onTestCrew={() => setScreen('live')} />}
          {screen === 'live' && <LiveAnalysisScreen onHome={home} onCaseFile={begin} />}
          {screen === 'operation' && <OperationScreen op={op} onHome={home} onReport={() => setScreen('report')} />}
          {screen === 'report' && report && <MissionReport report={report} onReplay={replay} onHome={home} />}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
