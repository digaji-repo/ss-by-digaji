import { useEffect, useState } from 'react';
import {
  Check,
  Clock,
  CloudUpload,
  Copy,
  Link as LinkIcon,
  LogOut,
  Settings,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Popover } from '@/components/ui/DropdownAndPopover';
import { IconButton } from '@/components/ui/IconButton';
import { Avatar, Badge } from '@/components/ui/Primitives';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useRoomStore } from '@/stores/room.store';
import { useUIStore } from '@/stores/ui.store';
import { formatCountdown } from '@/utils/format-date';

interface AppHeaderProps {
  onLeaveRoom: () => void;
  onCopyShareLink: () => void;
}

export function AppHeader({ onLeaveRoom, onCopyShareLink }: AppHeaderProps) {
  const room = useRoomStore((s) => s.room);
  const serverOffsetMs = useRoomStore((s) => s.serverOffsetMs);
  const peers = useRoomStore((s) => s.peers);
  const selfPeerId = useRoomStore((s) => s.selfPeerId);
  const wsState = useRoomStore((s) => s.wsState);
  const setExpired = useRoomStore((s) => s.setExpired);

  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const setShareOpen = useUIStore((s) => s.setShareOpen);
  const isOffline = useUIStore((s) => s.isOffline);

  const [copiedCode, setCopiedCode] = useState(false);
  const [countdown, setCountdown] = useState(() =>
    room ? formatCountdown(room.expires_at, serverOffsetMs) : null
  );

  useEffect(() => {
    if (!room) return;
    const tick = () => {
      const next = formatCountdown(room.expires_at, serverOffsetMs);
      setCountdown(next);
      if (next.isExpired) {
        setExpired(true);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [room, serverOffsetMs, setExpired]);

  if (!room) return null;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.room_code);
      setCopiedCode(true);
      useUIStore.getState().pushToast('success', `Kode room ${room.room_code} disalin`);
      window.setTimeout(() => setCopiedCode(false), 1600);
    } catch {
      useUIStore.getState().pushToast('error', 'Gagal menyalin kode room');
    }
  };

  const displayPeers =
    peers.length > 0
      ? peers
      : [{ peer_id: 'self', label: 'Anda', joined_at: room.created_at }];

  return (
    <div className="w-full max-w-[1440px] mx-auto px-3 sm:px-5 pt-3 sticky top-0 z-30">
      <header className="glass-medium rounded-[18px] px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Brand + Room Code + Live + Expiry */}
        <div className="flex items-center flex-wrap gap-2.5 sm:gap-3.5 min-w-0">
          {/* Brand */}
          <div className="flex items-center gap-2.5 pr-1">
            <span className="w-9 h-9 rounded-[11px] bg-[var(--color-primary)]/12 text-[var(--color-primary)] border border-[var(--color-primary)]/20 flex items-center justify-center shrink-0">
              <CloudUpload size={20} strokeWidth={2} />
            </span>
            <div className="leading-tight" aria-label="DropRoom">
              <div className="text-[16px] font-bold tracking-tight">
                <span className="text-[var(--color-text-primary)]">Drop</span>
                <span className="text-[var(--color-primary)]">Room</span>
              </div>
              <p className="hidden sm:block text-[11px] text-[var(--color-text-secondary)]">
                Temporary File &amp; Text Room
              </p>
            </div>
          </div>

          <span className="hidden md:block h-7 w-px bg-[var(--color-border)]" />

          {/* Room Code + Copy */}
          <div className="flex items-center gap-2">
            <div className="leading-tight">
              <span className="block text-[10.5px] font-medium text-[var(--color-text-secondary)]">
                Room
              </span>
              <span className="font-mono text-[16px] font-bold tracking-wider text-[var(--color-text-primary)]">
                {room.room_code}
              </span>
            </div>
            <IconButton
              label="Salin Kode Room"
              onClick={handleCopyCode}
              className="glass-light border border-[var(--color-border)]"
            >
              {copiedCode ? (
                <Check size={15} strokeWidth={2.2} className="text-[var(--color-accent)]" />
              ) : (
                <Copy size={15} strokeWidth={1.9} />
              )}
            </IconButton>
          </div>

          {/* Live Status Pill */}
          {isOffline ? (
            <Badge tone="danger" className="py-1 px-2.5 text-[12px]">
              <WifiOff size={12} strokeWidth={2} />
              <span>Offline</span>
            </Badge>
          ) : wsState === 'connected' ? (
            <Badge tone="accent" className="py-1 px-2.5 text-[12px]">
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-live-dot" />
              <span>Live</span>
            </Badge>
          ) : (
            <Badge tone="warning" className="py-1 px-2.5 text-[12px]">
              <Wifi size={12} strokeWidth={2} />
              <span className="hidden sm:inline">Menghubungkan...</span>
            </Badge>
          )}

          <span className="hidden lg:block h-7 w-px bg-[var(--color-border)]" />

          {/* Expiry Countdown */}
          {countdown && (
            <div className="hidden sm:flex items-center gap-2 leading-tight">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center ${
                  countdown.isWarning
                    ? 'bg-[var(--color-warning)]/14 text-[var(--color-warning)]'
                    : 'bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)]'
                }`}
              >
                <Clock size={14} strokeWidth={2} />
              </span>
              <div>
                <span className="block text-[10.5px] text-[var(--color-text-secondary)]">
                  Berlaku hingga
                </span>
                <span className="text-[12.5px] font-semibold text-[var(--color-text-primary)]">
                  {countdown.readableText}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Presence Pill + Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
          {/* Mobile countdown compact pill */}
          {countdown && (
            <Badge tone={countdown.isWarning ? 'warning' : 'neutral'} className="sm:hidden font-mono">
              <Clock size={11} strokeWidth={2} />
              <span>{countdown.text}</span>
            </Badge>
          )}

          {/* Online Users Popover */}
          <Popover
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3 rounded-full glass-light border border-[var(--color-border)] text-[12.5px] font-semibold text-[var(--color-text-primary)] hover:bg-[var(--card-row-hover-bg)] transition-colors cursor-pointer"
              >
                <Users size={15} strokeWidth={2} className="text-[var(--color-primary)]" />
                <span>{displayPeers.length} Online</span>
              </button>
            }
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                  Pengguna Aktif
                </span>
                <Badge tone="accent">{displayPeers.length} Online</Badge>
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {displayPeers.map((peer) => (
                  <div
                    key={peer.peer_id}
                    className="flex items-center justify-between py-1 px-1.5 rounded-[8px] hover:bg-[var(--hover-bg)]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar label={peer.label} size="sm" />
                      <span className="text-[12.5px] font-medium truncate text-[var(--color-text-primary)]">
                        {peer.label}
                        {peer.peer_id === selfPeerId ? ' (Anda)' : ''}
                      </span>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </Popover>

          <IconButton
            label="Salin Link Share"
            onClick={() => {
              onCopyShareLink();
              setShareOpen(true);
            }}
            className="glass-light border border-[var(--color-border)]"
          >
            <LinkIcon size={16} strokeWidth={1.9} />
          </IconButton>

          <ThemeToggle />

          <IconButton
            label="Pengaturan Room"
            onClick={() => setSettingsOpen(true)}
            className="glass-light border border-[var(--color-border)]"
          >
            <Settings size={16} strokeWidth={1.9} />
          </IconButton>

          <IconButton
            label="Keluar Room"
            variant="danger"
            onClick={onLeaveRoom}
            className="glass-light border border-[var(--color-border)]"
          >
            <LogOut size={16} strokeWidth={1.9} />
          </IconButton>
        </div>
      </header>
    </div>
  );
}
