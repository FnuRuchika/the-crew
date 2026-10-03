import { SIGNAL_CATALOG } from '../data/signalCatalog';
import type { Deployment } from '../types';
import type { Mastermind } from './contracts';

/**
 * THE MASTERMIND: Phase-1 deterministic orchestration.
 *
 * Crew members are only brought in when the situation calls for them. Future: a Gemini
 * orchestrator receives the same OperationState snapshot and returns Deployment[] with reasons.
 */
export const mastermind: Mastermind = {
  async plan(trigger, state, newSignals = []) {
    const out: Deployment[] = [];
    const status = (id: keyof typeof state.agents) => state.agents[id].status;

    switch (trigger) {
      case 'operation-start':
        out.push({ agentId: 'mastermind', status: 'active', reason: 'Operation opened. Listening to the call.' });
        break;

      case 'conversation': {
        if (newSignals.length) {
          const s = newSignals[newSignals.length - 1];
          out.push({
            agentId: 'grifter',
            status: 'active',
            reason: `${SIGNAL_CATALOG[s.category].label} detected`,
          });
        }
        const lastCaller = [...state.messages].reverse().find((m) => m.speaker === 'caller');
        const claimed = state.messages.find((m) => m.claimsIdentityOf)?.claimsIdentityOf;
        if (claimed && status('insideMan') === 'standby' && !state.agents.insideMan.note) {
          const person = state.mission.target.knownPeople.find((p) => p.id === claimed);
          out.push({
            agentId: 'insideMan',
            status: 'standby',
            reason: `Claimed identity noted: ${person?.name ?? 'unknown'} (${person?.relationship.toLowerCase()})`,
          });
        }
        if (lastCaller && /\$[\d,]+/.test(lastCaller.text) && status('lookout') === 'standby') {
          out.push({
            agentId: 'lookout',
            status: 'monitoring',
            reason: 'Money requested. Watching outgoing payments.',
          });
        }
        break;
      }

      case 'payment-submitted':
        out.push(
          { agentId: 'lookout', status: 'active', reason: 'Payment initiated during a high-risk call' },
          { agentId: 'insideMan', status: 'active', reason: 'Checking the claim against trusted context' },
        );
        break;

      case 'evidence-gathered':
        out.push({
          agentId: 'safecracker',
          status: 'active',
          reason: `Combining ${state.signals.length} signals from ${new Set(state.signals.map((s) => s.detectedBy)).size} crew members`,
        });
        break;

      case 'intervention':
        out.push(
          { agentId: 'fixer', status: 'active', reason: 'Critical risk with money in flight. Payment held.' },
          { agentId: 'grifter', status: 'monitoring', reason: 'Watching for escalating pressure' },
          { agentId: 'lookout', status: 'complete', reason: 'Payment anomalies reported' },
          { agentId: 'safecracker', status: 'complete', reason: `Verdict: ${state.assessment.score}% critical` },
        );
        break;

      case 'threat-confirmed':
        out.push(
          { agentId: 'getaway', status: 'active', reason: 'Threat confirmed. Planning a safe exit.' },
          { agentId: 'insideMan', status: 'complete', reason: 'Trusted verification complete' },
          { agentId: 'fixer', status: 'complete', reason: 'Payment stopped' },
        );
        break;

      case 'mission-complete':
        (['mastermind', 'grifter', 'getaway'] as const).forEach((id) =>
          out.push({ agentId: id, status: 'complete', reason: 'Operation complete' }),
        );
        break;
    }
    return out;
  },

  async classifyThreat(signals) {
    const has = (c: string) => signals.some((s) => s.category === c);
    if (has('emergency-claim') && has('isolation') && has('emotional-leverage')) {
      return {
        type: 'Grandparent / bail scam',
        summary:
          'A caller invents a family emergency, demands bail money urgently, and asks the victim to keep it secret from the family.',
        confidence: 0.94,
      };
    }
    return {
      type: 'Social-engineering payment scam',
      summary: 'Manipulation tactics combined with an anomalous payment.',
      confidence: 0.7,
    };
  },
};
