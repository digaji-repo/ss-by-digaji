import { useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Check,
  Clock,
  Cloud,
  Code,
  Copy,
  Info,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/CardAndTabs';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Primitives';
import { usePasteStore } from '@/stores/paste.store';
import { useRoomStore } from '@/stores/room.store';
import { useUIStore } from '@/stores/ui.store';
import { formatExpiryDateTime } from '@/utils/format-date';

export function RoomInfoPanel() {
  const room = useRoomStore((s) => s.room);
  const peers = useRoomStore((s) => s.peers);
  const pastes = usePasteStore((s) => s.pastes);
  const setActivePasteId = usePasteStore((s) => s.setActivePasteId);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const pushToast = useUIStore((s) => s.pushToast);

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  if (!room) return null;

  const latestPaste = pastes[0] ?? null;
  const snippetLines = (latestPaste?.content || '# Belum ada paste teks\n# Klik Buka Paste Editor untuk mulai berbagi kode.')
    .split('\n')
    .slice(0, 6);

  const durationHours = Math.max(
    1,
    Math.round(
      (new Date(room.expires_at).getTime() - new Date(room.created_at).getTime()) / 3_600_000
    )
  );
  const durationMinutes = Math.max(
    1,
    Math.round(
      (new Date(room.expires_at).getTime() - new Date(room.created_at).getTime()) / 60_000
    )
  );
  const durationLabel =
    durationMinutes < 60
      ? `${durationMinutes} Menit`
      : durationHours >= 24 && durationHours % 24 === 0
        ? `${durationHours / 24} Hari`
        : `${durationHours} Jam`;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.room_code);
      setCopiedCode(true);
      pushToast('success', `Kode room ${room.room_code} disalin`);
      window.setTimeout(() => setCopiedCode(false), 1500);
    } catch {
      pushToast('error', 'Gagal menyalin kode room');
    }
  };

  const handleCopySnippet = async () => {
    if (!latestPaste) return;
    try {
      await navigator.clipboard.writeText(latestPaste.content);
      setCopiedSnippet(true);
      pushToast('success', 'Isi paste disalin ke clipboard');
      window.setTimeout(() => setCopiedSnippet(false), 1500);
    } catch {
      pushToast('error', 'Gagal menyalin paste');
    }
  };

  return (
    <div className="space-y-4">
      {/* Info Room Card (contoh.png top-right card) */}
      <Card intensity="medium" padding="standard" className="rounded-[18px] space-y-3.5">
        <div className="flex items-center gap-2">
          <Info size={17} strokeWidth={2} className="text-[var(--color-primary)]" />
          <h3 className="text-[14.5px] font-semibold text-[var(--color-text-primary)]">
            Info Room
          </h3>
        </div>

        <div className="space-y-2.5 text-[12.5px]">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[var(--color-text-secondary)]">
              <Cloud size={14} strokeWidth={1.9} />
              Kode Room
            </span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-[13.5px] text-[var(--color-text-primary)]">
                {room.room_code}
              </span>
              <IconButton label="Salin Kode Room" size="sm" onClick={handleCopyCode}>
                {copiedCode ? (
                  <Check size={13} strokeWidth={2.2} className="text-[var(--color-accent)]" />
                ) : (
                  <Copy size={13} strokeWidth={1.9} />
                )}
              </IconButton>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[var(--color-text-secondary)]">
              <Calendar size={14} strokeWidth={1.9} />
              Berakhir pada
            </span>
            <span className="font-medium text-[var(--color-text-primary)]">
              {formatExpiryDateTime(room.expires_at)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[var(--color-text-secondary)]">
              <Clock size={14} strokeWidth={1.9} />
              Durasi
            </span>
            <span className="font-semibold text-[var(--color-text-primary)]">{durationLabel}</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[var(--color-text-secondary)]">
              <Users size={14} strokeWidth={1.9} />
              Pengguna
            </span>
            <Badge tone="accent">
              <Users size={11} strokeWidth={2} />
              {peers.length || 1} Online
            </Badge>
          </div>
        </div>
      </Card>

      {/* Quick Paste Card (contoh.png bottom-right card) */}
      <Card intensity="medium" padding="standard" className="rounded-[18px] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Code size={17} strokeWidth={2} className="text-[var(--color-primary)] shrink-0" />
            <h3 className="text-[14.5px] font-semibold text-[var(--color-text-primary)] truncate">
              Quick Paste
            </h3>
          </div>
          {latestPaste && (
            <span className="text-[11px] font-mono text-[var(--color-text-secondary)] truncate max-w-[100px]">
              {latestPaste.syntax_language}
            </span>
          )}
        </div>

        <div className="relative rounded-[12px] border border-[var(--color-border)] bg-[var(--card-row-bg)] p-2.5 font-mono text-[11.5px] leading-relaxed overflow-hidden">
          {latestPaste && (
            <div className="absolute top-1.5 right-1.5">
              <IconButton label="Salin Isi Paste" size="sm" onClick={handleCopySnippet}>
                {copiedSnippet ? (
                  <Check size={13} strokeWidth={2.2} className="text-[var(--color-accent)]" />
                ) : (
                  <Copy size={13} strokeWidth={1.9} />
                )}
              </IconButton>
            </div>
          )}

          <div className="space-y-0.5 pr-6 overflow-x-auto">
            {snippetLines.map((line, idx) => (
              <div key={idx} className="flex gap-2.5 whitespace-pre">
                <span className="select-none text-[var(--color-text-secondary)]/60 w-3 text-right shrink-0">
                  {idx + 1}
                </span>
                <span className="text-[var(--color-text-primary)] truncate">{line || ' '}</span>
              </div>
            ))}
          </div>
        </div>

        <Button
          variant="secondary"
          className="w-full text-[var(--color-primary)] font-semibold"
          rightIcon={<ArrowRight size={15} strokeWidth={2} />}
          onClick={() => {
            if (latestPaste) setActivePasteId(latestPaste.id);
            setActiveTab('pastes');
          }}
        >
          Buka Paste Editor
        </Button>
      </Card>
    </div>
  );
}
