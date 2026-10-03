import { formatMoney } from '../lib/format';
import type { PaymentMonitor } from './contracts';
import { makeSignal } from './signalFactory';

/** How many times larger than the usual largest payment counts as "unusual". */
const UNUSUAL_MULTIPLIER = 3;

/**
 * THE LOOKOUT: compares the payment to the account holder's own history.
 * Real deterministic logic; later it can read history from Tiger Data instead of mock data.
 */
export const lookout: PaymentMonitor = {
  async analyze(payment, ctx) {
    const signals = [];
    const { payees } = ctx.target;

    const known = payees.find((p) => p.name.toLowerCase() === payment.recipient.name.toLowerCase());
    if (!known && !ctx.alreadyDetected.has('new-recipient')) {
      signals.push(
        makeSignal({
          category: 'new-recipient',
          detectedBy: 'lookout',
          detectedAt: ctx.clock,
          detail: `You have never paid "${payment.recipient.name}" before. It is not one of your ${payees.length} usual payees.`,
          evidence: payment.recipient.name,
        }),
      );
    }

    const usualMax = Math.max(...payees.map((p) => p.typicalAmount));
    const ratio = payment.amount / usualMax;
    if (ratio >= UNUSUAL_MULTIPLIER && !ctx.alreadyDetected.has('unusual-amount')) {
      signals.push(
        makeSignal({
          category: 'unusual-amount',
          detectedBy: 'lookout',
          detectedAt: ctx.clock + 1,
          detail: `${formatMoney(payment.amount)} is about ${Math.round(ratio)}× larger than your usual payments (normally ${formatMoney(usualMax)} or less).`,
          evidence: formatMoney(payment.amount),
        }),
      );
    }
    return signals;
  },
};
