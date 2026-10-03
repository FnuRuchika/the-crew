import type { AnalyzeResponse, ApiError, HealthResponse } from './types';

/**
 * Talks to the FastAPI backend. In dev, Vite proxies /api → http://127.0.0.1:8000,
 * so no key or backend URL ever lives in frontend code. Set VITE_API_BASE_URL for
 * a deployed backend.
 */
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const CLIENT_TIMEOUT_MS = 30_000;

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const OFFLINE: ApiError = {
  code: 'backend_unreachable',
  message: "Can't reach THE CREW's analysis server. Is the backend running?",
  retryable: true,
};

async function request<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    if (res.ok && body) return { ok: true, data: body as T };
    if (body?.error?.code) return { ok: false, error: body.error as ApiError };
    // Vite's proxy answers 5xx with no JSON when the backend is down.
    return { ok: false, error: res.status >= 500 ? OFFLINE : { code: 'http_error', message: `Server error (${res.status}).`, retryable: true } };
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      return { ok: false, error: { code: 'timeout', message: 'The analysis took too long.', retryable: true } };
    }
    return { ok: false, error: OFFLINE };
  } finally {
    clearTimeout(timer);
  }
}

export function analyzeTransmission(text: string): Promise<Result<AnalyzeResponse>> {
  return request<AnalyzeResponse>('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

export function fetchHealth(): Promise<Result<HealthResponse>> {
  return request<HealthResponse>('/api/health');
}
