import { useCallback, useEffect, useRef, useState } from 'react';
import { scoreLiveSignals, type LiveAssessment } from '../engine/liveRiskEngine';
import { analyzeTransmission } from '../live-analysis/api';
import type { ApiError } from '../live-analysis/types';
import type { AgentId, AgentRuntime, InterventionActionId, Intervention, MissionEvent, OperationState, RiskPoint } from '../types';
import { fetchClip } from '../voice/voiceApi';
import { DEMO_CALL_SEGMENTS } from './liveCallScript';
import {
  AGENT_NAME,
  applyDeployments,
  buildAnalysisText,
  buildLiveIntervention,
  initialLiveAgents,
  mergeSignals,
  planLiveCrew,
  type LedgerSignal,
  type Segment,
} from './liveSession';
import { transcribeAudio } from './transcribeApi';

export const MAX_SEGMENT_SECONDS = 30;
export const MIN_SEGMENT_SECONDS = 1;

export type MicState = 'idle' | 'requesting' | 'listening' | 'processing' | 'denied' | 'unsupported' | 'error';
export type InterventionStage = 'none' | 'open' | 'exit' | 'closed';

interface Session {
  startedAt: number | null;
  segments: Segment[];
  ledger: LedgerSignal[];
  assessment: LiveAssessment;
  history: RiskPoint[];
  agents: Record<AgentId, AgentRuntime>;
  log: MissionEvent[];
  spotlight: OperationState['spotlight'];
  claimedIdentity: string | null;
  requestedAction: string | null;
  summary: string | null;
  analysis: { status: 'idle' | 'analyzing' | 'failed' | 'done'; error?: ApiError; model?: string; latencyMs?: number };
  intervention: Intervention | null;
  stage: InterventionStage;
  chosenAction: InterventionActionId | null;
  demoIndex: number;
}

const EMPTY_ASSESSMENT: LiveAssessment = { score: 0, level: 'low', contributions: [], countedSignals: 0 };

function freshSession(): Session {
  return {
    startedAt: null,
    segments: [],
    ledger: [],
    assessment: EMPTY_ASSESSMENT,
    history: [{ at: 0, score: 0 }],
    agents: initialLiveAgents(),
    log: [],
    spotlight: null,
    claimedIdentity: null,
    requestedAction: null,
    summary: null,
    analysis: { status: 'idle' },
    intervention: null,
    stage: 'none',
    chosenAction: null,
    demoIndex: 0,
  };
}

const MIC_ERRORS: Record<string, string> = {
  NotAllowedError: 'Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.',
  SecurityError: 'Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.',
  NotFoundError: 'No microphone was found. Connect one, or use LOAD DEMO AUDIO.',
  NotReadableError: 'The microphone is busy in another app. Close it there, then try again.',
};

function pickMime(): string | undefined {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return options.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t));
}

let eventId = 0;

