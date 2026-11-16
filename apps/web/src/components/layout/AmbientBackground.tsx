import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { useUIStore } from '@/stores/ui.store';

export function AmbientBackground({ children }: { children: ReactNode }) {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === 'dark';

  return (
    <div className="min-h-screen app-ambient-canvas flex flex-col">
      {/* Subtle animated ambient light layers (respects prefers-reduced-motion via MotionConfig) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <motion.div
          animate={{
            x: [0, 26, -12, 0],
            y: [0, 18, -10, 0],
            opacity: isDark ? 0.14 : 0.42,
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-36 -left-32 w-[460px] h-[460px] rounded-full blur-[90px]"
          style={{
            background: isDark
              ? 'radial-gradient(circle, rgba(10,132,255,0.45) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(120,185,255,0.55) 0%, transparent 70%)',
          }}
        />

        <motion.div
          animate={{
            x: [0, -24, 14, 0],
            y: [0, -16, 14, 0],
            opacity: isDark ? 0.11 : 0.34,
          }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-40 -left-24 w-[420px] h-[420px] rounded-full blur-[95px]"
          style={{
            background: isDark
              ? 'radial-gradient(circle, rgba(48,213,160,0.35) 0%, transparent 72%)'
              : 'radial-gradient(circle, rgba(48,213,160,0.42) 0%, transparent 72%)',
          }}
        />

        <motion.div
          animate={{
            x: [0, -18, 12, 0],
            y: [0, 20, -12, 0],
            opacity: isDark ? 0.13 : 0.36,
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[12%] -right-32 w-[440px] h-[440px] rounded-full blur-[95px]"
          style={{
            background: isDark
              ? 'radial-gradient(circle, rgba(10,132,255,0.42) 0%, transparent 72%)'
              : 'radial-gradient(circle, rgba(96,165,250,0.46) 0%, transparent 72%)',
          }}
        />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">{children}</div>
    </div>
  );
}
