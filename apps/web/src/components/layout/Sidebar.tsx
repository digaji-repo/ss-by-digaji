import { Activity, Code, Folder } from 'lucide-react';
import { useFileStore } from '@/stores/file.store';
import { usePasteStore } from '@/stores/paste.store';
import { useRoomStore } from '@/stores/room.store';
import { useUIStore } from '@/stores/ui.store';
import type { WorkspaceTab } from '@/types/ui';
import { formatBytes } from '@/utils/format-size';

export function Sidebar() {
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);

  const room = useRoomStore((s) => s.room);
  const eventsCount = useRoomStore((s) => s.events.length);
  const filesCount = useFileStore((s) => s.files.length);
  const pastesCount = usePasteStore((s) => s.pastes.length);

  if (!room) return null;

  const usedPercent =
    room.storage_limit > 0 ? Math.min(100, (room.used_storage / room.storage_limit) * 100) : 0;

  const navItems: Array<{
    id: WorkspaceTab;
    label: string;
    icon: typeof Folder;
    count: number;
  }> = [
    { id: 'files', label: 'Files', icon: Folder, count: filesCount },
    { id: 'pastes', label: 'Paste', icon: Code, count: pastesCount },
    { id: 'activity', label: 'Activity', icon: Activity, count: eventsCount },
  ];

  return (
    <div className="flex flex-col gap-3 glass-medium rounded-[18px] p-3.5">
      <nav aria-label="Navigasi Workspace" className="space-y-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-[12px] text-[13.5px] font-semibold transition-all duration-150 cursor-pointer ${
                active
                  ? 'bg-gradient-to-b from-[#2A97FF] to-[#0A84FF] text-white shadow-[0_6px_18px_rgba(10,132,255,0.34)]'
                  : 'text-[var(--color-text-primary)]/80 hover:text-[var(--color-text-primary)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon size={18} strokeWidth={1.9} />
                <span>{item.label}</span>
              </span>
              {item.count > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    active
                      ? 'bg-white/22 text-white'
                      : 'bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)]'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Compact Storage Card */}
      <div className="glass-light rounded-[14px] p-3 space-y-2">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-semibold text-[var(--color-text-primary)]">
            Penyimpanan Room
          </span>
          <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
            {Math.round(usedPercent)}%
          </span>
        </div>
        <p className="text-[12px] text-[var(--color-text-secondary)] font-medium">
          {formatBytes(room.used_storage)} / {formatBytes(room.storage_limit)}
        </p>
        <div className="w-full h-2 rounded-full bg-[var(--color-border)]/70 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#2DD4BF] to-[#30D5A0] transition-all duration-300"
            style={{ width: `${Math.max(usedPercent > 0 ? 4 : 0, usedPercent)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
