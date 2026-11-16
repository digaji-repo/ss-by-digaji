import { Copy, HardDrive, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge, Progress, Separator } from '@/components/ui/Primitives';
import { useRoomStore } from '@/stores/room.store';
import { useUIStore } from '@/stores/ui.store';
import { formatBytes } from '@/utils/format-size';

interface RoomModalsProps {
  onCopyShareLink: () => void;
}

export function RoomModals({ onCopyShareLink }: RoomModalsProps) {
  const room = useRoomStore((s) => s.room);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const shareOpen = useUIStore((s) => s.shareOpen);
  const setShareOpen = useUIStore((s) => s.setShareOpen);

  if (!room) return null;

  const shareUrl = `${window.location.origin}/z/${room.room_code}`;
  const usedPercent =
    room.storage_limit > 0 ? Math.min(100, (room.used_storage / room.storage_limit) * 100) : 0;

  return (
    <>
      {/* Share Modal */}
      <Modal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={`Bagikan Room ${room.room_code}`}
        description="Siapa pun dengan link ini dapat langsung bergabung ke workspace."
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--input-bg)] px-3 py-2.5 font-mono text-[12.5px] break-all text-[var(--color-text-primary)]">
            {shareUrl}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShareOpen(false)}>
              Tutup
            </Button>
            <Button
              variant="primary"
              leftIcon={<Copy size={14} strokeWidth={1.9} />}
              onClick={() => {
                onCopyShareLink();
                setShareOpen(false);
              }}
            >
              Salin Link
            </Button>
          </div>
        </div>
      </Modal>

      {/* Room Settings & Info Modal */}
      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Pengaturan & Detail Room"
        description={`Room sementara ${room.room_code}`}
        size="sm"
      >
        <div className="space-y-3.5 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">Kode Room</span>
            <span className="font-mono font-semibold text-[var(--color-text-primary)]">
              {room.room_code}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">Keamanan</span>
            {room.has_password ? (
              <Badge tone="primary">
                <Lock size={11} strokeWidth={2} />
                Dilindungi Password
              </Badge>
            ) : (
              <Badge tone="accent">
                <ShieldCheck size={11} strokeWidth={2} />
                Akses Link Langsung
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">Batas Maks. per File</span>
            <span className="font-medium text-[var(--color-text-primary)]">
              {formatBytes(room.max_file_size)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">Kedaluwarsa Pada</span>
            <span className="font-medium text-[var(--color-text-primary)]">
              {new Date(room.expires_at).toLocaleString('id-ID')}
            </span>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                <HardDrive size={13} strokeWidth={1.9} />
                Kuota Penyimpanan
              </span>
              <span className="font-medium text-[var(--color-text-primary)]">
                {formatBytes(room.used_storage)} / {formatBytes(room.storage_limit)}
              </span>
            </div>
            <Progress value={usedPercent} />
          </div>

          <div className="pt-2 flex justify-end">
            <Button variant="primary" size="sm" onClick={() => setSettingsOpen(false)}>
              Selesai
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
