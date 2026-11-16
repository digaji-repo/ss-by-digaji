import {
  Activity,
  Clock,
  Code,
  Download,
  FilePlus2,
  Trash2,
  UserCheck,
  UserMinus,
} from 'lucide-react';
import { Badge } from '@/components/ui/Primitives';
import { EmptyState } from '@/components/ui/States';
import { useRoomStore } from '@/stores/room.store';
import type { RoomEventRecord } from '@/types/room';
import { formatRelativeTime } from '@/utils/format-date';

function describeEvent(ev: RoomEventRecord): {
  label: string;
  tone: 'primary' | 'accent' | 'warning' | 'danger' | 'neutral';
  icon: typeof Activity;
} {
  const meta = ev.metadata ?? {};
  const str = (k: string) => (typeof meta[k] === 'string' ? meta[k] : '');

  switch (ev.event_type) {
    case 'room.created':
      return { label: `Room ${str('room_code')} dibuat`, tone: 'primary', icon: Activity };
    case 'room.user_online':
    case 'room.joined':
      return { label: `${str('label') || 'Peserta'} bergabung`, tone: 'accent', icon: UserCheck };
    case 'room.user_left':
      return { label: `${str('label') || 'Peserta'} keluar`, tone: 'neutral', icon: UserMinus };
    case 'room.expiring':
      return { label: 'Room akan segera berakhir', tone: 'warning', icon: Clock };
    case 'room.expired':
      return { label: 'Room telah kedaluwarsa', tone: 'danger', icon: Clock };
    case 'file.upload_started':
      return {
        label: `Mulai upload ${str('original_name') || 'file'}`,
        tone: 'primary',
        icon: FilePlus2,
      };
    case 'file.upload_completed':
      return {
        label: `File diupload: ${str('original_name') || 'file'}`,
        tone: 'accent',
        icon: FilePlus2,
      };
    case 'file.updated':
      return {
        label:
          str('action') === 'renamed'
            ? `File diubah nama: ${str('old_name')} → ${str('original_name')}`
            : `File diedit: ${str('original_name') || 'file'}`,
        tone: 'primary',
        icon: Code,
      };
    case 'file.downloaded':
      return {
        label: `File diunduh: ${str('original_name') || 'file'}`,
        tone: 'primary',
        icon: Download,
      };
    case 'file.deleted':
      return {
        label: `File dihapus: ${str('original_name') || 'file'}`,
        tone: 'danger',
        icon: Trash2,
      };
    case 'paste.created':
      return {
        label: `Paste dibuat: ${str('title') || 'Untitled'}`,
        tone: 'accent',
        icon: Code,
      };
    case 'paste.updated':
      return {
        label: `Paste diperbarui: ${str('title') || 'Untitled'}`,
        tone: 'primary',
        icon: Code,
      };
    case 'paste.deleted':
      return {
        label: `Paste dihapus: ${str('title') || 'Untitled'}`,
        tone: 'danger',
        icon: Trash2,
      };
    default:
      return { label: ev.event_type, tone: 'neutral', icon: Activity };
  }
}

export function ActivityFeature() {
  const events = useRoomStore((s) => s.events);
  const sorted = [...events].reverse();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-[12px] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
          <Activity size={21} strokeWidth={2} />
        </span>
        <div>
          <h2 className="text-[19px] font-bold tracking-tight text-[var(--color-text-primary)] leading-tight">
            Activity
          </h2>
          <p className="text-[12.5px] text-[var(--color-text-secondary)]">
            Catatan kehadiran anggota, upload, download, dan pembaruan paste secara realtime.
          </p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Activity size={22} strokeWidth={1.8} />}
          title="Belum Ada Aktivitas"
          description="Semua kejadian file, paste, dan kehadiran peserta di room ini akan muncul di sini."
        />
      ) : (
        <div className="glass-light rounded-[14px] p-2.5 sm:p-3">
          <div className="max-h-[380px] sm:max-h-[460px] overflow-y-auto pr-1.5 space-y-2">
            {sorted.map((ev) => {
              const info = describeEvent(ev);
              const Icon = info.icon;
              return (
                <div
                  key={ev.id}
                  className="rounded-[11px] border border-[var(--color-border)] bg-[var(--card-row-bg)] hover:bg-[var(--card-row-hover-bg)] px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-[9px] bg-[var(--color-surface-muted)] flex items-center justify-center text-[var(--color-primary)] shrink-0">
                      <Icon size={15} strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate text-[var(--color-text-primary)]">
                        {info.label}
                      </p>
                      <p className="text-[11px] font-mono text-[var(--color-text-secondary)]">
                        {ev.event_type}
                      </p>
                    </div>
                  </div>
                  <Badge tone={info.tone} className="shrink-0">
                    {formatRelativeTime(ev.created_at)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
