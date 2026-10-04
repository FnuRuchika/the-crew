/** Deterministic Live Call session checks (no network). Run: npm run test:live */
import assert from 'node:assert/strict';
import { scoreLiveSignals } from '../src/engine/liveRiskEngine';
import { applyDeployments, buildAnalysisText, buildLiveIntervention, filterCallerSignals, hasCallerSpeech, initialLiveAgents, mergeSignals, planLiveCrew, triggersAnalysis, MAX_ANALYSIS_CHARS, type Segment, type Speaker } from '../src/live-call/liveSession';
import { DEMO_CALL_SEGMENTS } from '../src/live-call/liveCallScript';
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

// ─────────── Explicit speaker mode (CALLER / USER) ───────────
const turn = (n: number, speaker: Speaker | undefined, text: string): Segment => ({ ...seg(n, text), ...(speaker && { speaker }) });
/** What the hook does with one Gemini reply: filter by speaker, then merge, then score. */
const ingest = (prev: typeof ledger, fresh: LiveSignal[], segments: Segment[], at: number) => mergeSignals(prev, filterCallerSignals(fresh, segments), segments, at);

// A. Mixed speaker formatting
const mixed = [turn(1, 'caller', "Grandma, I've been arrested."), turn(2, 'user', 'Daniel? Are you okay?'), turn(3, 'caller', 'I need $2,500 immediately.')];
assert.equal(buildAnalysisText(mixed), "CALLER: Grandma, I've been arrested.\nUSER: Daniel? Are you okay?\nCALLER: I need $2,500 immediately.");
console.log('✓ A. Analysis text labels each line CALLER / USER');

// B. Backward compatibility: no speaker ⇒ CALLER
assert.equal(buildAnalysisText([turn(1, undefined, 'Hello there.')]), 'CALLER: Hello there.');
assert.ok(triggersAnalysis(turn(1, undefined, 'x')) && hasCallerSpeech([turn(1, undefined, 'x')]));
console.log('✓ B. A segment with no speaker is treated as CALLER');

// C. Evidence only in USER lines is rejected
const askWhy = [turn(1, 'caller', "Grandma, it's Daniel."), turn(2, 'user', 'Why do you need $2,500?')];
const userMoney = sig('unusual_payment_request', 'need $2,500');
assert.deepEqual(filterCallerSignals([userMoney], askWhy), []);
assert.equal(ingest([], [userMoney], askWhy, 2).length, 0, 'no money request attributed to the user');
console.log('✓ C. A USER question ("Why do you need $2,500?") never becomes scam evidence');

// D. Caller evidence survives (and is attributed to the caller segment)
const send = [turn(1, 'caller', 'Send me $2,500 immediately.'), turn(2, 'user', 'Okay, hold on.')];
const callerMoney = [sig('unusual_payment_request', 'Send me $2,500'), sig('artificial_urgency', 'immediately')];
assert.equal(filterCallerSignals(callerMoney, send).length, 2);
assert.deepEqual(ingest([], callerMoney, send, 1).map((s) => s.segmentId), ['s1', 's1']);
console.log('✓ D. Evidence the CALLER said is kept and attributed to the caller segment');

// E. Caller said it, user repeated it ⇒ still caller evidence, attributed to the caller (not the later user turn)
const echo = [turn(1, 'caller', "Don't tell your mother."), turn(2, 'user', "Don't tell your mother? Why not?")];
const secrecy = ingest([], [sig('isolation_secrecy', "Don't tell your mother")], echo, 2);
assert.equal(secrecy.length, 1);
assert.equal(secrecy[0].segmentId, 's1', 'never attributed to the USER segment even though it is the most recent match');
console.log('✓ E. A phrase the user repeats stays caller evidence, attributed to the caller');

