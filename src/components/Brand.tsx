import { motion } from 'framer-motion';

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="4" />
      <circle cx="32" cy="32" r="8" fill="currentColor" />
      <path d="M32 6v10M32 48v10M6 32h10M48 32h10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-gold-400">
      <BrandMark size={compact ? 22 : 28} />
      <span className={compact ? 'font-display text-lg tracking-[0.2em] text-zinc-100' : 'font-display text-xl tracking-[0.22em] text-zinc-100'}>
        THE CREW
      </span>
    </div>
  );
}

/** Decorative vault dial: slowly rotating tick rings. */
export function VaultDial({ size = 360, locked = false }: { size?: number; locked?: boolean }) {
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden>
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(229_180_84/0.14),transparent_65%)]" />
      <motion.svg
        viewBox="0 0 200 200"
        className="absolute inset-0"
        animate={{ rotate: locked ? 0 : 360 }}
        transition={locked ? { duration: 1.2, ease: 'easeOut' } : { duration: 90, repeat: Infinity, ease: 'linear' }}
      >
        <circle cx="100" cy="100" r="96" fill="none" stroke="#2f2f37" strokeWidth="1" />
        {ticks.map((i) => (
          <line
            key={i}
            x1="100"
            y1="6"
            x2="100"
            y2={i % 5 === 0 ? 16 : 11}
            stroke={i % 5 === 0 ? '#c9953a' : '#474752'}
            strokeWidth={i % 5 === 0 ? 1.6 : 1}
            transform={`rotate(${i * 6} 100 100)`}
          />
        ))}
      </motion.svg>
      <motion.svg
        viewBox="0 0 200 200"
        className="absolute inset-0"
        animate={{ rotate: locked ? 0 : -360 }}
        transition={locked ? { duration: 1.2, ease: 'easeOut' } : { duration: 60, repeat: Infinity, ease: 'linear' }}
      >
        <circle cx="100" cy="100" r="72" fill="#0c0c0e" stroke="#c9953a" strokeOpacity="0.5" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="64" fill="none" stroke="#2f2f37" strokeWidth="6" strokeDasharray="2 6" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <rect key={a} x="97" y="34" width="6" height="14" rx="2" fill="#e5b454" transform={`rotate(${a} 100 100)`} />
        ))}
      </motion.svg>
      <svg viewBox="0 0 200 200" className="absolute inset-0">
        <circle cx="100" cy="100" r="38" fill="#111114" stroke="#e5b454" strokeWidth="2" />
        <circle cx="100" cy="100" r="10" fill={locked ? '#34d399' : '#e5b454'} />
        <path d="M100 62v18M100 120v18M62 100h18M120 100h18" stroke="#e5b454" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
