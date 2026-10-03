import type { ComponentProps, ReactNode } from 'react';
import { cx } from '../../lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gold-400 text-vault-950 hover:bg-gold-300 shadow-[0_0_0_1px_rgb(229_180_84/0.5),0_10px_30px_-10px_rgb(229_180_84/0.6)]',
  secondary: 'bg-vault-800 text-zinc-100 border border-vault-600 hover:border-gold-500/70 hover:bg-vault-700',
  ghost: 'text-zinc-300 hover:text-white hover:bg-white/5',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  success: 'bg-emerald-500 text-vault-950 hover:bg-emerald-400',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-5 text-[15px] gap-2',
  lg: 'h-14 px-7 text-lg gap-2.5',
  xl: 'min-h-16 px-8 py-3 text-xl gap-3',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex select-none items-center justify-center rounded-lg font-semibold transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  icon,
  right,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx('panel flex min-h-0 flex-col', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-vault-700/80 px-4 py-2.5">
          <h2 className="op-label flex items-center gap-2 text-zinc-400">
            {icon}
            {title}
          </h2>
          {right}
        </header>
      )}
      <div className={cx('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-vault-600 bg-vault-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
      {children}
    </kbd>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cx('relative inline-flex h-2.5 w-2.5', className)} aria-hidden>
      <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" />
    </span>
  );
}
