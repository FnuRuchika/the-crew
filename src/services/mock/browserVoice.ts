import type { VoiceService } from '../contracts';

/** Uses the browser's built-in speech engine: slow, calm delivery. Swap for ElevenLabs later. */
export function createBrowserVoice(): VoiceService {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  return {
    available: Boolean(synth),
    speak(text) {
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.88;
      u.pitch = 1;
      synth.speak(u);
    },
    stop() {
      synth?.cancel();
    },
  };
}
