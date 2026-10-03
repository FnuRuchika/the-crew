import { useCallback, useEffect, useRef, useState } from 'react';
import { CREW } from '../data/crew';
import { scoreLiveSignals, type LiveAssessment } from '../engine/liveRiskEngine';
import { RISK_STYLE } from '../lib/riskStyle';
import type { AgentId, AgentRuntime, OperationState } from '../types';
import { analyzeTransmission, fetchHealth } from './api';
import type { AnalyzeResponse, ApiError, HealthResponse } from './types';

export type LivePhase = 'idle' | 'receiving' | 'analyzing' | 'scoring' | 'done' | 'error';
export type HealthState = { kind: 'checking' } | { kind: 'online'; health: HealthResponse } | { kind: 'no-key'; health: HealthResponse } | { kind: 'offline' };

export const LIVE_CREW: AgentId[] = ['mastermind', 'grifter', 'safecracker'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface LiveRun {
  text: string;
  response?: AnalyzeResponse;
  assessment?: LiveAssessment;
  error?: ApiError;
}

export function useLiveAnalysis() {
  const [phase, setPhase] = useState<LivePhase>('idle');
  const [run, setRun] = useState<LiveRun | null>(null);
  const [health, setHealth] = useState<HealthState>({ kind: 'checking' });
  const [spotKey, setSpotKey] = useState(0);
  const gen = useRef(0);

  const checkHealth = useCallback(async () => {
    const r = await fetchHealth();
    if (!r.ok) setHealth({ kind: 'offline' });
    else setHealth(r.data.gemini_configured ? { kind: 'online', health: r.data } : { kind: 'no-key', health: r.data });
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  const analyze = useCallback(
    async (text: string) => {
      const g = ++gen.current;
      const alive = () => g === gen.current;
      setRun({ text });
      setPhase('receiving');
      setSpotKey((k) => k + 1);
      await sleep(650);
      if (!alive()) return;
      setPhase('analyzing');
      setSpotKey((k) => k + 1);

      const [result] = await Promise.all([analyzeTransmission(text), sleep(900)]);
      if (!alive()) return;
      if (!result.ok) {
        setRun({ text, error: result.error });
        setPhase('error');
        // Re-check so the status chip reflects reality (e.g. backend down, key missing).
        void checkHealth();
        return;
      }
      setRun({ text, response: result.data });
      setPhase('scoring');
      setSpotKey((k) => k + 1);
      await sleep(1100);
      if (!alive()) return;
      setRun({ text, response: result.data, assessment: scoreLiveSignals(result.data.analysis.signals) });
      setPhase('done');
      setSpotKey((k) => k + 1);
    },
    [checkHealth],
  );

  const reset = useCallback(() => {
    gen.current++;
    setRun(null);
    setPhase('idle');
  }, []);

  // Crew cards are derived from the phase so the visuals always match reality.
  const signals = run?.response?.analysis.signals.length ?? 0;
  const verdict = run?.assessment;
  const agents: Record<'mastermind' | 'grifter' | 'safecracker', AgentRuntime> = {
    mastermind:
      phase === 'idle'
        ? { status: 'standby', note: 'Awaiting transmission' }
        : phase === 'error'
          ? { status: 'active', activatedAt: 0, note: 'Transmission could not be analysed' }
          : phase === 'done'
            ? { status: 'complete', activatedAt: 0, note: `Transmission received · ${run?.text.length ?? 0} characters` }
            : { status: 'active', activatedAt: 0, note: `Transmission received · ${run?.text.length ?? 0} characters` },
    grifter:
      phase === 'idle' || phase === 'receiving'
        ? { status: 'standby', note: 'Gemini-powered manipulation analysis' }
        : phase === 'analyzing'
          ? { status: 'active', activatedAt: 0, note: 'Analyzing manipulation with Gemini…' }
          : phase === 'error'
            ? { status: 'standby', note: 'No analysis returned' }
            : { status: 'complete', activatedAt: 0, note: signals ? `${signals} signal${signals === 1 ? '' : 's'} identified` : 'No manipulation signals found' },
    safecracker:
      phase === 'scoring'
        ? { status: 'active', activatedAt: 0, note: 'Evaluating combined risk…' }
        : phase === 'done' && verdict
          ? { status: 'complete', activatedAt: 0, note: `Verdict: ${verdict.score}% · ${RISK_STYLE[verdict.level].label.toUpperCase()}` }
          : { status: 'standby', note: 'Deterministic risk engine' },
  };

  const spotlightAgent: AgentId | null =
    phase === 'receiving' ? 'mastermind' : phase === 'analyzing' ? 'grifter' : phase === 'scoring' || phase === 'done' ? 'safecracker' : null;
  const spotlight: OperationState['spotlight'] = spotlightAgent
    ? {
        agentId: spotlightAgent,
        key: spotKey,
        title: `${CREW[spotlightAgent].name.replace(/^The /, '')} ${phase === 'done' ? 'VERDICT' : 'ACTIVATED'}`,
        reason:
          phase === 'receiving'
            ? 'Transmission received. Deploying the Grifter.'
            : phase === 'analyzing'
              ? 'Analyzing manipulation tactics with Gemini'
              : phase === 'scoring'
                ? `Combining ${signals} signal${signals === 1 ? '' : 's'} deterministically`
                : `Risk ${verdict?.score ?? 0}% · ${RISK_STYLE[verdict?.level ?? 'low'].label}`,
      }
    : null;

  return { phase, run, health, agents, spotlight, analyze, reset, checkHealth, busy: ['receiving', 'analyzing', 'scoring'].includes(phase) };
}
