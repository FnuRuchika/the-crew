import type { InterventionAction } from '../types';
import type { InterventionPlanner } from './contracts';

/**
 * THE FIXER: turns evidence into empathetic, actionable friction.
 * Never "Are you sure?". Always: here is what we noticed, here is a safe next step.
 */
export const fixer: InterventionPlanner = {
  async plan({ clock, assessment, signals, target, claimedPersonId }) {
    const claimed = target.knownPeople.find((p) => p.id === claimedPersonId);
    const trusted = [...target.trustedContacts].sort((a, b) => a.priority - b.priority)[0];
    const claimedFirst = claimed?.name.split(' ')[0];

    const actions: InterventionAction[] = [];
    if (trusted) {
      actions.push({
        id: 'call-trusted-contact',
        label: `Call ${trusted.name.split(' ')[0]} — ${trusted.relationship}`,
        description: `We'll call ${trusted.phone}, the number saved in your contacts, not one the caller gave you.`,
        recommended: true,
        contactId: trusted.id,
      });
    }
    if (claimed) {
      actions.push({
        id: 'verify-claimed-person',
        label: `Verify ${claimedFirst}`,
        description: `Call ${claimedFirst} directly on the number you already have: ${claimed.phone}.`,
        contactId: claimed.id,
      });
    }
    actions.push({
      id: 'wait',
      label: 'Wait 10 minutes',
      description: 'Your payment stays on hold. Real emergencies can wait ten minutes. Scams cannot.',
    });
    actions.push({
      id: 'exit',
      label: 'End the call safely',
      description: 'Hang up now. You do not owe the caller an explanation.',
    });

    return {
      id: `int-${clock}`,
      triggeredAt: clock,
      riskScore: assessment.score,
      headline: 'The heist is in progress',
      message: "We noticed several things that don't match your normal activity.",
      reasons: signals,
      actions,
    };
  },
};
