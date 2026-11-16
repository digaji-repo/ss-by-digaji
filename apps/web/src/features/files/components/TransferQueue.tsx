import { createPortal } from 'react-dom';
import { Check, CloudUpload, Download, Pause, Play, RotateCw, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { IconButton } from '@/components/ui/IconButton';
import { useFileStore } from '@/stores/file.store';
import { formatBytes } from '@/utils/format-size';

interface TransferQueueProps {
  onPauseUpload: (localId: string) => void;
  onResumeUpload: (localId: string) => void;
  onRetryUpload: (localId: string) => void;
  onCancelTransfer: (localId: string) => void;
}

export function TransferQueue({
  onPauseUpload,
  onResumeUpload,
  onRetryUpload,
  onCancelTransfer,
}: TransferQueueProps) {
  const transfers = useFileStore((s) => s.transfers);
  const clearCompleted = useFileStore((s) => s.clearCompletedTransfers);

  const hasCompleted = transfers.some((t) => t.status === 'completed');

  const queueContent = (
    <div className="pointer-events-none fixed bottom-20 left-3 right-3 sm:left-5 sm:right-auto sm:w-[350px] lg:bottom-5 z-[55] space-y-2">
      <AnimatePresence initial={false}>
        {transfers.slice(0, 3).map((item) => {
          const isChunked = item.file && item.file.size > 10 * 1024 * 1024;
          const isDone = item.status === 'completed';
          const isFailed = item.status === 'failed';
          const isPaused = item.status === 'paused';

          return (
            <motion.div
              key={item.localId}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.22 }}
              className="pointer-events-auto glass-strong rounded-[16px] px-3.5 py-3 space-y-2"
            >
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-[var(--color-primary)]/12 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                  {item.kind === 'download' ? (
                    <Download size={17} strokeWidth={2} />
                  ) : (
                    <CloudUpload size={17} strokeWidth={2} />
                  )}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold truncate text-[var(--color-text-primary)]">
                    {isDone
                      ? item.kind === 'download'
                        ? `Selesai: ${item.fileName}`
                        : `Terupload: ${item.fileName}`
                      : item.kind === 'download'
                        ? `Mengunduh ${item.fileName}`
                        : `Mengunggah ${item.fileName}`}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">
                    {formatBytes(item.transferredBytes)} / {formatBytes(item.totalSize)}
                    {isFailed ? ` • ${item.error ?? 'Gagal'}` : isPaused ? ' • Dijeda' : ''}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isDone && (
                    <span className="w-6 h-6 rounded-full bg-[#30D5A0]/20 text-[#0F8A64] dark:text-[var(--color-accent)] flex items-center justify-center">
                      <Check size={14} strokeWidth={2.4} />
                    </span>
                  )}
                  {item.kind === 'upload' && item.status === 'uploading' && isChunked && (
                    <IconButton label="Jeda upload" size="sm" onClick={() => onPauseUpload(item.localId)}>
                      <Pause size={14} strokeWidth={1.9} />
                    </IconButton>
                  )}
                  {item.kind === 'upload' && isPaused && (
                    <IconButton
                      label="Lanjutkan upload"
                      size="sm"
                      onClick={() => onResumeUpload(item.localId)}
                    >
                      <Play size={14} strokeWidth={1.9} />
                    </IconButton>
                  )}
                  {item.kind === 'upload' && isFailed && (
                    <IconButton label="Coba lagi" size="sm" onClick={() => onRetryUpload(item.localId)}>
                      <RotateCw size={14} strokeWidth={1.9} />
                    </IconButton>
                  )}
                  <IconButton label="Tutup" size="sm" onClick={() => onCancelTransfer(item.localId)}>
                    <X size={14} strokeWidth={1.9} />
                  </IconButton>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border)]/70 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      isFailed
                        ? 'bg-[var(--color-danger)]'
                        : isPaused
                          ? 'bg-[var(--color-warning)]'
                          : 'bg-gradient-to-r from-[#2DD4BF] to-[#30D5A0]'
                    }`}
                    style={{ width: `${Math.max(4, Math.min(100, item.progress))}%` }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-[#0F8A64] dark:text-[var(--color-accent)] w-9 text-right">
                  {Math.round(item.progress)}%
                </span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {transfers.length > 1 && hasCompleted && (
        <div className="flex justify-end px-1">
          <button
            type="button"
            onClick={clearCompleted}
            className="pointer-events-auto text-[11px] font-medium text-[var(--color-primary)] hover:underline cursor-pointer"
          >
            Bersihkan selesai ({transfers.filter((t) => t.status === 'completed').length})
          </button>
        </div>
      )}
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(queueContent, document.body);
  }

  return queueContent;
}
