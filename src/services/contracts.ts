import type { MissionEvent } from '../types';

/**
 * Future-integration seams. Phase 1 ships local implementations only; no keys required.
 * See README → "Integration map" for where each real service plugs in.
 */

/** ElevenLabs (future): calm spoken intervention. Phase 1: browser SpeechSynthesis. */
export interface VoiceService {
  readonly available: boolean;
  speak(text: string): void;
  stop(): void;
}

/**
 * Presage (future): optional physiological / stress context.
 * Contributes at most ONE weak signal, never treated as proof of a scam.
 */
export interface PhysiologicalContextProvider {
  readonly enabled: boolean;
  getStressLevel(): Promise<number | null>; // 0–1, or null when unavailable / not consented
}

/** Tiger Data / PostgreSQL (future): timestamped mission, risk and intervention events. */
export interface MissionEventStore {
  append(missionId: string, event: MissionEvent): Promise<void>;
  list(missionId: string): Promise<MissionEvent[]>;
  clear(missionId: string): Promise<void>;
}
