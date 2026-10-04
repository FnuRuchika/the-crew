import { useEffect, useRef, useState } from 'react';
import { levelForScore } from '../engine/riskEngine';
import { formatMoney } from '../lib/format';
import type { AgentId, OperationState, RiskSignal } from '../types';
import { LedgerRecorder } from './LedgerRecorder';

const SOURCE: Record<string, 'scripted_rules' | 'payment_rules' | 'identity_rules'> = {
  grifter: 'scripted_rules',
  lookout: 'payment_rules',
  insideMan: 'identity_rules',
};

/**
 * Records Case File 001 into the Evidence Ledger by *observing* operation state.
 * The scripted story, timings and risk progression are untouched.
 */
export function useCaseFileLedger(state: OperationState): LedgerRecorder | null {
  const [recorder, setRecorder] = useState<LedgerRecorder | null>(null);
  const rec = useRef<LedgerRecorder | null>(null);
  const seen = useRef({ signals: 0, risk: 0, agents: {} as Record<string, string>, payment: '', intervention: false, action: '', verified: false, stopped: false });

  useEffect(() => {
    const s = seen.current;

    // Reset / replay: close an unfinished operation as abandoned, start fresh next time.
    if (state.phase === 'briefing') {
      if (rec.current && !rec.current.getSnapshot().completed) void rec.current.complete({ final_status: 'abandoned', peak_risk: Math.max(0, ...state.riskHistory.map((p) => p.score)) });
      if (rec.current) {
        rec.current = null;
        setRecorder(null);
      }
      seen.current = { signals: 0, risk: 0, agents: {}, payment: '', intervention: false, action: '', verified: false, stopped: false };
      return;
    }

    if (!rec.current) {
      rec.current = new LedgerRecorder('case_file', `case-file-${state.mission.caseNumber}`);
      setRecorder(rec.current);
    }
    const r = rec.current;

    for (const sig of state.signals.slice(s.signals) as RiskSignal[]) {
      r.signal({ kind: 'signal', signal_type: sig.category, label: sig.label, severity: sig.severity, evidence: sig.evidence, explanation: sig.detail, detected_by: sig.detectedBy, source: SOURCE[sig.detectedBy] ?? 'scripted_rules' });
    }
    s.signals = state.signals.length;
    for (const p of state.riskHistory.slice(Math.max(1, s.risk))) r.risk(p.score, levelForScore(p.score));
    s.risk = state.riskHistory.length;
    for (const a of Object.keys(state.agents) as AgentId[]) {
      const st = state.agents[a].status;
      if (st !== 'standby' && s.agents[a] !== st) r.agent(a, st, state.agents[a].note);
      s.agents[a] = st;
    }

    const pay = state.payment;
    if (pay && pay.status === 'submitted' && s.payment !== 'submitted') {
      r.milestone('payment_initiated', `Payment initiated: ${formatMoney(pay.amount)}`, `To ${pay.recipient.name} · ${pay.method}`);
    }
    if (pay) s.payment = pay.status;

    const iv = state.intervention;
    if (iv && !s.intervention) {
      s.intervention = true;
      r.intervention(iv.riskScore, iv.reasons.map((x) => x.label));
    }
    if (iv?.chosenAction && s.action !== iv.chosenAction) {
      s.action = iv.chosenAction;
      const label = iv.actions.find((a) => a.id === iv.chosenAction)?.label ?? iv.chosenAction;
      r.action(iv.chosenAction, `${state.mission.target.name.split(' ')[0]} chose: ${label}`);
    }
    if (state.verification?.stage === 'confirmed' && !s.verified) {
      s.verified = true;
      r.milestone('verification', `Trusted verification: ${state.verification.contact.name} (${state.verification.contact.relationship.toLowerCase()})`, state.verification.finding, 'insideMan');
    }
    if (pay?.status === 'stopped' && !s.stopped) {
      s.stopped = true;
      r.outcome(`Payment stopped: ${formatMoney(pay.amount)} protected`, 'fixer');
    }
    if (state.phase === 'protected') {
      void r.complete({
        final_status: 'protected',
        peak_risk: Math.max(0, ...state.riskHistory.map((p) => p.score)),
        amount_protected: pay?.status === 'stopped' ? pay.amount.toFixed(2) : undefined,
        threat_type: state.mission.threat?.type,
        outcome: pay?.status === 'stopped' ? `Payment prevented · ${formatMoney(pay.amount)} protected` : 'Operation complete',
      });
    }
  }, [state]);

  return recorder;
}
