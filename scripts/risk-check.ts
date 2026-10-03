/**
 * Deterministic risk-engine checks (no network). Run: npm run test:risk
 */
import assert from 'node:assert/strict';
import { createRuleBasedRiskEngine } from '../src/engine/riskEngine';
import { scoreLiveSignals } from '../src/engine/liveRiskEngine';
import type { LiveSignal, LiveSignalType } from '../src/live-analysis/types';
import type { RiskSignal, SignalCategory } from '../src/types';

// 1. Case File 001 progression must be unchanged by the refactor.
const engine = createRuleBasedRiskEngine();
const order: SignalCategory[] = ['emergency-claim', 'emotional-leverage', 'urgency', 'isolation', 'new-recipient', 'unusual-amount', 'identity-mismatch'];
const progression: number[] = [];
const sigs: RiskSignal[] = [];
for (const category of order) {
  sigs.push({ id: category, category, label: '', detail: '', detectedBy: 'grifter', detectedAt: 0, severity: 'high' });
  progression.push(engine.assess(sigs).score);
}
assert.deepEqual(progression, [14, 39, 58, 76, 82, 87, 94]);
console.log('✓ Case File 001 progression unchanged:', progression.join(' → '));

// 2. Live engine.
const s = (type: LiveSignalType, confidence: number, verbatim = true): LiveSignal => ({
  type, label: type, confidence, evidence: 'x', explanation: '', evidence_verbatim: verbatim, evidence_start: verbatim ? 0 : null, evidence_end: verbatim ? 1 : null,
});

assert.equal(scoreLiveSignals([]).score, 0);
assert.equal(scoreLiveSignals([]).level, 'low');
console.log('✓ No signals → 0% LOW');

const bank = [s('authority_impersonation', 0.95), s('isolation_secrecy', 0.9), s('artificial_urgency', 0.95), s('unusual_payment_request', 0.85)];
const a1 = scoreLiveSignals(bank);
const a2 = scoreLiveSignals([...bank].reverse());
assert.equal(a1.score, a2.score, 'order must not change the score');
assert.equal(JSON.stringify(scoreLiveSignals(bank)), JSON.stringify(a1), 'identical input → identical output');
console.log(`✓ Deterministic & order-independent: bank example → ${a1.score}% ${a1.level.toUpperCase()}`);

const many = Array.from({ length: 12 }, (_, i) => s((['credential_request', 'remote_access_request', 'unusual_payment_request', 'isolation_secrecy'] as const)[i % 4], 1));
const capped = scoreLiveSignals(many);
assert.ok(capped.score <= 100);
assert.equal(capped.countedSignals, 4, 'one per type');
assert.equal(capped.contributions.filter((c) => c.status === 'duplicate').length, 8);
console.log(`✓ Never exceeds 100, duplicates not double-counted: ${capped.score}%`);

const low = scoreLiveSignals([s('artificial_urgency', 0.2)]);
assert.equal(low.score, 0);
assert.equal(low.contributions[0].status, 'low-confidence');
console.log('✓ Low-confidence (<0.35) signals ignored');

const grounded = scoreLiveSignals([s('isolation_secrecy', 0.9, true)]).score;
const ungrounded = scoreLiveSignals([s('isolation_secrecy', 0.9, false)]).score;
assert.ok(ungrounded < grounded);
console.log(`✓ Ungrounded evidence weighted down: ${grounded}% → ${ungrounded}%`);

const sumDeltas = a1.contributions.reduce((t, c) => t + c.delta, 0);
assert.equal(sumDeltas, a1.score, 'deltas must add up to the score');
console.log('✓ Per-signal deltas sum to the score');
console.log('\nAll risk-engine checks passed.');
