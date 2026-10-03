import { localCrew, type Crew } from '../agents';
import type { MissionEventStore, PhysiologicalContextProvider, VoiceService } from './contracts';
import { createBrowserVoice } from './mock/browserVoice';
import { createMemoryEventStore } from './mock/memoryEventStore';
import { nullPhysiological } from './mock/nullPhysiological';

/**
 * Service container: the single place to switch between local mocks and real integrations.
 *
 * Later, e.g.:
 *   crew: import.meta.env.VITE_API_BASE_URL ? createRemoteCrew(import.meta.env.VITE_API_BASE_URL) : localCrew
 *   voice: createElevenLabsVoice('/api/voice')   // key stays server-side
 *   events: createTigerDataStore('/api/events')
 */
export interface Services {
  crew: Crew;
  voice: VoiceService;
  physiological: PhysiologicalContextProvider;
  events: MissionEventStore;
}

export const services: Services = {
  crew: localCrew,
  voice: createBrowserVoice(),
  physiological: nullPhysiological,
  events: createMemoryEventStore(),
};
