import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'primary' | 'accent' | 'warning' | 'danger';

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--color-text-secondary)]/10 text-[var(--color-text-secondary)] border-[var(--color-border)]',
  primary: 'bg-[var(--color-primary)]/12 text-[var(--color-primary)] border-[var(--color-primary)]/20',
  accent: 'bg-[var(--color-accent)]/15 text-[#0F8A64] dark:text-[var(--color-accent)] border-[var(--color-accent)]/25',
  warning: 'bg-[var(--color-warning)]/14 text-[#B86E00] dark:text-[var(--color-warning)] border-[var(--color-warning)]/25',
  danger: 'bg-[var(--color-danger)]/14 text-[var(--color-danger)] border-[var(--color-danger)]/25',
};

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11.5px] font-medium leading-tight ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

interface ProgressProps {
  value: number;
  tone?: 'primary' | 'accent' | 'warning' | 'danger';
  className?: string;
}

const progressTones = {
  primary: 'bg-[var(--color-primary)]',
  accent: 'bg-[var(--color-accent)]',
  warning: 'bg-[var(--color-warning)]',
  danger: 'bg-[var(--color-danger)]',
};

export function Progress({ value, tone = 'primary', className = '' }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`w-full h-1.5 rounded-full bg-[var(--color-border)]/70 overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-200 ${progressTones[tone]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

interface AvatarProps {
  label: string;
  size?: 'sm' | 'md';
}

const avatarPalette = [
  'bg-[#0A84FF]/15 text-[#0A84FF]',
  'bg-[#30D5A0]/20 text-[#0F8A64] dark:text-[#30D5A0]',
  'bg-[#5E5CE6]/15 text-[#5E5CE6]',
  'bg-[#FF9F0A]/18 text-[#C27803] dark:text-[#FF9F0A]',
];

export function Avatar({ label, size = 'sm' }: AvatarProps) {
  const code = label.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const color = avatarPalette[code % avatarPalette.length] ?? avatarPalette[0];
  const initials = label.slice(0, 2).toUpperCase();
  const dim = size === 'sm' ? 'w-6 h-6 text-[10.5px]' : 'w-8 h-8 text-[12px]';

  return (
    <span
      title={label}
      className={`inline-flex items-center justify-center rounded-full font-semibold shrink-0 ${dim} ${color}`}
    >
      {initials}
    </span>
  );
}

export function Separator({ className = '' }: { className?: string }) {
  return <div className={`h-px w-full bg-[var(--color-border)]/80 ${className}`} />;
}
