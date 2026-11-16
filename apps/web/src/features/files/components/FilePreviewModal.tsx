import { useEffect, useState } from 'react';
import { Download, FileCode2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/States';
import { api } from '@/services/api';
import { useFileStore } from '@/stores/file.store';
import type { FileItem } from '@/types/file';
import { formatBytes } from '@/utils/format-size';
import { isEditableTextFile, isWordDocumentFile } from '@/utils/validators';

interface FilePreviewModalProps {
  file: FileItem | null;
  roomCode: string;
  onClose: () => void;
  onDownload: (file: FileItem) => void;
  onEditContent?: (file: FileItem) => void;
  onEditWord?: (file: FileItem) => void;
}

const SAFE_PREVIEW_TAGS = new Set([
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'P',
  'BR',
  'HR',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'S',
  'DEL',
  'STRIKE',
  'CODE',
  'PRE',
  'BLOCKQUOTE',
  'UL',
  'OL',
  'LI',
  'A',
  'IMG',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'TH',
  'TD',
  'MARK',
  'SPAN',
  'SUP',
  'SUB',
]);

function sanitizeRenderedDocxHtml(rawHtml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');
  const walk = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      const tag = child.tagName.toUpperCase();
      if (!SAFE_PREVIEW_TAGS.has(tag)) {
        child.remove();
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
          child.removeAttribute(attr.name);
          continue;
        }
        if (tag === 'A' && name === 'href') {
          if (!/^(https?:|mailto:|#)/i.test(attr.value.trim())) {
            child.removeAttribute('href');
          } else {
            child.setAttribute('target', '_blank');
            child.setAttribute('rel', 'noopener noreferrer');
          }
          continue;
        }
        if (tag === 'IMG' && (name === 'src' || name === 'alt' || name === 'width' || name === 'height')) {
          if (name === 'src' && !/^data:image\/(png|jpeg|jpg|gif|bmp|webp);base64,/i.test(attr.value.trim())) {
            child.removeAttribute('src');
          }
          continue;
        }
        if ((tag === 'TD' || tag === 'TH') && (name === 'colspan' || name === 'rowspan')) {
          continue;
        }
        if (name !== 'style') {
          child.removeAttribute(attr.name);
        }
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export function FilePreviewModal({
  file,
  roomCode,
  onClose,
  onDownload,
  onEditContent,
  onEditWord,
}: FilePreviewModalProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [wordHtml, setWordHtml] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  const fileRevision = useFileStore((s) => (file ? s.fileRevisions[file.id] ?? 0 : 0));

  const mime = file?.mime_type.toLowerCase() ?? '';
  const isImage = mime.startsWith('image/') && mime !== 'image/svg+xml';
  const isVideo = mime.startsWith('video/');
  const isAudio = mime.startsWith('audio/');
  const isPdf = mime === 'application/pdf';
  const isWord = file ? isWordDocumentFile(file.original_name, file.mime_type) : false;
  const isText = file ? isEditableTextFile(file.original_name, file.mime_type) : false;

  const maxParserBytes = isWord ? 15 * 1024 * 1024 : 25 * 1024 * 1024;
  const tooLargeForParser = Boolean(file && file.file_size > maxParserBytes);

  const basePreviewUrl = file ? api.getFilePreviewUrl(file.id, roomCode) : '';
  const previewUrl =
    basePreviewUrl && fileRevision > 0
      ? `${basePreviewUrl}${basePreviewUrl.includes('?') ? '&' : '?'}rev=${fileRevision}`
      : basePreviewUrl;

  useEffect(() => {
    if (!file || tooLargeForParser || (!isText && !isWord)) {
      setTextContent(null);
      setWordHtml(null);
      return;
    }

    let cancelled = false;
    setLoadingContent(true);

    if (isWord) {
      setTextContent(null);
      api
        .fetchFileBinary(file.id, roomCode)
        .then(async (buffer) => {
          const { parseDocxArrayBufferToHtml } = await import(
            '@/features/files/services/wordDocx'
          );
          const { html } = await parseDocxArrayBufferToHtml(buffer);
          if (!cancelled) {
            setWordHtml(sanitizeRenderedDocxHtml(html));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setWordHtml('<p>Gagal memuat pratinjau dokumen Word (.docx).</p>');
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingContent(false);
        });
    } else {
      setWordHtml(null);
      fetch(previewUrl, { credentials: 'include', cache: 'no-store' })
        .then((res) => res.text())
        .then((txt) => {
          if (!cancelled) setTextContent(txt.slice(0, 200_000));
        })
        .catch(() => {
          if (!cancelled) setTextContent('Gagal memuat pratinjau teks.');
        })
        .finally(() => {
          if (!cancelled) setLoadingContent(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [file, isText, isWord, previewUrl, roomCode, fileRevision]);

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
            {tooLargeForParser ? (
              <div className="flex flex-col items-center gap-2 py-8 px-4 text-center text-[var(--color-text-secondary)]">
                <FileText size={28} strokeWidth={1.8} />
                <p className="text-[13px]">
                  Ukuran file melebihi batas aman pratinjau browser ({formatBytes(maxParserBytes)}).
                  Silakan unduh file untuk membukanya.
                </p>
              </div>
            ) : (
              <>
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
            {isWord && (
              <div className="w-full h-[54vh] overflow-auto p-3 sm:p-5 text-left">
                {loadingContent ? (
                  <div className="space-y-2.5 bg-white dark:bg-[#12151C] rounded-[10px] p-5 border border-[var(--color-border)]">
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-28 w-full" />
                  </div>
                ) : (
                  <div
                    className="word-prose bg-white dark:bg-[#12151C] text-[#141C2E] dark:text-[#F1F5F9] rounded-[10px] border border-[var(--color-border)] px-5 py-6 sm:px-8 sm:py-7 shadow-sm"
                    dangerouslySetInnerHTML={{ __html: wordHtml ?? '<p></p>' }}
                  />
                )}
              </div>
            )}
            {isText && (
              <div className="w-full h-[52vh] overflow-auto p-4 text-left">
                {loadingContent ? (
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
                {!isImage && !isVideo && !isAudio && !isPdf && !isText && !isWord && (
                  <div className="flex flex-col items-center gap-2 py-8 text-[var(--color-text-secondary)]">
                    <FileText size={28} strokeWidth={1.8} />
                    <p className="text-[13px]">Pratinjau langsung tidak tersedia untuk tipe file ini.</p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Tutup
            </Button>
            {isWord && onEditWord && (
              <Button
                variant="secondary"
                leftIcon={<FileText size={15} strokeWidth={1.9} />}
                onClick={() => {
                  const target = file;
                  onClose();
                  onEditWord(target);
                }}
              >
                Edit di Word Editor
              </Button>
            )}
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
