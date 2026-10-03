import type { Result } from '../live-analysis/api';

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export interface TranscribeResponse {
  source: 'elevenlabs';
  text: string;
  language_code: string | null;
  model: string;
  latency_ms: number;
}

/** Upload one recorded segment to our backend, which forwards it to ElevenLabs STT. */
export async function transcribeAudio(audio: Blob, timeoutMs = 45_000): Promise<Result<TranscribeResponse>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const type = (audio.type || 'audio/webm').split(';')[0];
  const ext = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' }[type] ?? 'webm';
  const form = new FormData();
  form.append('file', new File([audio], `segment.${ext}`, { type }));
  try {
    const r = await fetch(`${BASE}/api/transcribe`, { method: 'POST', body: form, signal: ctrl.signal });
    const body = await r.json().catch(() => null);
    if (r.ok && body?.text) return { ok: true, data: body as TranscribeResponse };
    if (body?.error?.code) return { ok: false, error: body.error };
    return { ok: false, error: { code: 'backend_unreachable', message: "Can't reach THE CREW's transcription server.", retryable: true } };
  } catch (e) {
    return (e as Error).name === 'AbortError'
      ? { ok: false, error: { code: 'timeout', message: 'Transcription took too long.', retryable: true } }
      : { ok: false, error: { code: 'backend_unreachable', message: "Can't reach THE CREW's transcription server.", retryable: true } };
  } finally {
    clearTimeout(timer);
  }
}
