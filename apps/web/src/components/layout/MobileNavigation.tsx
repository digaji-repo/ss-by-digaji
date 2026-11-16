import { Activity, Code, Folder } from 'lucide-react';
import { motion } from 'motion/react';
import { useFileStore } from '@/stores/file.store';
import { usePasteStore } from '@/stores/paste.store';
import { useUIStore } from '@/stores/ui.store';
import type { WorkspaceTab } from '@/types/ui';

export function MobileNavigation() {
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const filesCount = useFileStore((s) => s.files.length);
  const pastesCount = usePasteStore((s) => s.pastes.length);

  const items: Array<{ id: WorkspaceTab; label: string; icon: typeof Folder; count?: number }> = [
    { id: 'files', label: 'Files', icon: Folder, count: filesCount },
    { id: 'pastes', label: 'Paste', icon: Code, count: pastesCount },
    { id: 'activity', label: 'Activity', icon: Activity },
  ];

  return (
    <div className="lg:hidden fixed bottom-3 inset-x-0 z-40 flex justify-center px-4 pb-safe pointer-events-none">
      <nav
        aria-label="Navigasi Mobile"
        className="pointer-events-auto glass-pill-dock rounded-full p-1.5 w-full max-w-[360px] grid grid-cols-3 gap-1"
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <motion.button
              key={item.id}
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex items-center justify-center gap-1.5 h-10 px-3 rounded-full text-[12.5px] font-semibold transition-colors cursor-pointer select-none ${
                active
                  ? 'text-[var(--color-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="ios-mobile-pill"
                  transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                  className="absolute inset-0 rounded-full bg-[var(--pill-active-bg)] border border-[var(--color-primary)]/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                <Icon size={17} strokeWidth={active ? 2.2 : 1.9} />
                <span>{item.label}</span>
                {typeof item.count === 'number' && item.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      active
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-text-secondary)]/15 text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </span>
            </motion.button>
          );
        })}
      </nav>
    </div>
  );
}
