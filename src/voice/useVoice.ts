import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchClip, fetchVoiceStatus } from './voiceApi';
import type { VoiceClip } from './voiceScript';

/**
 * Voice playback controller. Voice is always optional: every failure path simply
 * leaves the text experience running. Nothing here ever blocks the operation.
 */
export type VoiceStatus = 'checking' | 'ready' | 'unavailable';

export interface VoiceController {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  status: VoiceStatus;
  /** Short reason when voice isn't working (subtle UI only) */
  issue: string | null;
  /** True while a clip is loading or playing; auto-play waits on this */
  speaking: boolean;
  currentClipId: string | null;
  /** At least one ElevenLabs clip played this session */
  used: boolean;
  /** Interrupts by default; `queue` waits for the current clip; `force` plays even with voice mode off */
  play: (clip: VoiceClip, opts?: { queue?: boolean; force?: boolean }) => Promise<boolean>;
  stop: () => void;
  prefetch: (clips: VoiceClip[]) => void;
}

const STORAGE_KEY = 'the-crew.voice';
const ISSUE_TEXT: Record<string, string> = {
  not_configured: 'Voice not configured',
  backend_unreachable: 'Voice server offline',
  quota_exceeded: 'Voice quota used up',
  auth_failed: 'Voice key rejected',
  voice_unavailable_on_plan: 'Voice not on plan',
};

function readPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function useVoice(): VoiceController {
  const [enabled, setEnabledState] = useState(readPref);
  const [status, setStatus] = useState<VoiceStatus>('checking');
  const [issue, setIssue] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [currentClipId, setCurrentClipId] = useState<string | null>(null);
  const [used, setUsed] = useState(false);

  const enabledRef = useRef(enabled);
  const statusRef = useRef<VoiceStatus>('checking');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urls = useRef(new Map<string, Promise<string | null>>());
  const queue = useRef<VoiceClip[]>([]);
  const token = useRef(0);
  const busy = useRef(false);

  const markUnavailable = useCallback((code: string) => {
    statusRef.current = 'unavailable';
    setStatus('unavailable');
    setIssue(ISSUE_TEXT[code] ?? 'Voice unavailable');
  }, []);

  const checkStatus = useCallback(async () => {
    statusRef.current = 'checking';
    setStatus('checking');
    const s = await fetchVoiceStatus();
    if (!s) return markUnavailable('backend_unreachable');
    // Even without a key the server may still serve prewarmed clips, so stay "ready" and let playback decide.
    statusRef.current = 'ready';
    setStatus('ready');
    setIssue(null);
  }, [markUnavailable]);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const urlFor = useCallback(
    (clip: VoiceClip): Promise<string | null> => {
      const key = `${clip.role}|${clip.text}`;
      const hit = urls.current.get(key);
      if (hit) return hit;
      const p = fetchClip(clip.role, clip.text).then((r) => {
        if (r.ok) return URL.createObjectURL(r.blob);
        urls.current.delete(key); // allow a later retry
        if (r.permanent) markUnavailable(r.code);
        else setIssue('Voice unavailable');
        return null;
      });
      urls.current.set(key, p);
      return p;
    },
    [markUnavailable],
  );

  const audio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
    }
    return audioRef.current;
  }, []);

  const finish = useCallback(() => {
    busy.current = false;
    setSpeaking(false);
    setCurrentClipId(null);
  }, []);

  const start = useCallback(
    async (clip: VoiceClip): Promise<boolean> => {
      const t = ++token.current;
      busy.current = true;
      setSpeaking(true);
      setCurrentClipId(clip.id);
      const url = await urlFor(clip);
      if (t !== token.current) return false; // superseded by stop()/another clip
      if (!url) {
        finish();
        return false;
      }
      const el = audio();
      el.onended = () => {
        if (t !== token.current) return;
        const next = queue.current.shift();
        if (next) void start(next);
        else finish();
      };
      el.onerror = () => t === token.current && finish();
      el.src = url;
      try {
        await el.play();
      } catch {
        // Autoplay policy or decode error: keep the demo going silently.
        if (t === token.current) finish();
        return false;
      }
      setUsed(true);
      if (statusRef.current === 'ready') setIssue(null);
      return true;
    },
    [audio, finish, urlFor],
  );

  const stop = useCallback(() => {
    token.current++;
    queue.current = [];
    audioRef.current?.pause();
    finish();
  }, [finish]);

  const play = useCallback(
    async (clip: VoiceClip, opts: { queue?: boolean; force?: boolean } = {}) => {
      if (!opts.force && !enabledRef.current) return false;
      if (statusRef.current === 'unavailable') return false;
      if (opts.queue && busy.current) {
        queue.current.push(clip);
        return true;
      }
      queue.current = [];
      audioRef.current?.pause();
      return start(clip);
    },
    [start],
  );

  const prefetch = useCallback(
    (clips: VoiceClip[]) => {
      if (statusRef.current === 'unavailable') return;
      // Small concurrency: warm the browser cache without hammering the server.
      const pending = [...clips];
      const worker = async () => {
        for (let c = pending.shift(); c; c = pending.shift()) {
          if (statusRef.current === 'unavailable') return;
          await urlFor(c);
        }
      };
      void Promise.all([worker(), worker()]);
    },
    [urlFor],
  );

  const setEnabled = useCallback(
    (on: boolean) => {
      enabledRef.current = on;
      setEnabledState(on);
      try {
        localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
      } catch {
        /* preference just won't persist */
      }
      if (!on) stop();
      else if (statusRef.current === 'unavailable') void checkStatus(); // give it another chance
    },
    [stop, checkStatus],
  );

  useEffect(() => () => audioRef.current?.pause(), []);

  return { enabled, setEnabled, status, issue, speaking, currentClipId, used, play, stop, prefetch };
}
