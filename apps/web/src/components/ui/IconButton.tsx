import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Tooltip } from './Tooltip';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  variant?: 'default' | 'danger';
  size?: 'sm' | 'md';
  children: ReactNode;
}

export function IconButton({
  label,
  active = false,
  variant = 'default',
  size = 'md',
  className = '',
  children,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const sizeClass = size === 'sm' ? 'w-7 h-7 rounded-[8px]' : 'w-8 h-8 rounded-[9px]';
  const colorClass =
    variant === 'danger'
      ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10'
      : active
        ? 'bg-[var(--color-primary)]/14 text-[var(--color-primary)] border-[var(--color-primary)]/30'
        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--hover-bg)]';

  return (
    <Tooltip content={label}>
      <button
        type={type}
        aria-label={label}
        className={`inline-flex items-center justify-center border border-transparent transition-all duration-150 active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50 disabled:opacity-45 disabled:cursor-not-allowed ${sizeClass} ${colorClass} ${className}`}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
}
