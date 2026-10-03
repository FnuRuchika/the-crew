import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisContext } from '../agents/contracts';
import { evaluateIntervention } from '../engine/interventionPolicy';
import { formatMoney } from '../lib/format';
import {
  createInitialState,
  withAgentNote,
  withClock,
  withDeployments,
  withLog,
  withMessage,
  withSignals,
} from '../operation/missionState';
import { services } from '../services';
import type { InterventionActionId, OperationPhase, OperationState, RiskSignal, Scenario } from '../types';

const CANCELLED = Symbol('cancelled');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Auto-play pacing (ms) per phase: generous where judges need time to read. */
const AUTO_DELAY: Partial<Record<OperationPhase, number>> = {
  briefing: 700,
  live: 2600,
  payment: 2400,
  intervention: 5500,
  verifying: 2600,
  cooldown: 4000,
  exit: 4200,
};

export interface OperationController {
  state: OperationState;
  busy: boolean;
  canAdvance: boolean;
  nextLabel: string;
  autoPlay: boolean;
  setAutoPlay: (on: boolean) => void;
  next: () => void;
  submitPayment: () => void;
  chooseAction: (id: InterventionActionId) => void;
  stopPaymentAndExit: () => void;
  completeOperation: () => void;
  injectPressure: () => void;
  reset: () => void;
}

export interface OperationOptions {
  /** Pause auto-play while something (e.g. a voice line) is still playing. */
  holdAutoPlay?: boolean;
}

