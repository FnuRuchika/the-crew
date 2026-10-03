/** Deterministic Live Call session checks (no network). Run: npm run test:live */
import assert from 'node:assert/strict';
import { scoreLiveSignals } from '../src/engine/liveRiskEngine';
import { applyDeployments, buildAnalysisText, buildLiveIntervention, initialLiveAgents, mergeSignals, planLiveCrew, MAX_ANALYSIS_CHARS, type Segment } from '../src/live-call/liveSession';
import type { LiveSignal, LiveSignalType } from '../src/live-analysis/types';

const sig = (type: LiveSignalType, evidence: string, confidence = 0.9): LiveSignal => ({
  type, label: type, confidence, evidence, explanation: '', evidence_verbatim: true, evidence_start: 0, evidence_end: 1,
});
const seg = (n: number, text: string): Segment => ({ id: `s${n}`, n, at: n, source: 'mic', status: 'transcribed', text });

// Analysis window
const segs = [seg(1, "I'm calling from your bank."), seg(2, 'Someone compromised your account.'), seg(3, "Don't hang up. Transfer $900 immediately.")];
assert.equal(buildAnalysisText(segs), "CALLER: I'm calling from your bank.\nCALLER: Someone compromised your account.\nCALLER: Don't hang up. Transfer $900 immediately.");
const long = Array.from({ length: 40 }, (_, i) => seg(i + 1, `Segment number ${i + 1} with some filler words to take up space.`));
const windowed = buildAnalysisText(long);
assert.ok(windowed.length <= MAX_ANALYSIS_CHARS && windowed.endsWith('take up space.') && windowed.includes('Segment number 40'));
assert.ok(!windowed.includes('Segment number 1 '));
console.log(`✓ Analysis text keeps the most recent conversation within ${MAX_ANALYSIS_CHARS} chars`);

// Accumulation across segments + per-segment attribution
let ledger = mergeSignals([], [sig('authority_impersonation', "calling from your bank", 0.9)], segs.slice(0, 1), 1);
const r1 = scoreLiveSignals(ledger).score;
ledger = mergeSignals(ledger, [sig('authority_impersonation', 'calling from your bank', 0.85), sig('emotional_leverage', 'compromised your account', 0.8)], segs.slice(0, 2), 2);
const r2 = scoreLiveSignals(ledger).score;
ledger = mergeSignals(ledger, [sig('authority_impersonation', 'calling from your bank', 0.9), sig('emotional_leverage', 'compromised your account', 0.8), sig('isolation_secrecy', "Don't hang up", 0.95), sig('unusual_payment_request', 'Transfer $900', 0.95), sig('artificial_urgency', 'immediately', 0.9)], segs, 3);
const a3 = scoreLiveSignals(ledger);
assert.ok(r1 < r2 && r2 < a3.score, 'risk evolves as the conversation grows');
assert.equal(ledger.length, 5, 'repeated evidence merged');
assert.deepEqual(ledger.map((s) => s.segmentId), ['s1', 's2', 's3', 's3', 's3']);
console.log(`✓ Risk evolves across segments: ${r1}% → ${r2}% → ${a3.score}% ${a3.level.toUpperCase()}; evidence attributed to the right segment`);

// Duplicates never inflate
const again = mergeSignals(ledger, [sig('isolation_secrecy', "don't  hang up!", 0.95), sig('isolation_secrecy', "Don't tell anyone", 0.6)], segs, 4);
const a4 = scoreLiveSignals(again);
assert.equal(again.length, 6, 'same evidence (case/punctuation) merged; new phrase kept');
assert.equal(a4.score, a3.score, 'a weaker repeat of a tactic adds nothing');
assert.ok(a4.contributions.some((c) => c.status === 'duplicate'));
console.log('✓ Repeated / re-reported evidence does not inflate risk');

// Selective crew deployment
let agents = applyDeployments(initialLiveAgents(), [{ agentId: 'mastermind', status: 'active', reason: '' }], 0);
const p1 = planLiveCrew({ agents, ledger: mergeSignals([], [sig('artificial_urgency', 'right now')], segs, 1), assessment: scoreLiveSignals(mergeSignals([], [sig('artificial_urgency', 'right now')], segs, 1)), claimedIdentity: null });
assert.deepEqual(p1.deployments.map((d) => d.agentId), ['grifter']);
assert.deepEqual(p1.notes, ['Manipulation language detected.', 'Deploying GRIFTER.']);
agents = applyDeployments(agents, p1.deployments, 1);
const p3 = planLiveCrew({ agents, ledger, assessment: a3, claimedIdentity: 'bank representative' });
assert.deepEqual(p3.deployments.map((d) => d.agentId).sort(), ['fixer', 'grifter', 'insideMan', 'lookout', 'safecracker']);
assert.ok(p3.notes.includes('Payment request identified.') && p3.notes.includes('Evidence corroborated.') && !p3.notes.includes('Deploying GRIFTER.'));
assert.ok(!p3.deployments.some((d) => d.agentId === 'getaway'), 'getaway only after the person chooses a safe option');
const benign = planLiveCrew({ agents: initialLiveAgents(), ledger: [], assessment: scoreLiveSignals([]), claimedIdentity: 'Mom' });
assert.deepEqual(benign.deployments, [], 'no evidence ⇒ nobody deployed');
console.log('✓ Mastermind deploys only the agents the evidence calls for');

// Intervention content
const iv = buildLiveIntervention(ledger, a3, 10);
assert.equal(iv.actions[0].id, 'exit');
assert.deepEqual(iv.actions.map((a) => a.label), ['End the call', 'Verify independently', 'Call a trusted contact']);
assert.equal(iv.reasons.length, a3.countedSignals);
assert.ok(!/scammer/i.test(JSON.stringify(iv)), 'never asserts the caller is a scammer');
console.log('✓ Live intervention: strongest evidence per tactic, safe actions, cautious wording');
console.log('\nAll live-session checks passed.');
