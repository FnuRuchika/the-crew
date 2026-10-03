import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, Fingerprint, PhoneCall, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/primitives';
import { cx } from '../lib/format';
import type { TargetProfile, VerificationState } from '../types';

export function VerificationPanel({
  verification,
  target,
  onStop,
  busy,
}: {
  verification: VerificationState;
  target: TargetProfile;
  onStop: () => void;
  busy: boolean;
}) {
  const { contact, stage, transcript } = verification;
  const isTrusted = target.trustedContacts.some((t) => t.id === contact.id);
  const first = target.name.split(' ')[0];
  const contactFirst = contact.name.split(' ')[0];

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-500/40 bg-vault-900 shadow-[0_0_80px_-30px_rgb(52_211_153/0.5)]" role="dialog" aria-modal="true" aria-labelledby="verify-title">
      <div className="p-6 sm:p-9">
        <p className="op-label flex items-center gap-2 text-emerald-300">
          <Fingerprint size={14} aria-hidden /> The Inside Man
        </p>
        <h2 id="verify-title" className="mt-2 font-display text-3xl uppercase tracking-wide text-zinc-50 sm:text-4xl">
          {stage === 'confirmed' ? 'Verification complete' : 'Establishing trusted verification…'}
        </h2>

        <div className="mt-6 flex flex-wrap items-center gap-5 rounded-xl border border-vault-600 bg-vault-850 p-5">
          <span className="relative inline-flex h-20 w-20 shrink-0">
            {stage === 'dialing' && <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-emerald-400" aria-hidden />}
            <span className="inline-flex h-full w-full items-center justify-center rounded-full bg-emerald-500/15 font-display text-2xl text-emerald-200">
              {contact.name.split(' ').map((n) => n[0]).join('')}
            </span>
          </span>
          <div className="flex-1">
            <p className="font-display text-3xl uppercase tracking-wide text-zinc-50">{contact.name}</p>
            <p className="text-lg text-zinc-300">{contact.relationship}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {isTrusted && (
                <span className="inline-flex items-center gap-1 rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-sm font-semibold text-emerald-300">
                  <BadgeCheck size={15} aria-hidden /> Trusted contact
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded border border-vault-600 px-2 py-0.5 font-mono text-sm text-zinc-300">
                <PhoneCall size={14} aria-hidden /> {contact.phone}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">Number from {first}'s saved contacts, never one provided by the caller.</p>
          </div>
          <span
            className={cx(
              'rounded border px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-widest',
              stage === 'dialing' ? 'border-gold-500/50 text-gold-300' : 'border-emerald-500/50 text-emerald-300',
            )}
          >
            {stage === 'dialing' ? 'Calling…' : stage === 'connected' ? 'Connected' : 'Verified'}
          </span>
        </div>

        <ol className="mt-5 flex flex-col gap-3" aria-live="polite">
          <AnimatePresence initial={false}>
            {transcript.map((line, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cx('flex max-w-[85%] flex-col gap-1', line.speaker === 'contact' ? 'self-start' : 'items-end self-end')}
              >
                <span className="op-label text-[10px]">{line.speaker === 'contact' ? contactFirst : first}</span>
                <p
                  className={cx(
                    'rounded-2xl px-4 py-2.5 text-xl leading-snug',
                    line.speaker === 'contact' ? 'rounded-tl-sm border border-emerald-500/30 bg-emerald-500/10 text-emerald-50' : 'rounded-tr-sm border border-gold-500/25 bg-gold-400/10 text-gold-100',
                  )}
                >
                  {line.text}
                </p>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>

        <AnimatePresence>
          {stage === 'confirmed' && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-xl border-2 border-emerald-500/60 bg-emerald-500/10 p-5">
              <p className="flex items-center gap-2 font-display text-2xl uppercase tracking-wider text-emerald-300">
                <ShieldCheck size={26} aria-hidden /> Claim disproven
              </p>
              <p className="mt-1 text-xl text-zinc-100">{verification.finding}</p>
              <Button variant="success" size="xl" className="mt-5 w-full" onClick={onStop} disabled={busy} autoFocus>
                Stop the payment &amp; end the scam call
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
