import { useEffect, useRef } from 'react';
import type { OperationState } from '../types';
import type { VoiceController } from './useVoice';
import type { CaseFileVoiceScript } from './voiceScript';

/**
 * Connects Case File 001 to voice by *observing* operation state; the scripted
 * operation itself is untouched and runs identically with voice off or failing.
 *
 *  - new caller line in the transcript → caller voice (interrupts the previous line)
 *  - THE HEIST IS IN PROGRESS          → calm guardian voice
 *  - leaving the intervention          → stop (the person has acted)
 *  - trusted-contact lines             → family voice, queued so lines don't cut each other off
 *  - reset / replay                    → stop
 */
export function useCaseFileVoice(state: OperationState, voice: VoiceController, script: CaseFileVoiceScript, active: boolean) {
  const v = useRef(voice);
  v.current = voice;
  const prev = useRef({ messages: state.messages.length, phase: state.phase, transcript: 0 });

  useEffect(() => {
    const p = prev.current;
    const transcript = state.verification?.transcript ?? [];
    prev.current = { messages: state.messages.length, phase: state.phase, transcript: transcript.length };
    if (!active) return;

    if (state.messages.length < p.messages) v.current.stop(); // reset / replay

    for (const m of state.messages.slice(p.messages)) {
      const clip = m.speaker === 'caller' ? script.forMessage(m.id) : undefined;
      if (clip) void v.current.play(clip);
    }

    if (state.phase !== p.phase) {
      if (state.phase === 'intervention') void v.current.play(script.intervention);
      else if (['verifying', 'cooldown', 'exit', 'protected', 'briefing'].includes(state.phase)) v.current.stop();
    }

    if (state.verification && transcript.length > p.transcript) {
      for (let i = p.transcript; i < transcript.length; i++) {
        if (transcript[i].speaker !== 'contact') continue;
        const clip = script.forVerificationLine(state.verification.contact.id, i);
        if (clip) void v.current.play(clip, { queue: true });
      }
    }
  }, [state.messages, state.phase, state.verification, script, active]);

  // Warm every clip as soon as voice is usable, so playback is instant during the demo.
  const warmed = useRef(false);
  useEffect(() => {
    if (active && voice.enabled && voice.status === 'ready' && !warmed.current) {
      warmed.current = true;
      voice.prefetch(script.clips);
    }
  }, [active, voice.enabled, voice.status, voice, script]);
}
