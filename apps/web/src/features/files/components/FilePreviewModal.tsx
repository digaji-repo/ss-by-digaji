import { useEffect, useState } from 'react';
import { Download, FileCode2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/States';
import { api } from '@/services/api';
import type { FileItem } from '@/types/file';
import { formatBytes } from '@/utils/format-size';
import { isEditableTextFile } from '@/utils/validators';

interface FilePreviewModalProps {
  file: FileItem | null;
  roomCode: string;
  onClose: () => void;
  onDownload: (file: FileItem) => void;
  onEditContent?: (file: FileItem) => void;
}

export function FilePreviewModal({
  file,
  roomCode,
  onClose,
  onDownload,
  onEditContent,
}: FilePreviewModalProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);

  const mime = file?.mime_type.toLowerCase() ?? '';
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');
  const isAudio = mime.startsWith('audio/');
  const isPdf = mime === 'application/pdf';
  const isText = file ? isEditableTextFile(file.original_name, file.mime_type) : false;

  const previewUrl = file ? api.getFilePreviewUrl(file.id, roomCode) : '';

  useEffect(() => {
    if (!file || !isText) {
      setTextContent(null);
      return;
    }
    let cancelled = false;
    setLoadingText(true);
    fetch(previewUrl, { credentials: 'include' })
      .then((res) => res.text())
      .then((txt) => {
        if (!cancelled) setTextContent(txt.slice(0, 200_000));
      })
      .catch(() => {
        if (!cancelled) setTextContent('Gagal memuat pratinjau teks.');
      })
      .finally(() => {
        if (!cancelled) setLoadingText(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, isText, previewUrl]);

  return (
    <Modal
      open={Boolean(file)}
      onClose={onClose}
      size="lg"
      title={file?.original_name ?? 'Pratinjau File'}
      description={file ? `${file.mime_type} • ${formatBytes(file.file_size)}` : undefined}
    >
      {file && (
        <div className="space-y-4">
          <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-muted)] overflow-hidden flex items-center justify-center min-h-[200px] max-h-[56vh]">
            {isImage && (
              <img
                src={previewUrl}
                alt={file.original_name}
                className="max-h-[54vh] max-w-full object-contain"
              />
            )}
            {isVideo && (
              <video src={previewUrl} controls className="max-h-[54vh] w-full bg-black" />
            )}
            {isAudio && (
              <div className="p-6 w-full max-w-md">
                <audio src={previewUrl} controls className="w-full" />
              </div>
            )}
            {isPdf && (
              <iframe
                src={previewUrl}
                title={file.original_name}
                className="w-full h-[54vh] border-0"
              />
            )}
            {isText && (
              <div className="w-full h-[52vh] overflow-auto p-4 text-left">
                {loadingText ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ) : (
                  <pre className="text-[12.5px] font-mono whitespace-pre-wrap break-words text-[var(--color-text-primary)]">
                    {textContent}
                  </pre>
                )}
              </div>
            )}
            {!isImage && !isVideo && !isAudio && !isPdf && !isText && (
              <div className="flex flex-col items-center gap-2 py-8 text-[var(--color-text-secondary)]">
                <FileText size={28} strokeWidth={1.8} />
                <p className="text-[13px]">Pratinjau langsung tidak tersedia untuk tipe file ini.</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Tutup
            </Button>
            {isText && onEditContent && (
              <Button
                variant="secondary"
                leftIcon={<FileCode2 size={15} strokeWidth={1.9} />}
                onClick={() => {
                  const target = file;
                  onClose();
                  onEditContent(target);
                }}
              >
                Edit di Monaco
              </Button>
            )}
            <Button
              variant="primary"
              leftIcon={<Download size={15} strokeWidth={1.9} />}
              onClick={() => onDownload(file)}
            >
              Unduh File
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
