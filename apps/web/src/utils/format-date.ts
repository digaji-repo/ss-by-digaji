export function formatCountdown(expiresAtIso: string, serverOffsetMs = 0): {
  text: string;
  readableText: string;
  remainingMs: number;
  isWarning: boolean;
  isExpired: boolean;
} {
  const target = new Date(expiresAtIso).getTime();
  const now = Date.now() + serverOffsetMs;
  const remainingMs = Math.max(0, target - now);

  if (remainingMs <= 0) {
    return {
      text: '00:00:00',
      readableText: 'Kedaluwarsa',
      remainingMs: 0,
      isWarning: true,
      isExpired: true,
    };
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  const text =
    days > 0
      ? `${days}h ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  const readableParts: string[] = [];
  if (days > 0) readableParts.push(`${days} Hari`);
  if (hours > 0 || days > 0) readableParts.push(`${hours} Jam`);
  readableParts.push(`${minutes} Menit`);
  if (days === 0 && hours === 0) readableParts.push(`${seconds} Detik`);

  return {
    text,
    readableText: readableParts.join(' '),
    remainingMs,
    isWarning: remainingMs <= 5 * 60 * 1000,
    isExpired: false,
  };
}

export function formatExpiryDateTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(isoDate: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
  if (diffSec < 10) return 'Baru saja';
  if (diffSec < 60) return `${diffSec} detik lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} jam lalu`;
  return new Date(isoDate).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
