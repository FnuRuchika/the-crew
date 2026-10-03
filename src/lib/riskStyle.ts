import { ShieldAlert, ShieldCheck, Siren, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { RiskLevel, Severity } from '../types';

export const RISK_STYLE: Record<RiskLevel, { label: string; text: string; stroke: string; bg: string; icon: LucideIcon }> = {
  low: { label: 'Low', text: 'text-emerald-300', stroke: '#34d399', bg: 'bg-emerald-500/10 border-emerald-500/40', icon: ShieldCheck },
  elevated: { label: 'Elevated', text: 'text-gold-300', stroke: '#e5b454', bg: 'bg-gold-400/10 border-gold-400/40', icon: ShieldAlert },
  high: { label: 'High', text: 'text-orange-300', stroke: '#fb923c', bg: 'bg-orange-500/10 border-orange-500/40', icon: TriangleAlert },
  critical: { label: 'Critical', text: 'text-red-300', stroke: '#ef4444', bg: 'bg-red-500/15 border-red-500/50', icon: Siren },
};

export const SEVERITY_STYLE: Record<Severity, { label: string; chip: string }> = {
  low: { label: 'LOW', chip: 'border-zinc-600 text-zinc-300' },
  medium: { label: 'MEDIUM', chip: 'border-gold-500/60 text-gold-300' },
  high: { label: 'HIGH', chip: 'border-red-500/60 text-red-300' },
};
