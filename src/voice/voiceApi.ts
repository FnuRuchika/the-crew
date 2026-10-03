import type { VoiceRole } from '../types';

/**
 * Voice requests go to our backend (/api/voice), which holds the ElevenLabs key.
 * The browser never talks to ElevenLabs directly.
 */
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export interface VoiceStatus {
  configured: boolean;
  model: string;
}

export type ClipResult = { ok: true; blob: Blob; cache: 'hit' | 'miss' } | { ok: false; code: string; permanent: boolean };

/** Codes where retrying this session is pointless. */
const PERMANENT = new Set(['not_configured', 'auth_failed', 'quota_exceeded', 'voice_unavailable_on_plan', 'backend_unreachable']);

export async function fetchVoiceStatus(): Promise<VoiceStatus | null> {
  try {
    const r = await fetch(`${BASE}/api/voice/status`);
    return r.ok ? ((await r.json()) as VoiceStatus) : null;
  } catch {
    return null;
  }
}

export async function fetchClip(role: VoiceRole, text: string, timeoutMs = 25_000): Promise<ClipResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/api/voice/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, text }),
      signal: ctrl.signal,
    });
    if (r.ok && (r.headers.get('content-type') ?? '').startsWith('audio/')) {
      return { ok: true, blob: await r.blob(), cache: r.headers.get('x-voice-cache') === 'hit' ? 'hit' : 'miss' };
    }
    const body = await r.json().catch(() => null);
    const code: string = body?.error?.code ?? (r.status >= 500 ? 'backend_unreachable' : 'http_error');
    return { ok: false, code, permanent: PERMANENT.has(code) };
  } catch (e) {
    const code = (e as Error).name === 'AbortError' ? 'timeout' : 'backend_unreachable';
    return { ok: false, code, permanent: code === 'backend_unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
