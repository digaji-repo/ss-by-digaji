import { CheckCircle, CircleX, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useUIStore } from '@/stores/ui.store';
import type { ToastType } from '@/types/ui';

const iconByType: Record<ToastType, typeof Info> = {
  success: CheckCircle,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
  loading: LoaderCircle,
};

const badgeToneByType: Record<ToastType, string> = {
  success: 'bg-[#30D5A0]/18 text-[#0F8A64] dark:text-[var(--color-accent)]',
  error: 'bg-[var(--color-danger)]/16 text-[var(--color-danger)]',
  warning: 'bg-[var(--color-warning)]/16 text-[#B86E00] dark:text-[var(--color-warning)]',
  info: 'bg-[var(--color-primary)]/14 text-[var(--color-primary)]',
  loading: 'bg-[var(--color-primary)]/14 text-[var(--color-primary)]',
};

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const dismissToast = useUIStore((s) => s.dismissToast);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed z-[90] top-3 left-1/2 -translate-x-1/2 md:top-auto md:bottom-4 md:left-auto md:right-5 md:translate-x-0 flex flex-col gap-2 w-[calc(100vw-24px)] max-w-[360px]"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = iconByType[toast.type];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto glass-strong rounded-[14px] px-3.5 py-2.5 flex items-center gap-3 text-[13px] text-[var(--color-text-primary)]"
            >
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${badgeToneByType[toast.type]}`}
              >
                <Icon
                  size={16}
                  strokeWidth={2.1}
                  className={toast.type === 'loading' ? 'animate-spin' : ''}
                />
              </span>
              <span className="flex-1 font-medium leading-snug">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Tutup notifikasi"
                className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--hover-bg)] cursor-pointer"
              >
                <X size={13} strokeWidth={2} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
