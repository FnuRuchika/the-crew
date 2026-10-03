import { riskEngine } from '../engine/riskEngine';
import type { RiskAssessor } from './contracts';

/** THE SAFECRACKER: delegates to the swappable risk engine. */
export const safecracker: RiskAssessor = {
  async assess(signals) {
    return riskEngine.assess(signals);
  },
};
