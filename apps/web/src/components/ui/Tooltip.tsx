import { useState, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  const show = () => {
    timerRef.current = window.setTimeout(() => setOpen(true), 240);
  };

  const hide = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOpen(false);
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            role="tooltip"
            className="hidden md:block pointer-events-none absolute left-1/2 -translate-x-1/2 -top-8 z-50 whitespace-nowrap rounded-[7px] px-2 py-1 text-[11.5px] font-medium glass-strong text-[var(--color-text-primary)]"
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