// F. USER-only conversation ⇒ no risk, no deployments
const onlyUser = [turn(1, 'user', 'Hello? Who is this? Why do you need money right now?')];
assert.equal(hasCallerSpeech(onlyUser), false, 'nothing to analyse yet');
const uLedger = ingest([], [sig('unusual_payment_request', 'need money'), sig('artificial_urgency', 'right now')], onlyUser, 1);
const uAssess = scoreLiveSignals(uLedger);
assert.equal(uAssess.score, 0);
assert.deepEqual(planLiveCrew({ agents: initialLiveAgents(), ledger: uLedger, assessment: uAssess, claimedIdentity: null }).deployments, []);
console.log('✓ F. A USER-only conversation produces no risk and deploys nobody');

// G. A USER segment never triggers a Gemini analysis
assert.equal(triggersAnalysis(turn(2, 'user', 'Should I call your mother?')), false);
assert.equal(triggersAnalysis(turn(3, 'caller', 'No.')), true);
console.log('✓ G. USER segments are context only: no Gemini request is triggered');

// H. Full two-person role-play: risk comes only from CALLER statements
const play = [
  turn(1, 'caller', "Grandma, I've been arrested."),
  turn(2, 'user', 'Daniel? Are you okay?'),
  turn(3, 'caller', 'I need $2,500 for bail immediately.'),
  turn(4, 'user', 'Should I call your mother?'),
  turn(5, 'caller', "No. Please don't tell my parents."),
];
assert.equal(buildAnalysisText(play).split('\n').map((l) => l.split(':')[0]).join(','), 'CALLER,USER,CALLER,USER,CALLER');
// Plausible Gemini output, including two mistakes that quote the USER.
const gemini = [
  sig('family_emergency', "I've been arrested"),
  sig('unusual_payment_request', 'I need $2,500 for bail'),
  sig('artificial_urgency', 'immediately'),
  sig('isolation_secrecy', "don't tell my parents"),
  sig('emotional_leverage', 'Are you okay?', 0.6),
  sig('isolation_secrecy', 'Should I call your mother?', 0.5),
];
const pLedger = ingest([], gemini, play, 5);
const pAssess = scoreLiveSignals(pLedger);
assert.deepEqual(pLedger.map((s) => s.type), ['family_emergency', 'unusual_payment_request', 'artificial_urgency', 'isolation_secrecy']);
assert.ok(pLedger.every((s) => ['s1', 's3', 's5'].includes(s.segmentId!)), 'all evidence from CALLER segments');
const callerOnly = scoreLiveSignals(mergeSignals([], gemini.slice(0, 4), play, 5));
assert.equal(pAssess.score, callerOnly.score, 'USER lines add exactly nothing to the score');
assert.ok(pAssess.level === 'critical' || pAssess.level === 'high', `role-play reaches high/critical (got ${pAssess.score}%)`);
console.log(`✓ H. Grandparent role-play: ${pAssess.score}% ${pAssess.level.toUpperCase()} from CALLER lines only; USER lines ignored`);

// I. LOAD DEMO AUDIO (3 caller clips, no speaker set) behaves exactly as before
const demo = DEMO_CALL_SEGMENTS.map((c, i): Segment => ({ id: `d${i + 1}`, n: i + 1, at: i + 1, source: 'demo', status: 'transcribed', text: c.text }));
assert.equal(DEMO_CALL_SEGMENTS.length, 3);
assert.ok(demo.every((d) => d.speaker === undefined && triggersAnalysis(d)), 'every demo clip triggers analysis, as before');
assert.equal(buildAnalysisText(demo), demo.map((d) => `CALLER: ${d.text}`).join('\n'), 'same text Gemini received before');
const demoSigs = [sig('authority_impersonation', 'fraud department at your bank'), sig('isolation_secrecy', "don't hang up"), sig('unusual_payment_request', 'transfer nine hundred dollars'), sig('artificial_urgency', 'immediately')];
assert.deepEqual(filterCallerSignals(demoSigs, demo), demoSigs, 'filter is a no-op for the demo');
assert.deepEqual(ingest([], demoSigs, demo, 3), mergeSignals([], demoSigs, demo, 3), 'ledger identical to the pre-speaker pipeline');
console.log('✓ I. 3-clip demo audio: unchanged analysis text, signals, attribution and score');
console.log('\nAll live-session checks passed.');
