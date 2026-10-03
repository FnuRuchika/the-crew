import type { IdentityVerifier } from './contracts';
import { makeSignal } from './signalFactory';

const digits = (phone: string) => phone.replace(/\D/g, '');

/**
 * THE INSIDE MAN: checks claims against trusted context the scammer cannot see:
 * known phone numbers, family relationships, payee history.
 */
export const insideMan: IdentityVerifier = {
  async check({ claimedPersonId, callerNumber, payment, ctx }) {
    if (!claimedPersonId || ctx.alreadyDetected.has('identity-mismatch')) return [];
    const person = ctx.target.knownPeople.find((p) => p.id === claimedPersonId);
    if (!person) return [];

    const callerIsKnown = ctx.target.knownPeople.some((p) => digits(p.phone) === digits(callerNumber));
    if (callerIsKnown) return [];

    const recipientNeverPaid =
      payment && !ctx.target.payees.some((p) => p.name.toLowerCase() === payment.recipient.name.toLowerCase());

    const firstName = person.name.split(' ')[0];
    return [
      makeSignal({
        category: 'identity-mismatch',
        detectedBy: 'insideMan',
        detectedAt: ctx.clock,
        detail:
          `The caller is speaking for ${firstName}, but the call comes from ${callerNumber}. ` +
          `${firstName}'s number is ${person.phone}, and this number isn't anyone in your contacts.` +
          (recipientNeverPaid ? ` "${payment!.recipient.name}" uses ${firstName}'s name but has never been paid.` : ''),
        evidence: `${callerNumber} ≠ ${person.phone}`,
      }),
    ];
  },

  resolveTrustedChannel(personId, target) {
    return target.knownPeople.find((p) => p.id === personId);
  },
};
