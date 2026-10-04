import { useSyncExternalStore } from 'react';
import type { LedgerRecorder, LedgerSnapshot } from './LedgerRecorder';

const EMPTY: LedgerSnapshot = { connection: 'offline', operationId: null, entries: [], completed: false, fullyPersisted: false, syncedClose: false };
const noop = () => () => {};

/** Re-render when a recorder's ledger changes. */
export function useLedgerSnapshot(recorder: LedgerRecorder | null): LedgerSnapshot {
  return useSyncExternalStore(recorder?.subscribe ?? noop, recorder?.getSnapshot ?? (() => EMPTY));
}
