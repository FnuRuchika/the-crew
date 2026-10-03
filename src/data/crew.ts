import type { Agent, AgentId } from '../types';

/**
 * Crew roster — static configuration for every agent.
 * The *behaviour* of each agent lives in src/agents/*; this file is just who they are.
 */
export const CREW: Record<AgentId, Agent> = {
  mastermind: {
    id: 'mastermind',
    name: 'The Mastermind',
    fileNo: '00',
    role: 'Orchestrator',
    tagline: 'Reads the room. Assembles the crew.',
    specialties: ['Situation awareness', 'Crew deployment', 'Threat classification'],
    deployedWhen: 'Always on. Decides who else is needed, and when.',
  },
  grifter: {
    id: 'grifter',
    name: 'The Grifter',
    fileNo: '01',
    role: 'Manipulation analyst',
    tagline: 'Knows every con, because they think like a con artist.',
    specialties: ['Urgency', 'Fear & emotional leverage', 'Authority', 'Secrecy & isolation'],
    deployedWhen: 'When the conversation shows persuasion tactics.',
  },
  lookout: {
    id: 'lookout',
    name: 'The Lookout',
    fileNo: '02',
    role: 'Behaviour & payment watch',
    tagline: 'Watches the money and notices what is out of character.',
    specialties: ['New recipients', 'Unusual amounts', 'Odd timing', 'Payment method risk'],
    deployedWhen: 'When money enters the conversation.',
  },
  insideMan: {
    id: 'insideMan',
    name: 'The Inside Man',
    fileNo: '03',
    role: 'Trusted context',
    tagline: 'Knows who is who, and which numbers are real.',
    specialties: ['Known contacts', 'Payee history', 'Identity mismatches', 'Trusted verification'],
    deployedWhen: 'When someone claims to be (or speak for) a person you know.',
  },
  safecracker: {
    id: 'safecracker',
    name: 'The Safecracker',
    fileNo: '04',
    role: 'Risk assessment',
    tagline: 'Combines every clue into one clear verdict.',
    specialties: ['Evidence fusion', 'Risk scoring', 'Explainability'],
    deployedWhen: 'When several signals need to be weighed together.',
  },
  fixer: {
    id: 'fixer',
    name: 'The Fixer',
    fileNo: '05',
    role: 'Intervention',
    tagline: 'Slows things down and offers safe options.',
    specialties: ['Smart friction', 'Safe alternatives', 'Empathetic warnings'],
    deployedWhen: 'When risk is critical and money is about to move.',
  },
  getaway: {
    id: 'getaway',
    name: 'The Getaway Driver',
    fileNo: '06',
    role: 'Safe exit',
    tagline: 'Gets you out of the scam safely.',
    specialties: ['End the call', 'Block & report', 'Reconnect with family'],
    deployedWhen: 'Once the threat is confirmed and it is time to leave.',
  },
};

export const CREW_ORDER: AgentId[] = [
  'mastermind',
  'grifter',
  'lookout',
  'insideMan',
  'safecracker',
  'fixer',
  'getaway',
];

/** Field agents = everyone the Mastermind can deploy. */
export const FIELD_AGENTS: AgentId[] = CREW_ORDER.filter((id) => id !== 'mastermind');
