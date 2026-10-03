import type { SignalCategory } from '../types';

export interface SignalDefinition {
  label: string;
  /** Generic explanation; agents add a situation-specific `detail` */
  explanation: string;
  /** Which family of evidence it belongs to (for the mission report) */
  family: 'conversation' | 'payment' | 'identity';
}

export const SIGNAL_CATALOG: Record<SignalCategory, SignalDefinition> = {
  'emergency-claim': {
    label: 'Family emergency claim',
    explanation: 'The call opened with frightening news about someone you love. Fear makes it hard to think clearly.',
    family: 'conversation',
  },
  'emotional-leverage': {
    label: 'Emotional leverage',
    explanation: "A request for money was tied directly to a loved one's safety.",
    family: 'conversation',
  },
  urgency: {
    label: 'Artificial urgency',
    explanation: 'You were pushed to act immediately. Real emergencies leave time to check.',
    family: 'conversation',
  },
  isolation: {
    label: 'Isolation & secrecy',
    explanation: 'You were asked to keep this from family. Scammers isolate people so nobody can stop them.',
    family: 'conversation',
  },
  authority: {
    label: 'Authority impersonation',
    explanation: 'The caller claimed official authority (police, court, bank) to discourage questions.',
    family: 'conversation',
  },
  'pressure-escalation': {
    label: 'Pressure escalation',
    explanation: 'The caller grew more insistent when you paused. Legitimate people respect a pause.',
    family: 'conversation',
  },
  'new-recipient': {
    label: 'New recipient',
    explanation: 'You have never sent money to this recipient before.',
    family: 'payment',
  },
  'unusual-amount': {
    label: 'Unusual payment amount',
    explanation: 'This amount is far larger than your normal payments.',
    family: 'payment',
  },
  'identity-mismatch': {
    label: 'Identity inconsistency',
    explanation: "Details don't match what we know about the person being claimed.",
    family: 'identity',
  },
};