export function useLiveCall() {
  const [session, setSession] = useState<Session>(freshSession);
  const ref = useRef(session);
  const update = useCallback((fn: (s: Session) => Session) => {
    ref.current = fn(ref.current);
    setSession(ref.current);
  }, []);

  const [micState, setMicState] = useState<MicState>('idle');
  const [micError, setMicError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(28).fill(0));

  const gen = useRef(0);
  const mic = useRef<{ stream?: MediaStream; recorder?: MediaRecorder; ctx?: AudioContext; raf?: number; timer?: number; started?: number; chunks: Blob[] }>({ chunks: [] });
  const failedAudio = useRef(new Map<string, Blob>()); // kept in browser memory only, for Retry
  const demoAudio = useRef<HTMLAudioElement | null>(null);

  const now = () => (ref.current.startedAt ? (Date.now() - ref.current.startedAt) / 1000 : 0);

  const log = useCallback(
    (entry: Omit<MissionEvent, 'id' | 'at'>) =>
      update((s) => ({ ...s, log: [...s.log, { id: `live-${++eventId}`, at: now(), ...entry }] })),
    [update],
  );

  const ensureStarted = useCallback(() => {
    if (ref.current.startedAt) return;
    update((s) => ({ ...s, startedAt: Date.now(), agents: applyDeployments(s.agents, [{ agentId: 'mastermind', status: 'active', reason: 'Listening to the conversation.' }], 0) }));
    log({ type: 'operation', agent: 'mastermind', title: 'Live call session opened', detail: 'Mastermind listening' });
  }, [update, log]);

  // ─────────── Microphone ───────────

  const releaseMic = useCallback(() => {
    const m = mic.current;
    if (m.timer) clearInterval(m.timer);
    if (m.raf) cancelAnimationFrame(m.raf);
    m.stream?.getTracks().forEach((t) => t.stop()); // the browser's recording indicator turns off here
    void m.ctx?.close().catch(() => {});
    mic.current = { chunks: [] };
    setLevels(Array(28).fill(0));
  }, []);

  // ─────────── Pipeline: transcript → Gemini → deterministic score → crew ───────────

  const analyzeSession = useCallback(async () => {
    const g = gen.current;
    const text = buildAnalysisText(ref.current.segments);
    if (!text) return;
    update((s) => ({ ...s, analysis: { status: 'analyzing' } }));
    const r = await analyzeTransmission(text);
    if (g !== gen.current) return;
    if (!r.ok) {
      update((s) => ({ ...s, analysis: { status: 'failed', error: r.error } }));
      log({ type: 'assessment', agent: 'mastermind', title: 'Analysis temporarily unavailable', detail: r.error.code });
      return;
    }
    const at = now();
    const s0 = ref.current;
    const ledger = mergeSignals(s0.ledger, r.data.analysis.signals, s0.segments, at);
    const assessment = scoreLiveSignals(ledger);
    const claimedIdentity = r.data.analysis.claimed_identity ?? s0.claimedIdentity;
    const plan = planLiveCrew({ agents: s0.agents, ledger, assessment, claimedIdentity });
    const lastActive = [...plan.deployments].reverse().find((d) => d.status === 'active');

    update((s) => ({
      ...s,
      ledger,
      assessment,
      claimedIdentity,
      requestedAction: r.data.analysis.requested_action ?? s.requestedAction,
      summary: r.data.analysis.summary,
      history: [...s.history, { at, score: assessment.score }],
      agents: applyDeployments(s.agents, plan.deployments, at),
      spotlight: lastActive
        ? { agentId: lastActive.agentId, title: `${AGENT_NAME(lastActive.agentId)} DEPLOYED`, reason: lastActive.reason, key: (s.spotlight?.key ?? 0) + 1 }
        : s.spotlight,
      analysis: { status: 'done', model: r.data.model, latencyMs: r.data.latency_ms },
    }));
    for (const note of plan.notes) log({ type: 'deployment', agent: 'mastermind', title: note });
    for (const d of plan.deployments) log({ type: 'deployment', agent: d.agentId, title: `${AGENT_NAME(d.agentId)} · ${d.status.toUpperCase()}`, detail: d.reason });
    log({ type: 'assessment', agent: 'safecracker', title: `Risk ${assessment.score}% · ${assessment.level.toUpperCase()}`, riskScore: assessment.score, detail: `${assessment.countedSignals} distinct tactic(s), ${ledger.length} piece(s) of evidence` });

    if (assessment.level === 'critical' && ref.current.stage === 'none') {
      const intervention = buildLiveIntervention(ledger, assessment, at);
      update((s) => ({ ...s, intervention, stage: 'open' }));
      log({ type: 'intervention', agent: 'fixer', title: 'Potential heist detected. Safe options offered.', riskScore: assessment.score });
    }
  }, [update, log]);

  const transcribeSegment = useCallback(
    async (segId: string, audio: Blob) => {
      const g = gen.current;
      setMicState('processing');
      update((s) => ({ ...s, segments: s.segments.map((x) => (x.id === segId ? { ...x, status: 'transcribing', error: undefined } : x)) }));
      const r = await transcribeAudio(audio);
      if (g !== gen.current) return;
      if (!r.ok) {
        failedAudio.current.set(segId, audio);
        update((s) => ({ ...s, segments: s.segments.map((x) => (x.id === segId ? { ...x, status: 'stt-failed', error: r.error.message } : x)) }));
        log({ type: 'conversation', agent: 'mastermind', title: 'Transcription failed', detail: r.error.code });
        setMicState('idle');
        return;
      }
      failedAudio.current.delete(segId); // audio no longer needed: drop it
      update((s) => ({
        ...s,
        segments: s.segments.map((x) => (x.id === segId ? { ...x, status: 'transcribed', text: r.data.text, sttModel: r.data.model, sttLatencyMs: r.data.latency_ms } : x)),
      }));
      const n = ref.current.segments.find((x) => x.id === segId)?.n;
      log({ type: 'conversation', title: `Segment ${n} transcribed`, detail: `“${r.data.text}”` });
      await analyzeSession();
      if (g === gen.current) setMicState('idle');
    },
    [update, log, analyzeSession],
  );

  const addSegment = useCallback(
    (audio: Blob, source: Segment['source']) => {
      ensureStarted();
      const seg: Segment = { id: `seg-${++eventId}`, n: ref.current.segments.length + 1, at: now(), source, status: 'transcribing' };
      update((s) => ({ ...s, segments: [...s.segments, seg] }));
      return transcribeSegment(seg.id, audio);
    },
    [ensureStarted, update, transcribeSegment],
  );

  // ─────────── Public controls ───────────

  const startListening = useCallback(async () => {
    setMicError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicState('unsupported');
      setMicError('This browser cannot record audio. Try Chrome, Edge or Safari, or use LOAD DEMO AUDIO.');
      return;
    }
    setMicState('requesting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = (e as Error).name;
      setMicState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
      setMicError(MIC_ERRORS[name] ?? 'The microphone could not be started. Try again, or use LOAD DEMO AUDIO.');
      return;
    }
    ensureStarted();
    const mime = pickMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const m = { stream, recorder, chunks: [] as Blob[], started: Date.now() } as typeof mic.current;
    mic.current = m;
    recorder.ondataavailable = (e) => e.data.size && m.chunks.push(e.data);
    recorder.start(250);

    // Live activity meter (nothing is recorded by this; it only reads the volume).
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      let last = 0;
      const tick = (t: number) => {
        m.raf = requestAnimationFrame(tick);
        if (t - last < 70) return;
        last = t;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        setLevels((l) => [...l.slice(1), rms]);
      };
      m.ctx = ctx;
      m.raf = requestAnimationFrame(tick);
    } catch {
      /* meter is decorative */
    }

    setElapsed(0);
    m.timer = window.setInterval(() => {
      const secs = (Date.now() - (m.started ?? Date.now())) / 1000;
      setElapsed(secs);
      if (secs >= MAX_SEGMENT_SECONDS) stopRef.current();
    }, 200);
    setMicState('listening');
    log({ type: 'operation', agent: 'mastermind', title: 'Microphone listening', detail: `Segment ${ref.current.segments.length + 1}` });
  }, [ensureStarted, log]);

  const stopAndAnalyze = useCallback(() => {
    const m = mic.current;
    if (!m.recorder || m.recorder.state === 'inactive') return;
    const duration = (Date.now() - (m.started ?? Date.now())) / 1000;
    m.recorder.onstop = () => {
      const blob = new Blob(m.chunks, { type: m.recorder?.mimeType || 'audio/webm' });
      releaseMic();
      if (duration < MIN_SEGMENT_SECONDS || blob.size < 1024) {
        setMicState('idle');
        setMicError('That recording was too short. Hold START LISTENING for at least a second of speech.');
        return;
      }
      void addSegment(blob, 'mic');
    };
    setMicState('processing');
    m.recorder.stop();
  }, [releaseMic, addSegment]);
  const stopRef = useRef(stopAndAnalyze);
  stopRef.current = stopAndAnalyze;

  const cancelListening = useCallback(() => {
    const m = mic.current;
    if (m.recorder && m.recorder.state !== 'inactive') {
      m.recorder.onstop = null;
      m.recorder.stop();
    }
    releaseMic();
    setMicState('idle');
  }, [releaseMic]);

  /** Next demo segment: real audio through the same STT + analysis pipeline. */
  const loadDemoAudio = useCallback(async () => {
    const i = ref.current.demoIndex;
    const clip = DEMO_CALL_SEGMENTS[i];
    if (!clip) return;
    setMicError(null);
    setMicState('processing');
    const r = await fetchClip(clip.role, clip.text);
    if (!r.ok) {
      setMicState('idle');
      setMicError('Demo audio is unavailable. Start the backend and run `npm run prewarm:voice`, or use the microphone.');
      return;
    }
    update((s) => ({ ...s, demoIndex: s.demoIndex + 1 }));
    try {
      demoAudio.current?.pause();
      demoAudio.current = new Audio(URL.createObjectURL(r.blob));
      void demoAudio.current.play().catch(() => {});
    } catch {
      /* hearing it is optional; transcription is what matters */
    }
    await addSegment(r.blob, 'demo');
  }, [update, addSegment]);

  const retrySegment = useCallback(
    (segId: string) => {
      const audio = failedAudio.current.get(segId);
      if (audio) void transcribeSegment(segId, audio);
    },
    [transcribeSegment],
  );

  const discardSegment = useCallback(
    (segId: string) => {
      failedAudio.current.delete(segId);
      update((s) => ({ ...s, segments: s.segments.filter((x) => x.id !== segId) }));
    },
    [update],
  );

  const retryAnalysis = useCallback(() => {
    setMicState('processing');
    void analyzeSession().then(() => setMicState('idle'));
  }, [analyzeSession]);

  const chooseAction = useCallback(
    (id: InterventionActionId) => {
      const at = now();
      update((s) => ({
        ...s,
        stage: 'exit',
        chosenAction: id,
        agents: applyDeployments(s.agents, [{ agentId: 'getaway', status: 'active', reason: 'Guiding a safe exit and independent verification.' }], at),
        spotlight: { agentId: 'getaway', title: 'GETAWAY DRIVER DEPLOYED', reason: 'Safe exit plan ready', key: (s.spotlight?.key ?? 0) + 1 },
      }));
      log({ type: 'deployment', agent: 'mastermind', title: 'Deploying GETAWAY DRIVER.' });
      log({ type: 'intervention', agent: 'getaway', title: `Safe option chosen: ${id === 'exit' ? 'end the call' : id === 'verify-claimed-person' ? 'verify independently' : 'call a trusted contact'}` });
    },
    [update, log],
  );

  const closeIntervention = useCallback(() => {
    update((s) => ({ ...s, stage: 'closed' }));
    log({ type: 'outcome', agent: 'getaway', title: 'Safe exit plan delivered' });
  }, [update, log]);

  const reset = useCallback(() => {
    gen.current++;
    cancelListening();
    demoAudio.current?.pause();
    demoAudio.current = null;
    failedAudio.current.clear();
    setMicError(null);
    setElapsed(0);
    ref.current = freshSession();
    setSession(ref.current);
  }, [cancelListening]);

  // Never keep the microphone open after leaving the screen.
  useEffect(
    () => () => {
      gen.current++;
      const m = mic.current;
      if (m.recorder && m.recorder.state !== 'inactive') {
        m.recorder.onstop = null;
        m.recorder.stop();
      }
      m.stream?.getTracks().forEach((t) => t.stop());
      demoAudio.current?.pause();
    },
    [],
  );

  return {
    session,
    micState,
    micError,
    elapsed,
    levels,
    busy: micState === 'processing' || micState === 'requesting' || session.analysis.status === 'analyzing',
    startListening,
    stopAndAnalyze,
    cancelListening,
    loadDemoAudio,
    retrySegment,
    discardSegment,
    retryAnalysis,
    chooseAction,
    closeIntervention,
    reset,
  };
}

export type LiveCallController = ReturnType<typeof useLiveCall>;