export function useOperation(scenario: Scenario, options: OperationOptions = {}): OperationController {
  const { holdAutoPlay = false } = options;
  const { crew, events, voice } = services;
  const [state, setState] = useState(() => createInitialState(scenario));
  const ref = useRef(state);
  const gen = useRef(0);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);

  const update = useCallback((fn: (s: OperationState) => OperationState) => {
    ref.current = fn(ref.current);
    setState(ref.current);
  }, []);

  const ctx = (): AnalysisContext => ({
    clock: ref.current.clock,
    target: scenario.target,
    alreadyDetected: new Set(ref.current.signals.map((s) => s.category)),
  });

  const claimedPersonId = () => ref.current.messages.find((m) => m.claimsIdentityOf)?.claimsIdentityOf;

  /** Run an async sequence; cancelled cleanly by reset(). */
  const run = useCallback(async (task: (wait: (ms: number) => Promise<void>) => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const g = gen.current;
    const wait = async (ms: number) => {
      await sleep(ms);
      if (g !== gen.current) throw CANCELLED;
    };
    try {
      await task(wait);
    } catch (e) {
      if (e !== CANCELLED) console.error(e);
    } finally {
      if (g === gen.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, []);

  const addSignals = async (signals: RiskSignal[]) => {
    if (!signals.length) return;
    const assessment = await crew.safecracker.assess([...ref.current.signals, ...signals]);
    update((s) => withSignals(s, signals, assessment));
  };

  // ───────────── Story steps ─────────────

  const playNextBeat = (wait: (ms: number) => Promise<void>) => async () => {
    const s0 = ref.current;
    if (s0.phase === 'briefing') {
      update((s) =>
        withLog({ ...s, phase: 'live', mission: { ...s.mission, status: 'active' } }, {
          type: 'operation',
          agent: 'mastermind',
          title: `Case file ${scenario.caseNumber} opened`,
          detail: `Protecting ${scenario.target.name}`,
        }),
      );
      update((s) => withDeployments(s, [{ agentId: 'mastermind', status: 'active', reason: 'Operation opened. Listening to the call.' }]));
    }

    const beat = scenario.beats[ref.current.beatIndex];
    if (!beat) return;
    update((s) => ({ ...s, beatIndex: s.beatIndex + 1 }));

    for (let i = 0; i < beat.messages.length; i++) {
      const msg = beat.messages[i];
      if (i > 0) await wait(msg.speaker === 'system' ? 700 : 1000);
      update((s) => withMessage(s, msg));
      if (msg.speaker !== 'caller') continue;

      await wait(650);
      const signals = await crew.grifter.analyze([msg], ctx());
      await addSignals(signals);
      const deployments = await crew.mastermind.plan('conversation', ref.current, signals);
      update((s) => withDeployments(s, deployments));
    }

    if (beat.opensPayment) {
      await wait(1000);
      update((s) =>
        withLog(
          { ...s, phase: 'payment', payment: { ...scenario.payment, status: 'draft' } },
          { type: 'payment', title: 'Banking app opened', detail: `${scenario.target.name.split(' ')[0]} starts a transfer` },
        ),
      );
    }
  };

  const analyzePayment = (wait: (ms: number) => Promise<void>) => async () => {
    const payment = ref.current.payment;
    if (!payment) return;
    update((s) =>
      withLog(
        withClock({ ...s, phase: 'analyzing', payment: { ...payment, status: 'submitted' } }, scenario.paymentAt),
        {
          type: 'payment',
          title: `Payment initiated: ${formatMoney(payment.amount)}`,
          detail: `To ${payment.recipient.name} · ${payment.method}`,
        },
      ),
    );
    const d1 = await crew.mastermind.plan('payment-submitted', ref.current);
    update((s) => withDeployments(s, d1));

    // THE LOOKOUT
    await wait(1200);
    const lookoutSignals = await crew.lookout.analyze(ref.current.payment!, ctx());
    for (const sig of lookoutSignals) {
      await addSignals([sig]);
      update((s) => withAgentNote(s, 'lookout', sig.label));
      await wait(900);
    }
    update((s) => withAgentNote(s, 'lookout', lookoutSignals.map((x) => x.label).join(' · ') || 'No anomalies'));

    // THE INSIDE MAN
    await wait(500);
    update((s) => withClock(s, s.clock + 2));
    const idSignals = await crew.insideMan.check({
      claimedPersonId: claimedPersonId(),
      callerNumber: scenario.callerNumber,
      payment: ref.current.payment,
      ctx: ctx(),
    });
    await addSignals(idSignals);
    update((s) => withAgentNote(s, 'insideMan', idSignals.length ? 'Caller number does not match trusted record' : 'Identity consistent'));
    await wait(1000);

    // THE SAFECRACKER
    update((s) => withClock(s, s.clock + 1));
    const d2 = await crew.mastermind.plan('evidence-gathered', ref.current);
    update((s) => withDeployments(s, d2));
    await wait(1800);
    const assessment = await crew.safecracker.assess(ref.current.signals);
    const threat = await crew.mastermind.classifyThreat(ref.current.signals);
    update((s) =>
      withLog(
        withAgentNote({ ...withClock(s, s.clock + 2), assessment, mission: { ...s.mission, threat } }, 'safecracker', `Verdict: ${assessment.score}% · ${assessment.level.toUpperCase()}`),
        {
          type: 'assessment',
          agent: 'safecracker',
          title: `Risk verdict: ${assessment.score}% ${assessment.level.toUpperCase()}`,
          detail: `Likely ${threat.type.toLowerCase()}`,
          riskScore: assessment.score,
        },
      ),
    );

    // Intervention policy → THE FIXER
    const decision = evaluateIntervention(assessment, ref.current.payment, ref.current.signals);
    await wait(800);
    if (!decision.intervene) {
      update((s) => withLog({ ...s, phase: 'payment', payment: s.payment && { ...s.payment, status: 'draft' } }, {
        type: 'assessment', agent: 'mastermind', title: 'No intervention', detail: decision.reason,
      }));
      return;
    }
    const intervention = await crew.fixer.plan({
      clock: ref.current.clock,
      assessment,
      signals: ref.current.signals,
      target: scenario.target,
      claimedPersonId: claimedPersonId(),
    });
    update((s) =>
      withLog(
        {
          ...s,
          phase: 'intervention',
          intervention,
          payment: s.payment && { ...s.payment, status: 'held' },
          mission: { ...s.mission, status: 'intervening' },
        },
        { type: 'intervention', agent: 'fixer', title: 'Payment held. Intervention started.', detail: decision.reason, riskScore: assessment.score },
      ),
    );
    const d3 = await crew.mastermind.plan('intervention', ref.current);
    update((s) => withDeployments(s, d3));
  };

  const verify = (wait: (ms: number) => Promise<void>, contactId: string) => async () => {
    const contact = crew.insideMan.resolveTrustedChannel(contactId, scenario.target);
    const script = scenario.verifications.find((v) => v.contactId === contactId);
    if (!contact || !script) return;
    update((s) =>
      withLog(
        withAgentNote(
          { ...withClock(s, s.clock + 4), phase: 'verifying', verification: { contact, stage: 'dialing', transcript: [] } },
          'insideMan',
          'Establishing trusted verification…',
        ),
        { type: 'verification', agent: 'insideMan', title: `Calling ${contact.name} on trusted number`, detail: `${contact.phone} (saved contact, not caller-provided)` },
      ),
    );
    update((s) => withDeployments(s, [{ agentId: 'insideMan', status: 'active', reason: 'Establishing trusted verification' }]));
    await wait(2200);
    update((s) =>
      withLog(
        { ...withClock(s, s.clock + 9), verification: s.verification && { ...s.verification, stage: 'connected' } },
        { type: 'verification', agent: 'insideMan', title: `Connected to ${contact.name}` },
      ),
    );
    for (const line of script.lines) {
      await wait(1500);
      update((s) => ({
        ...withClock(s, s.clock + 5),
        verification: s.verification && { ...s.verification, transcript: [...s.verification.transcript, line] },
      }));
    }
    await wait(700);
    update((s) =>
      withLog(
        withAgentNote(
          { ...s, verification: s.verification && { ...s.verification, stage: 'confirmed', finding: script.finding } },
          'insideMan',
          'Claim disproven by trusted contact',
        ),
        { type: 'verification', agent: 'insideMan', title: 'Trusted verification: claim is FALSE', detail: script.finding },
      ),
    );
  };

  const toGetaway = async (verified: boolean) => {
    update((s) =>
      withLog(
        { ...withClock(s, s.clock + 3), payment: s.payment && { ...s.payment, status: 'stopped' } },
        { type: 'outcome', agent: 'fixer', title: 'PAYMENT STOPPED', detail: `${formatMoney(scenario.payment.amount)} stays in ${scenario.target.account.label}` },
      ),
    );
    const plan = await crew.getaway.plan({ callerNumber: scenario.callerNumber, target: scenario.target, verified });
    update((s) => ({ ...s, phase: 'exit', exitPlan: plan }));
    const d = await crew.mastermind.plan('threat-confirmed', ref.current);
    update((s) => withDeployments(s, d));
  };

  // ───────────── Public actions ─────────────

  const submitPayment = useCallback(() => {
    if (ref.current.phase !== 'payment') return;
    void run((wait) => analyzePayment(wait)());
  }, [run]);

  const chooseAction = useCallback(
    (id: InterventionActionId) => {
      const s = ref.current;
      if (!s.intervention || !['intervention', 'cooldown'].includes(s.phase)) return;
      const action = s.intervention.actions.find((a) => a.id === id);
      update((st) =>
        withLog(
          { ...st, intervention: st.intervention && { ...st.intervention, chosenAction: id } },
          { type: 'intervention', agent: 'fixer', title: `${st.mission.target.name.split(' ')[0]} chose: ${action?.label ?? id}` },
        ),
      );
      voice.stop();
      if ((id === 'call-trusted-contact' || id === 'verify-claimed-person') && action?.contactId) {
        void run((wait) => verify(wait, action.contactId!)());
      } else if (id === 'wait') {
        update((st) =>
          withLog({ ...st, phase: 'cooldown' }, { type: 'intervention', agent: 'fixer', title: 'Cool-down started', detail: 'Payment remains on hold for 10 minutes' }),
        );
      } else if (id === 'exit') {
        void run(async () => toGetaway(false));
      }
    },
    [run, update],
  );

  const stopPaymentAndExit = useCallback(() => {
    if (ref.current.phase !== 'verifying' || ref.current.verification?.stage !== 'confirmed') return;
    void run(async () => toGetaway(true));
  }, [run]);

  const completeOperation = useCallback(() => {
    if (ref.current.phase !== 'exit') return;
    void run(async () => {
      update((s) =>
        withLog(
          { ...withClock(s, s.clock + 6), phase: 'protected', mission: { ...s.mission, status: 'complete' } },
          { type: 'outcome', agent: 'mastermind', title: `${formatMoney(scenario.payment.amount)} PROTECTED`, detail: 'Operation complete' },
        ),
      );
      const d = await crew.mastermind.plan('mission-complete', ref.current);
      update((s) => withDeployments(s, d));
      update((s) => ({ ...s, spotlight: null }));
    });
    setAutoPlay(false);
  }, [run, update]);

  const injectPressure = useCallback(() => {
    if (ref.current.phase !== 'cooldown') return;
    void run(async () => {
      const msg = { ...scenario.pressureMessage, at: ref.current.clock + 40 };
      update((s) => withMessage(s, msg));
      const signals = await crew.grifter.analyze([msg], ctx());
      await addSignals(signals);
      if (signals.length) {
        update((s) => withDeployments(s, [{ agentId: 'grifter', status: 'active', reason: 'Pressure escalation detected' }]));
      }
    });
  }, [run, update]);

  const { phase } = state;
  const verificationConfirmed = state.verification?.stage === 'confirmed';
  const canAdvance =
    !busy &&
    (phase === 'briefing' ||
      (phase === 'live' && state.beatIndex < scenario.beats.length) ||
      phase === 'payment' ||
      phase === 'intervention' ||
      phase === 'cooldown' ||
      (phase === 'verifying' && verificationConfirmed) ||
      phase === 'exit');

  const nextLabel =
    phase === 'briefing' ? 'Start call'
    : phase === 'live' ? 'Next event'
    : phase === 'payment' ? 'Submit payment'
    : phase === 'analyzing' ? 'Crew analyzing…'
    : phase === 'intervention' || phase === 'cooldown' ? `Call ${scenario.target.trustedContacts[0]?.name.split(' ')[0] ?? 'contact'}`
    : phase === 'verifying' ? (verificationConfirmed ? 'Stop payment' : 'Verifying…')
    : phase === 'exit' ? 'Complete operation'
    : 'Operation complete';

  const next = useCallback(() => {
    const s = ref.current;
    switch (s.phase) {
      case 'briefing':
      case 'live':
        void run((wait) => playNextBeat(wait)());
        break;
      case 'payment':
        submitPayment();
        break;
      case 'intervention':
      case 'cooldown': {
        const rec = s.intervention?.actions.find((a) => a.recommended);
        if (rec) chooseAction(rec.id);
        break;
      }
      case 'verifying':
        stopPaymentAndExit();
        break;
      case 'exit':
        completeOperation();
        break;
    }
  }, [run, submitPayment, chooseAction, stopPaymentAndExit, completeOperation]);

  const reset = useCallback(() => {
    gen.current += 1;
    busyRef.current = false;
    setBusy(false);
    setAutoPlay(false);
    voice.stop();
    void events.clear(ref.current.mission.id);
    ref.current = createInitialState(scenario);
    setState(ref.current);
  }, [scenario, events, voice]);

  // Auto-play: advance whenever possible, with phase-appropriate pauses.
  useEffect(() => {
    if (!autoPlay || !canAdvance || holdAutoPlay) return;
    const delay = AUTO_DELAY[phase];
    if (delay === undefined) return;
    const t = setTimeout(next, delay);
    return () => clearTimeout(t);
  }, [autoPlay, canAdvance, phase, next, holdAutoPlay]);

  // Mirror the mission log into the event store (Tiger Data later).
  const persisted = useRef(0);
  useEffect(() => {
    if (state.log.length < persisted.current) persisted.current = 0;
    for (const ev of state.log.slice(persisted.current)) void events.append(state.mission.id, ev);
    persisted.current = state.log.length;
  }, [state.log, state.mission.id, events]);

  // Cancel any running sequence on unmount.
  useEffect(() => () => void (gen.current += 1), []);

  return {
    state,
    busy,
    canAdvance,
    nextLabel,
    autoPlay,
    setAutoPlay,
    next,
    submitPayment,
    chooseAction,
    stopPaymentAndExit,
    completeOperation,
    injectPressure,
    reset,
  };
}
