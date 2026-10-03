import { HeartHandshake, UserRound } from 'lucide-react';
import { Panel } from '../components/ui/primitives';
import { formatMoney } from '../lib/format';
import type { Mission } from '../types';

export function TargetDossier({ mission }: { mission: Mission }) {
  const t = mission.target;
  const trusted = t.trustedContacts[0];
  return (
    <Panel title="Target" icon={<UserRound size={13} aria-hidden />} right={<span className="op-label">Protected</span>}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-gold-500/40 bg-vault-800 font-display text-lg text-gold-300">
            {t.name.split(' ').map((n) => n[0]).join('')}
          </span>
          <div>
            <p className="font-display text-xl uppercase tracking-wide text-zinc-50">{t.name}</p>
            <p className="text-sm text-zinc-400">
              {t.age} · {t.location}
            </p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-vault-900/70 px-2.5 py-1.5">
            <dt className="op-label text-[10px]">Account</dt>
            <dd className="text-zinc-200">{t.account.label}</dd>
          </div>
          <div className="rounded-md bg-vault-900/70 px-2.5 py-1.5">
            <dt className="op-label text-[10px]">Balance</dt>
            <dd className="text-zinc-200">{formatMoney(t.account.balance, { cents: true })}</dd>
          </div>
        </dl>
        {trusted && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1.5 text-sm">
            <HeartHandshake size={15} className="shrink-0 text-emerald-400" aria-hidden />
            <span className="text-zinc-300">
              Trusted contact: <span className="text-zinc-100">{trusted.name}</span> ({trusted.relationship.toLowerCase()})
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}
