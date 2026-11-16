import type { ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { motion, type HTMLMotionProps } from 'motion/react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-[#2A97FF] to-[#0A84FF] hover:from-[#188BFF] hover:to-[#0066CC] text-white shadow-[0_6px_18px_rgba(10,132,255,0.32)] border border-[#42A4FF]/40',
  secondary:
    'glass-light text-[var(--color-text-primary)] hover:bg-[var(--card-row-hover-bg)]',
  danger:
    'bg-gradient-to-b from-[#FF5E54] to-[#FF453A] hover:brightness-95 text-white shadow-[0_5px_15px_rgba(255,69,58,0.28)] border border-transparent',
  ghost:
    'bg-transparent border border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--hover-bg)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3.5 text-[12.5px] rounded-[9px] gap-1.5',
  md: 'h-9 px-4 text-[13.5px] rounded-[10px] gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      type={type}
      disabled={isDisabled}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.12 }}
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50 disabled:opacity-55 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {loading ? <LoaderCircle size={16} strokeWidth={1.9} className="animate-spin shrink-0" /> : leftIcon}
      <span>{children}</span>
      {!loading && rightIcon}
    </motion.button>
  );
}
