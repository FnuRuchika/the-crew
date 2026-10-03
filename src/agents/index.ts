import type { Crew } from './contracts';
import { fixer } from './fixer';
import { getawayDriver } from './getawayDriver';
import { grifter } from './grifter';
import { insideMan } from './insideMan';
import { lookout } from './lookout';
import { mastermind } from './mastermind';
import { safecracker } from './safecracker';

/**
 * Agent registry. To replace a mock with a real AI agent, implement the matching
 * contract (see ./contracts.ts), e.g. a Gemini-backed ConversationAnalyst that calls
 * the FastAPI backend, and swap it in here. The UI never imports agents directly.
 */
export const localCrew: Crew = {
  mastermind,
  grifter,
  lookout,
  insideMan,
  safecracker,
  fixer,
  getaway: getawayDriver,
};

export type { Crew } from './contracts';
