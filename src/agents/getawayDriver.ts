import type { ExitPlanner } from './contracts';

/** THE GETAWAY DRIVER: a calm, concrete way out. */
export const getawayDriver: ExitPlanner = {
  async plan({ callerNumber, target, verified }) {
    const trusted = target.trustedContacts[0];
    return [
      {
        id: 'hang-up',
        title: 'Hang up the call',
        detail: "You don't need to explain or argue. Simply end the call.",
      },
      {
        id: 'block',
        title: `Block ${callerNumber}`,
        detail: 'If they call back, you will not have to answer.',
      },
      {
        id: 'no-callback',
        title: "Don't use any number or link they sent",
        detail: 'Always use the numbers already saved in your phone.',
      },
      {
        id: 'report',
        title: 'Report the attempt',
        detail: 'We will file it with your bank and the FTC (reportfraud.ftc.gov) for you.',
      },
      {
        id: 'reconnect',
        title: trusted ? `Talk it through with ${trusted.name.split(' ')[0]}` : 'Talk it through with someone you trust',
        detail: verified
          ? 'You did the right thing by checking. Many caring people are targeted this way.'
          : 'Let someone you trust know what happened today.',
      },
    ];
  },
};
