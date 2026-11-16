import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', id, ...rest }: TextareaProps) {
  const fieldId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label htmlFor={fieldId} className="text-[12.5px] font-medium text-[var(--color-text-primary)]">
          {label}
        </label>
      )}
      <textarea
        id={fieldId}
        className={`w-full rounded-[9px] border bg-[var(--input-bg)] px-3 py-2.5 text-[13.5px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]/70 transition-all duration-150 focus:outline-none focus:ring-2 ${
          error
            ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]/25'
            : 'border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/20'
        } ${className}`}
        {...rest}
      />
      {error && <span className="text-[12px] text-[var(--color-danger)]">{error}</span>}
    </div>
  );
}

interface SelectOption {
  value: string;
  label: string;
}

export interface SelectChangeEvent {
  target: { value: string };
}

interface SelectProps {
  label?: string;
  options: readonly SelectOption[];
  value?: string;
  onChange?: (event: SelectChangeEvent) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
  placeholder?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  placement: 'bottom' | 'top';
}

export function Select({
  label,
  options,
  value,
  onChange,
  className = '',
  id,
  disabled = false,
  'aria-label': ariaLabel,
  placeholder = 'Pilih...',
}: SelectProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState<number>(-1);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const estimatedMenuHeight = Math.min(options.length * 38 + 14, 240);
    const spaceBelow = window.innerHeight - rect.bottom;
    const shouldOpenTop = spaceBelow < estimatedMenuHeight && rect.top > estimatedMenuHeight;

    setMenuPos({
      top: shouldOpenTop ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: Math.max(rect.width, 118),
      placement: shouldOpenTop ? 'top' : 'bottom',
    });
  }, [options.length]);

  const openMenu = useCallback(() => {
    if (disabled) return;
    updatePosition();
    setHighlightedIdx(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [disabled, selectedIndex, updatePosition]);

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  const commitValue = useCallback(
    (nextValue: string) => {
      onChange?.({ target: { value: nextValue } });
      closeMenu();
      triggerRef.current?.focus();
    },
    [closeMenu, onChange]
  );

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      closeMenu();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
        triggerRef.current?.focus();
      }
    };

    const onViewportChange = () => updatePosition();

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, closeMenu, updatePosition]);

  const handleTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((prev) => (prev + 1) % Math.max(1, options.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((prev) => (prev <= 0 ? options.length - 1 : prev - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHighlightedIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setHighlightedIdx(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const targetOpt = options[highlightedIdx];
      if (targetOpt) commitValue(targetOpt.value);
    }
  };

  const menuContent =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {open && menuPos && (
              <motion.div
                ref={menuRef}
                role="listbox"
                aria-labelledby={fieldId}
                initial={{
                  opacity: 0,
                  y: menuPos.placement === 'bottom' ? -6 : 6,
                  scale: 0.97,
                }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  y: menuPos.placement === 'bottom' ? -4 : 4,
                  scale: 0.97,
                }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: 'fixed',
                  top: menuPos.placement === 'bottom' ? menuPos.top : undefined,
                  bottom:
                    menuPos.placement === 'top' ? window.innerHeight - menuPos.top : undefined,
                  left: menuPos.left,
                  minWidth: menuPos.width,
                  zIndex: 80,
                }}
                className="glass-strong rounded-[14px] p-1.5 max-h-60 overflow-y-auto"
              >
                <div className="space-y-0.5">
                  {options.map((opt, idx) => {
                    const isSelected = opt.value === value;
                    const isHighlighted = idx === highlightedIdx;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() => setHighlightedIdx(idx)}
                        onClick={() => commitValue(opt.value)}
                        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-[9px] text-left text-[13px] transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-gradient-to-b from-[#2A97FF] to-[#0A84FF] text-white font-semibold shadow-[0_3px_10px_rgba(10,132,255,0.28)]'
                            : isHighlighted
                              ? 'bg-[var(--hover-bg)] text-[var(--color-text-primary)] font-medium'
                              : 'text-[var(--color-text-primary)] hover:bg-[var(--hover-bg)] font-medium'
                        }`}
                      >
                        <span className="truncate">{opt.label}</span>
                        {isSelected && <Check size={14} strokeWidth={2.4} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="text-[12.5px] font-medium text-[var(--color-text-primary)]">
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        id={fieldId}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        className={`h-9 w-full flex items-center justify-between gap-2 rounded-[10px] border px-3 text-[13px] font-medium transition-all duration-150 cursor-pointer select-none focus:outline-none disabled:opacity-55 disabled:cursor-not-allowed ${
          open
            ? 'border-[var(--color-primary)] bg-[var(--input-bg)] ring-2 ring-[var(--color-primary)]/20 text-[var(--color-text-primary)]'
            : 'border-[var(--color-border)] bg-[var(--input-bg)] text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/50'
        } ${className}`}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown
          size={15}
          strokeWidth={2}
          className={`text-[var(--color-text-secondary)] shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180 text-[var(--color-primary)]' : ''
          }`}
        />
      </button>
      {menuContent}
    </div>
  );
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

export function Checkbox({ label, checked, onChange, className = '', ...rest }: CheckboxProps) {
  return (
    <label className={`inline-flex items-center gap-2 cursor-pointer select-none ${className}`}>
      <span
        className={`w-4 h-4 rounded-[5px] border flex items-center justify-center transition-colors duration-150 ${
          checked
            ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
            : 'border-[var(--color-border)] bg-[var(--input-bg)]'
        }`}
      >
        {checked && <Check size={12} strokeWidth={2.4} />}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} {...rest} />
      <span className="text-[13px] text-[var(--color-text-primary)]">{label}</span>
    </label>
  );
}
