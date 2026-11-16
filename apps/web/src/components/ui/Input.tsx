import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftAddon?: ReactNode;
  rightAddon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftAddon, rightAddon, className = '', id, ...rest },
  ref
) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="text-[12.5px] font-medium text-[var(--color-text-primary)]"
        >
          {label}
        </label>
      )}
      <div
        className={`flex items-center gap-2 h-10 px-3 rounded-[9px] border bg-[var(--input-bg)] transition-all duration-150 focus-within:ring-2 ${
          error
            ? 'border-[var(--color-danger)] focus-within:ring-[var(--color-danger)]/25'
            : 'border-[var(--color-border)] focus-within:border-[var(--color-primary)] focus-within:ring-[var(--color-primary)]/20'
        }`}
      >
        {leftAddon && <span className="text-[var(--color-text-secondary)] shrink-0">{leftAddon}</span>}
        <input
          ref={ref}
          id={inputId}
          className={`w-full bg-transparent text-[13.5px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]/70 focus:outline-none ${className}`}
          {...rest}
        />
        {rightAddon && <span className="shrink-0">{rightAddon}</span>}
      </div>
      {error && <span className="text-[12px] text-[var(--color-danger)]">{error}</span>}
      {!error && hint && <span className="text-[12px] text-[var(--color-text-secondary)]">{hint}</span>}
    </div>
  );
});
