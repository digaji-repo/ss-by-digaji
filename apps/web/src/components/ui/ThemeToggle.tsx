import { Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useUIStore } from '@/stores/ui.store';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const isDark = theme === 'dark';

  return (
    <Tooltip content={isDark ? 'Aktifkan Mode Terang' : 'Aktifkan Mode Gelap'}>
      <motion.button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'Mode Terang' : 'Mode Gelap'}
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.04 }}
        transition={{ duration: 0.15 }}
        className={`relative w-9 h-9 rounded-full glass-light border border-[var(--color-border)] flex items-center justify-center overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/50 ${className}`}
      >
        {/* Subtle inner theme glow */}
        <motion.span
          aria-hidden="true"
          animate={{
            opacity: isDark ? 0.32 : 0.24,
            scale: isDark ? 1 : 0.92,
            backgroundColor: isDark ? '#0A84FF' : '#FF9F0A',
          }}
          transition={{ duration: 0.3 }}
          className="absolute inset-1 rounded-full blur-[7px] pointer-events-none"
        />

        <AnimatePresence mode="wait" initial={false}>
          {isDark ? (
            <motion.span
              key="sun"
              initial={{ opacity: 0, rotate: -70, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 70, scale: 0.6 }}
              transition={{ duration: 0.22 }}
              className="relative z-10 text-[#FBBF24]"
            >
              <Sun size={17} strokeWidth={2} />
            </motion.span>
          ) : (
            <motion.span
              key="moon"
              initial={{ opacity: 0, rotate: 70, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: -70, scale: 0.6 }}
              transition={{ duration: 0.22 }}
              className="relative z-10 text-[var(--color-text-primary)]"
            >
              <Moon size={17} strokeWidth={1.9} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </Tooltip>
  );
}
