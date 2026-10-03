/**
 * Pre-generate every Case File 001 and Live Call voice clip into the backend's disk cache
 * (backend/.voice-cache), so the judged demo plays instantly and uses no live quota.
 *
 *   Terminal 1: cd backend && .venv/bin/uvicorn main:app --port 8000
 *   Terminal 2: npm run prewarm:voice
 *
 * Safe to re-run: clips already cached are reported as "cached" and cost nothing.
 * The ElevenLabs key never leaves the backend; this script only talks to /api/voice.
 */
import { grandparentScam } from '../src/data/scenarios/grandparentScam';
import { LIVE_CALL_CLIPS } from '../src/live-call/liveCallScript';
import { buildCaseFileVoiceScript } from '../src/voice/voiceScript';

const API = process.env.CREW_API ?? 'http://127.0.0.1:8000';

async function main() {
  const status = await fetch(`${API}/api/voice/status`).then((r) => r.json()).catch(() => null);
  if (!status) {
    console.error(`✗ Backend not reachable at ${API}. Start it first:\n  cd backend && .venv/bin/uvicorn main:app --port 8000`);
    process.exit(1);
  }
  console.log(`Voice backend ok · model ${status.model} · key configured: ${status.configured}\n`);

  // Case File 001 lines + Live Call demo audio and guardian line.
  const clips = [...buildCaseFileVoiceScript(grandparentScam).clips, ...LIVE_CALL_CLIPS];
  let failed = 0;
  let generated = 0;
  for (const clip of clips) {
    const t0 = Date.now();
    const r = await fetch(`${API}/api/voice/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: clip.role, text: clip.text }),
    });
    const label = `${clip.id.padEnd(24)} ${clip.role.padEnd(14)}`;
    if (r.ok) {
      const bytes = (await r.arrayBuffer()).byteLength;
      const hit = r.headers.get('x-voice-cache') === 'hit';
      if (!hit) generated += clip.text.length;
      console.log(`✓ ${label} ${hit ? 'cached   ' : 'generated'} ${(bytes / 1024).toFixed(0).padStart(4)} KB  ${Date.now() - t0} ms`);
    } else {
      failed++;
      const body = await r.json().catch(() => null);
      console.log(`✗ ${label} ${body?.error?.code ?? r.status}: ${body?.error?.message ?? ''}`);
    }
  }
  console.log(`\n${clips.length - failed}/${clips.length} clips ready · ${generated} characters generated this run`);
  if (failed) {
    console.log('Some clips failed. The demo still works (those lines stay text-only). Re-run to retry.');
    process.exit(1);
  }
}

void main();
