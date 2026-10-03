import type { Scenario, TargetProfile } from '../../types';

/**
 * CASE FILE 001 — The "grandparent / bail" scam.
 * Everything the demo shows comes from this file; UI components never hard-code story content.
 */

const eleanor: TargetProfile = {
  id: 'eleanor-parker',
  name: 'Eleanor Parker',
  age: 78,
  location: 'San Antonio, TX',
  phone: '(210) 555-0111',
  account: { label: 'Checking ••4821', balance: 6412.5 },
  knownPeople: [
    { id: 'daniel', name: 'Daniel Parker', relationship: 'Grandson', phone: '(210) 555-0148' },
    { id: 'sarah', name: 'Sarah Parker', relationship: 'Daughter', phone: '(210) 555-0172' },
    { id: 'tom', name: 'Tom Parker', relationship: 'Son-in-law', phone: '(210) 555-0186' },
  ],
  trustedContacts: [
    {
      id: 'sarah',
      name: 'Sarah Parker',
      relationship: 'Daughter',
      phone: '(210) 555-0172',
      priority: 1,
      note: "Daniel's mother · trusted contact since 2024",
    },
  ],
  payees: [
    { name: 'CPS Energy', timesPaid: 24, typicalAmount: 132, lastPaid: 'Sep 12' },
    { name: 'H-E-B Pharmacy', timesPaid: 31, typicalAmount: 48, lastPaid: 'Sep 28' },
    { name: 'Sarah Parker', timesPaid: 6, typicalAmount: 200, lastPaid: 'Aug 30' },
    { name: 'St. Mark Parish', timesPaid: 18, typicalAmount: 50, lastPaid: 'Sep 29' },
    { name: 'SAWS Water', timesPaid: 24, typicalAmount: 61, lastPaid: 'Sep 15' },
  ],
};

export const grandparentScam: Scenario = {
  id: 'grandparent-bail',
  caseNumber: '001',
  title: 'The Grandparent Call',
  target: eleanor,
  callerNumber: '(512) 555-0193',
  beats: [
    {
      id: 'b1',
      messages: [
        { id: 'm1', at: 0, speaker: 'system', text: 'Incoming call · (512) 555-0193 · Not in contacts' },
        {
          id: 'm2',
          at: 4,
          speaker: 'caller',
          text: 'Mrs. Parker? Your grandson Daniel has been arrested.',
          claimsIdentityOf: 'daniel',
        },
      ],
    },
    {
      id: 'b2',
      messages: [
        { id: 'm3', at: 11, speaker: 'target', text: 'Daniel? Oh no. Is he hurt? What happened?' },
        { id: 'm4', at: 17, speaker: 'caller', text: "He's not hurt, but he's in custody. He needs $2,500 for bail." },
      ],
    },
    {
      id: 'b3',
      messages: [
        { id: 'm5', at: 29, speaker: 'target', text: "$2,500? I... I don't keep that kind of money lying around." },
        {
          id: 'm6',
          at: 36,
          speaker: 'caller',
          text: "Ma'am, you need to send it immediately. If it isn't paid within the hour, he stays locked up all weekend.",
        },
      ],
    },
    {
      id: 'b4',
      messages: [
        { id: 'm7', at: 51, speaker: 'target', text: 'Let me call his mother first.' },
        {
          id: 'm8',
          at: 55,
          speaker: 'caller',
          text: "Don't tell his parents. He'll be embarrassed. He begged me not to tell them.",
        },
      ],
    },
    {
      id: 'b5',
      opensPayment: true,
      messages: [
        { id: 'm9', at: 74, speaker: 'target', text: 'Alright. How do I send it?' },
        {
          id: 'm10',
          at: 80,
          speaker: 'caller',
          text: "I'm texting you the details now. Send it to Daniel Bail Services.",
        },
        { id: 'm11', at: 86, speaker: 'system', text: 'Text message received: "Pay $2,500 to Daniel Bail Services"' },
      ],
    },
  ],
  payment: {
    id: 'pay-001',
    amount: 2500,
    currency: 'USD',
    recipient: { name: 'Daniel Bail Services', account: 'Routing ••0417 · Acct ••9930' },
    fromAccount: 'Checking ••4821',
    method: 'Instant bank transfer',
    memo: 'Bail for Daniel',
  },
  paymentAt: 128,
  pressureMessage: {
    id: 'm-pressure',
    at: 0,
    speaker: 'caller',
    text: 'Why is this taking so long?! Every minute you wait, he stays in that cell!',
  },
  verifications: [
    {
      contactId: 'sarah',
      lines: [
        { speaker: 'contact', text: 'Mom? Is everything okay?' },
        { speaker: 'target', text: 'Someone called. They said Daniel was arrested and needs $2,500 for bail.' },
        { speaker: 'contact', text: "Mom, Daniel is safe. He's right here with me at home." },
        { speaker: 'contact', text: 'Do not send this payment. That call is a scam. Please hang up.' },
      ],
      finding: 'Sarah Parker confirmed Daniel is safe at home. The emergency claim is false.',
    },
    {
      contactId: 'daniel',
      lines: [
        { speaker: 'contact', text: "Grandma? Hi! What's up?" },
        { speaker: 'target', text: "Daniel! Someone said you'd been arrested. Are you alright?" },
        { speaker: 'contact', text: "Arrested? No! I'm at my apartment. I'm totally fine." },
        { speaker: 'contact', text: "Please don't send anyone money. That's a scam." },
      ],
      finding: 'Daniel answered on his trusted number. He is safe and was never arrested.',
    },
  ],
};
