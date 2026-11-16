import type { ReactNode } from 'react';
import { motion } from 'motion/react';

interface CardProps {
  intensity?: 'light' | 'medium' | 'strong';
  padding?: 'none' | 'compact' | 'standard';
  className?: string;
  children: ReactNode;
}

const intensityMap = {
  light: 'glass-light',
  medium: 'glass-medium',
  strong: 'glass-strong',
};

const paddingMap = {
  none: '',
  compact: 'p-3 sm:p-4',
  standard: 'p-4 sm:p-5',
};

export function Card({
  intensity = 'light',
  padding = 'standard',
  className = '',
  children,
}: CardProps) {
  return (
    <div
      className={`rounded-[12px] ${intensityMap[intensity]} ${paddingMap[padding]} ${className}`}
    >
      {children}
    </div>
  );
}

export interface TabOption<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  badge?: number;
}

interface TabsProps<T extends string> {
  options: readonly TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  layoutId?: string;
  className?: string;
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  layoutId = 'tabs-pill',
  className = '',
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={`inline-flex items-center p-1 rounded-[11px] bg-[var(--color-surface-muted)] border border-[var(--color-border)] ${className}`}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`relative inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors duration-150 cursor-pointer ${
              active
                ? 'text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-[8px] bg-[var(--color-surface)] shadow-sm border border-[var(--color-border)]/60"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {opt.icon}
              <span>{opt.label}</span>
              {typeof opt.badge === 'number' && opt.badge > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-[var(--color-primary)]/12 text-[var(--color-primary)] font-semibold">
                  {opt.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
