import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { CloudUpload } from 'lucide-react';
import { formatBytes } from '@/utils/format-size';

interface FileUploadZoneProps {
  maxFileSize: number;
  remainingStorage: number;
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
  externalInputRef?: React.RefObject<HTMLInputElement | null>;
}

export function FileUploadZone({
  maxFileSize,
  remainingStorage,
  disabled = false,
  onFilesSelected,
  externalInputRef,
}: FileUploadZoneProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalRef;
  const [dragging, setDragging] = useState(false);

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0 || disabled) return;
    onFilesSelected(Array.from(list));
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    e.target.value = '';
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-[14px] border-[1.5px] border-dashed px-4 sm:px-5 py-4 sm:py-5 transition-all duration-150 flex flex-col md:flex-row items-center justify-between gap-4 cursor-pointer select-none ${
        dragging
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/14 scale-[1.005]'
          : 'border-[#96C5F7] bg-[#ECF4FF]/60 hover:border-[var(--color-primary)] hover:bg-[#E4F0FF]/75 dark:border-white/15 dark:bg-white/[0.025] dark:hover:border-[var(--color-primary)]/60 dark:hover:bg-[var(--color-primary)]/[0.08]'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onFileInput}
        disabled={disabled}
      />

      <div className="flex items-center gap-3.5 text-center sm:text-left flex-col sm:flex-row">
        <span className="w-11 h-11 rounded-[12px] bg-[var(--color-primary)]/12 text-[var(--color-primary)] dark:bg-[var(--color-primary)]/16 flex items-center justify-center shrink-0">
          <CloudUpload size={24} strokeWidth={1.85} />
        </span>
        <div>
          <p className="text-[14.5px] font-semibold text-[var(--color-text-primary)]">
            Tarik &amp; lepas file di sini
          </p>
          <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-0.5">
            atau klik <span className="font-medium text-[var(--color-primary)]">Upload File</span> •
            Sisa ruang {formatBytes(remainingStorage)}
          </p>
        </div>
      </div>

      <div className="rounded-[11px] border border-[var(--color-border)] bg-[var(--card-row-bg)] px-3.5 py-2.5 text-center md:text-left max-w-[235px] shrink-0">
        <p className="text-[12.5px] font-semibold text-[var(--color-text-primary)]">
          Maks. {formatBytes(maxFileSize)} per file
        </p>
        <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5 leading-snug">
          Semua anggota room dapat melihat dan mengunduh.
        </p>
      </div>
    </div>
  );
}
