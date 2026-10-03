import type { MissionEvent } from '../../types';
import type { MissionEventStore } from '../contracts';

/** In-memory event log. Same contract a Tiger Data (Postgres hypertable) store will implement. */
export function createMemoryEventStore(): MissionEventStore {
  const db = new Map<string, MissionEvent[]>();
  return {
    async append(missionId, event) {
      db.set(missionId, [...(db.get(missionId) ?? []), event]);
    },
    async list(missionId) {
      return db.get(missionId) ?? [];
    },
    async clear(missionId) {
      db.delete(missionId);
    },
  };
}
