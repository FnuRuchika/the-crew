import {
  Binoculars,
  Brain,
  CarFront,
  Drama,
  Fingerprint,
  Vault,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { AgentId, AgentStatus } from '../../types';

export const AGENT_ICONS: Record<AgentId, LucideIcon> = {
  mastermind: Brain,
  grifter: Drama,
  lookout: Binoculars,
  insideMan: Fingerprint,
  safecracker: Vault,
  fixer: Wrench,
  getaway: CarFront,
};

/** Status is always shown as text + style, never colour alone. */
export const STATUS_STYLE: Record<AgentStatus, { label: string; chip: string; ring: string; icon: string }> = {
  standby: {
    label: 'Standby',
    chip: 'border-vault-600 text-zinc-500 bg-vault-800',
    ring: 'border-vault-700',
    icon: 'text-zinc-600 bg-vault-800',
  },
  monitoring: {
    label: 'Monitoring',
    chip: 'border-sky-500/40 text-sky-300 bg-sky-500/10',
    ring: 'border-sky-500/30',
    icon: 'text-sky-300 bg-sky-500/10',
  },
  active: {
    label: 'Active',
    chip: 'border-gold-400/60 text-gold-300 bg-gold-400/10',
    ring: 'border-gold-400/60',
    icon: 'text-vault-950 bg-gold-400',
  },
  complete: {
    label: 'Complete',
    chip: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
    ring: 'border-emerald-500/30',
    icon: 'text-emerald-300 bg-emerald-500/10',
  },
};
