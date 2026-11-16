import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

export interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onClick: () => void;
}

interface DropdownProps {
  trigger: ReactNode;
  items: readonly DropdownMenuItem[];
  align?: 'left' | 'right';
}

interface DropdownPosition {
  top: number;
  left?: number;
  right?: number;
  placement: 'bottom' | 'top';
}

export function Dropdown({ trigger, items, align = 'right' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<DropdownPosition | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const estimatedHeight = Math.min(items.length * 38 + 16, 280);
    const spaceBelow = window.innerHeight - rect.bottom;
    const shouldOpenTop = spaceBelow < estimatedHeight && rect.top > estimatedHeight;

    setMenuPos({
      top: shouldOpenTop ? rect.top - 6 : rect.bottom + 6,
      right: align === 'right' ? Math.max(8, window.innerWidth - rect.right) : undefined,
      left: align === 'left' ? Math.max(8, rect.left) : undefined,
      placement: shouldOpenTop ? 'top' : 'bottom',
    });
  }, [align, items.length]);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
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
  }, [open, updatePosition]);

  const handleToggle = () => {
    if (!open) {
      updatePosition();
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const menuContent = (
    <AnimatePresence>
      {open && menuPos && (
        <motion.div
          ref={menuRef}
          initial={{
            opacity: 0,
            y: menuPos.placement === 'bottom' ? -4 : 4,
            scale: 0.97,
          }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{
            opacity: 0,
            y: menuPos.placement === 'bottom' ? -4 : 4,
            scale: 0.97,
          }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          role="menu"
          style={{
            position: 'fixed',
            top: menuPos.placement === 'bottom' ? menuPos.top : undefined,
            bottom:
              menuPos.placement === 'top' ? window.innerHeight - menuPos.top : undefined,
            left: menuPos.left,
            right: menuPos.right,
            zIndex: 80,
          }}
          className="min-w-[180px] p-1.5 rounded-[14px] glass-strong"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-[9px] text-[13px] font-medium transition-colors cursor-pointer ${
                item.danger
                  ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10'
                  : 'text-[var(--color-text-primary)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div ref={triggerRef} className="relative inline-block">
      <div onClick={handleToggle}>{trigger}</div>
      {typeof document !== 'undefined' ? createPortal(menuContent, document.body) : menuContent}
    </div>
  );
}

interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
}

export function Popover({ trigger, children, align = 'right' }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className={`absolute z-40 mt-2 w-72 p-3.5 rounded-[14px] glass-strong ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
