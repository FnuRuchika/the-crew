import type { PhysiologicalContextProvider } from '../contracts';

/** Presage is optional and opt-in. Phase 1 ships it disabled. */
export const nullPhysiological: PhysiologicalContextProvider = {
  enabled: false,
  async getStressLevel() {
    return null;
  },
};
