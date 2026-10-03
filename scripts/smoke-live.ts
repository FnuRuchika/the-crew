/**
 * Live smoke test against a running backend (needs GEMINI_API_KEY in backend/.env).
 *   Terminal 1: cd backend && .venv/bin/uvicorn main:app --port 8000
 *   Terminal 2: npm run smoke:live
 */
import { scoreLiveSignals } from '../src/engine/liveRiskEngine';
import type { AnalyzeResponse } from '../src/live-analysis/types';

const API = process.env.CREW_API ?? 'http://127.0.0.1:8000';
const CASES = [
  { name: '1 · Bank impersonation', expect: 'urgency + authority + isolation/payment', text: "I'm calling from your bank. Don't hang up. Someone compromised your account. Transfer $900 immediately." },
  { name: '2 · Ordinary message', expect: 'low risk, no meaningful signals', text: 'Hi Mom, dinner is at 7 tonight. Can you bring dessert?' },
  { name: '3 · Grandparent gift cards', expect: 'high/critical: family emergency + isolation + payment', text: "Your grandson has been arrested. Don't tell his parents. Buy $2,000 in gift cards and read me the numbers." },
];

const health = await fetch(`${API}/api/health`).then((r) => r.json()).catch(() => null);
if (!health) {
  console.error(`Backend not reachable at ${API}. Start it first.`);
  process.exit(1);
}
console.log(`Backend ok · model ${health.model} · gemini_configured=${health.gemini_configured}\n`);

for (const c of CASES) {
  const res = await fetch(`${API}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: c.text }) });
  const body = await res.json();
  console.log(`━━ ${c.name}  (expected: ${c.expect})`);
  if (!res.ok) {
    console.log(`  ERROR ${res.status}: ${body.error?.code}: ${body.error?.message}\n`);
    continue;
  }
  const data = body as AnalyzeResponse;
  const a = scoreLiveSignals(data.analysis.signals);
  console.log(`  RISK ${a.score}% ${a.level.toUpperCase()}  ·  ${data.latency_ms} ms`);
  data.analysis.signals.forEach((s, i) =>
    console.log(`  ${i + 1}. ${s.type.padEnd(24)} conf ${s.confidence.toFixed(2)}  ${s.evidence_verbatim ? '✓ verbatim' : '✗ not verbatim'}  "${s.evidence}"  (+${a.contributions[i].delta})`),
  );
  console.log(`  claims: ${data.analysis.claimed_identity ?? '-'} · asks: ${data.analysis.requested_action ?? '-'}`);
  console.log(`  summary: ${data.analysis.summary}\n`);
}
