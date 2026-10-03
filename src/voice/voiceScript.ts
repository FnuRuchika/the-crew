import type { Scenario, VoiceRole } from '../types';

/**
 * Which scenario lines get a voice, and in which voice.
 * Shared by the app (playback) and `npm run prewarm:voice` (cache warm-up), so the exact
 * same role + text pairs are requested in both places and always hit the server cache.
 */
export interface VoiceClip {
  id: string;
  role: VoiceRole;
  text: string;
}

export interface CaseFileVoiceScript {
  clips: VoiceClip[];
  forMessage(messageId: string): VoiceClip | undefined;
  forVerificationLine(contactId: string, transcriptIndex: number): VoiceClip | undefined;
  intervention: VoiceClip;
}

export function buildCaseFileVoiceScript(scenario: Scenario): CaseFileVoiceScript {
  const byMessage = new Map<string, VoiceClip>();
  const byVerification = new Map<string, VoiceClip>();

  // The scam caller's lines, exactly as they appear in the transcript.
  for (const m of [...scenario.beats.flatMap((b) => b.messages), scenario.pressureMessage]) {
    if (m.speaker === 'caller') byMessage.set(m.id, { id: `msg:${m.id}`, role: 'caller', text: m.text });
  }

  // Trusted-contact lines (only the contact's side; the target's own words stay text).
  for (const v of scenario.verifications) {
    if (!v.voiceRole) continue;
    v.lines.forEach((line, i) => {
      if (line.speaker === 'contact') byVerification.set(`${v.contactId}:${i}`, { id: `verify:${v.contactId}:${i}`, role: v.voiceRole!, text: line.text });
    });
  }

  // THE CREW's calm protective voice. Reassuring, never fear-based, never blaming.
  const first = scenario.target.name.split(' ')[0];
  const claimedId = scenario.beats.flatMap((b) => b.messages).find((m) => m.claimsIdentityOf)?.claimsIdentityOf;
  const claimed = scenario.target.knownPeople.find((p) => p.id === claimedId)?.name.split(' ')[0];
  const intervention: VoiceClip = {
    id: 'guardian:intervention',
    role: 'guardian',
    text:
      `${first}, we've paused this payment because we noticed several warning signs. ` +
      `You don't need to make a decision right now. Your money is safe while you check. ` +
      (claimed ? `Let's verify ${claimed} using a phone number you already trust.` : `Let's verify this request using a phone number you already trust.`),
  };

  return {
    clips: [...byMessage.values(), intervention, ...byVerification.values()],
    forMessage: (id) => byMessage.get(id),
    forVerificationLine: (contactId, i) => byVerification.get(`${contactId}:${i}`),
    intervention,
  };
}
