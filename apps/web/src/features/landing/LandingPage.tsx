import { useEffect, useRef, useState } from 'react';
import { CloudUpload, Info, LogIn, PlusCircle, Shield, Users, Zap } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { AmbientBackground } from '@/components/layout/AmbientBackground';
import { IconButton } from '@/components/ui/IconButton';
import { Modal } from '@/components/ui/Modal';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { CreateRoomForm } from './components/CreateRoomForm';
import { JoinRoomForm } from './components/JoinRoomForm';

type LandingTab = 'create' | 'join';

const morphSpring = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 30,
  mass: 0.85,
};

export function LandingPage() {
  const [tab, setTab] = useState<LandingTab>('create');
  const [infoOpen, setInfoOpen] = useState(false);

  const measureRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = measureRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const updateHeight = () => {
      const nextHeight = el.getBoundingClientRect().height;
      if (nextHeight > 0) {
        setContentHeight(nextHeight);
      }
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tab]);

  return (
    <AmbientBackground>
      {/* Top Bar */}
      <header className="max-w-5xl w-full mx-auto px-4 sm:px-6 pt-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-[11px] bg-[var(--color-primary)]/12 text-[var(--color-primary)] border border-[var(--color-primary)]/20 flex items-center justify-center shrink-0">
            <CloudUpload size={20} strokeWidth={2} />
          </span>
          <div className="leading-tight" aria-label="DropRoom">
            <div className="font-bold text-[16px] tracking-tight">
              <span className="text-[var(--color-text-primary)]">Drop</span>
              <span className="text-[var(--color-primary)]">Room</span>
            </div>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Temporary File &amp; Text Room
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <IconButton
            label="Tentang DropRoom"
            onClick={() => setInfoOpen(true)}
            className="w-9 h-9 rounded-full glass-light border border-[var(--color-border)]"
          >
            <Info size={17} strokeWidth={1.9} />
          </IconButton>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Centered Single-Focus Hero & Morphing Card */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:py-8">
        <LayoutGroup id="landing-card-morph">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
            className="w-full max-w-[660px] flex flex-col items-center gap-5"
          >
            {/* Centered Headline */}
            <div className="text-center space-y-1.5 max-w-md">
              <h1 className="text-[25px] sm:text-[28px] font-bold tracking-tight text-[var(--color-text-primary)] leading-tight">
                Buat atau Masuk ke{' '}
                <span className="text-[var(--color-primary)]">Room</span>
              </h1>
              <p className="text-[13px] sm:text-[13.5px] text-[var(--color-text-secondary)] leading-relaxed">
                Ruang berbagi file dan teks sementara. Tanpa login, cepat, dan aman.
              </p>
            </div>

            {/* Floating Segmented Tab Pills */}
            <div
              role="tablist"
              className="inline-flex items-center gap-2 p-1.5 rounded-[14px] glass-light"
            >
              {(
                [
                  { id: 'create', label: 'Buat Room', icon: PlusCircle },
                  { id: 'join', label: 'Masuk Room', icon: LogIn },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    onClick={() => setTab(item.id)}
                    className={`relative inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'text-white'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="landing-segmented-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-[10px] bg-gradient-to-b from-[#2A97FF] to-[#0A84FF] shadow-[0_6px_18px_rgba(10,132,255,0.34)]"
                      />
                    )}
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      <Icon size={15} strokeWidth={2} />
                      <span>{item.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Morphing Glass Form Card (smooth width + height + blur crossfade) */}
            <motion.div
              animate={{
                maxWidth: tab === 'create' ? 540 : 456,
              }}
              transition={morphSpring}
              className="w-full glass-strong rounded-[22px] p-5 sm:p-6 overflow-hidden"
            >
              <motion.div
                animate={contentHeight !== undefined ? { height: contentHeight } : undefined}
                transition={morphSpring}
                className="overflow-hidden"
              >
                <div ref={measureRef} className="relative">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div
                      key={tab}
                      initial={{
                        opacity: 0,
                        x: tab === 'join' ? 24 : -24,
                        scale: 0.985,
                        filter: 'blur(4px)',
                      }}
                      animate={{
                        opacity: 1,
                        x: 0,
                        scale: 1,
                        filter: 'blur(0px)',
                      }}
                      exit={{
                        opacity: 0,
                        x: tab === 'join' ? -24 : 24,
                        scale: 0.985,
                        filter: 'blur(4px)',
                      }}
                      transition={{
                        duration: 0.24,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      {tab === 'create' ? <CreateRoomForm /> : <JoinRoomForm />}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.div>
            </motion.div>

            {/* Bottom 3 Compact Feature Badges (glide smoothly with card morph) */}
            <motion.div
              layout
              transition={morphSpring}
              className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1"
            >
              <div className="glass-light rounded-[14px] px-3.5 py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-[10px] bg-[#30D5A0]/16 text-[#0F8A64] dark:text-[var(--color-accent)] flex items-center justify-center shrink-0">
                  <Zap size={17} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-[var(--color-text-primary)] truncate">
                    Cepat &amp; Ringan
                  </p>
                  <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                    Buat room dalam 1 detik
                  </p>
                </div>
              </div>

              <div className="glass-light rounded-[14px] px-3.5 py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-[10px] bg-[var(--color-primary)]/14 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                  <Shield size={17} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-[var(--color-text-primary)] truncate">
                    Sementara &amp; Aman
                  </p>
                  <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                    Otomatis berakhir sesuai waktu
                  </p>
                </div>
              </div>

              <div className="glass-light rounded-[14px] px-3.5 py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-[10px] bg-[var(--color-primary)]/14 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                  <Users size={17} strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-[var(--color-text-primary)] truncate">
                    Tanpa Login
                  </p>
                  <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                    Langsung digunakan
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </LayoutGroup>
      </main>

      <Modal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Tentang DropRoom"
        description="Platform berbagi file & teks sementara berbasis Room"
        size="sm"
      >
        <div className="space-y-2.5 text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            DropRoom memungkinkan Anda membuat ruang sementara dengan kode 3 karakter tanpa akun
            atau registrasi.
          </p>
          <p>
            Semua file, paste kode, kehadiran pengguna, dan hitungan mundur disinkronkan secara
            realtime. Setelah masa berlaku habis (maksimal 7 hari), seluruh data akan dihapus
            otomatis.
          </p>
        </div>
      </Modal>
    </AmbientBackground>
  );
}
