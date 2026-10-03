import type { SignalCategory } from '../types';
import type { ConversationAnalyst } from './contracts';
import { makeSignal } from './signalFactory';

/**
 * THE GRIFTER: Phase-1 pattern rules.
 * Future: replace with a Gemini call returning the same RiskSignal[] (structured output),
 * which can catch paraphrases these patterns miss.
 */
interface PatternRule {
  category: SignalCategory;
  patterns: RegExp[];
  detail: string;
}

const RULES: PatternRule[] = [
  {
    category: 'emergency-claim',
    patterns: [/\bhas been arrested\b/i, /\b(arrested|in jail|in custody|had an accident|in the hospital)\b/i],
    detail: 'The caller opened with alarming news about someone you love, before saying who they are.',
  },
  {
    category: 'emotional-leverage',
    patterns: [/\bneeds? \$[\d,]+(?: for bail)?/i, /\bfor bail\b/i],
    detail: 'Money was presented as the only way to help your family member. That turns your love into leverage.',
  },
  {
    category: 'urgency',
    patterns: [/\bsend it immediately\b/i, /\b(immediately|right now|within the hour|hurry)\b/i],
    detail: 'You were told to pay immediately, with a deadline, which leaves no time to check.',
  },
  {
    category: 'isolation',
    patterns: [/\bdon[’']t tell (?:his|her|your|anyone)[a-z ]*/i, /\bkeep (?:this|it) (?:secret|between us)\b/i],
    detail: 'You were asked to keep this from family, the very people who could confirm the story.',
  },
  {
    category: 'authority',
    patterns: [/\b(officer|sergeant|detective|public defender|court clerk)\b/i],
    detail: 'The caller presented as an official to discourage questions.',
  },
  {
    category: 'pressure-escalation',
    patterns: [/\bwhy is this taking so long\b/i, /\bevery minute you wait\b/i],
    detail: 'When you paused to check, the caller pushed harder instead of waiting.',
  },
];

export const grifter: ConversationAnalyst = {
  async analyze(events, ctx) {
    const found = [];
    const seen = new Set(ctx.alreadyDetected);
    for (const event of events) {
      if (event.speaker !== 'caller') continue;
      for (const rule of RULES) {
        if (seen.has(rule.category)) continue;
        const match = rule.patterns.map((p) => event.text.match(p)).find(Boolean);
        if (!match) continue;
        seen.add(rule.category);
        found.push(
          makeSignal({
            category: rule.category,
            detectedBy: 'grifter',
            detectedAt: event.at,
            detail: rule.detail,
            evidence: match[0].trim(),
            sourceEventId: event.id,
          }),
        );
      }
    }
    return found;
  },
};
