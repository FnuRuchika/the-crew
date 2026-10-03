import type { VoiceClip } from '../voice/voiceScript';

/**
 * LOAD DEMO AUDIO: a scam call in three segments, *spoken* by the caller voice (ElevenLabs TTS,
 * cached by `npm run prewarm:voice`). The audio, not this text, is what gets analysed: each clip
 * goes through real ElevenLabs speech-to-text exactly like a microphone recording.
 */
export const DEMO_CALL_SEGMENTS: VoiceClip[] = [
  {
    id: 'live-demo:1',
    role: 'caller',
    text: "Hello, this is the fraud department at your bank. We've detected suspicious activity on your account.",
  },
  {
    id: 'live-demo:2',
    role: 'caller',
    text: "Someone has compromised your account. Please don't hang up, and don't tell anyone about this call.",
  },
  {
    id: 'live-demo:3',
    role: 'caller',
    text: 'To protect your savings, you need to transfer nine hundred dollars to our secure account immediately.',
  },
];

/** THE CREW's calm guardian voice for a live-call intervention. Never fear-based, never blaming. */
export const LIVE_GUARDIAN_CLIP: VoiceClip = {
  id: 'guardian:live-call',
  role: 'guardian',
  text:
    "We noticed several warning signs in this conversation. You don't need to make a decision or send money right now. " +
    "It's okay to end the call and verify using a phone number you already trust.",
};

export const LIVE_CALL_CLIPS: VoiceClip[] = [...DEMO_CALL_SEGMENTS, LIVE_GUARDIAN_CLIP];
