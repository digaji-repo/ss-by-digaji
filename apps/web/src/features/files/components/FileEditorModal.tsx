import { Suspense, lazy, useEffect, useState } from 'react';
import { Check, Copy, Eye, FileCode2, FileText, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/FormControls';
import { IconButton } from '@/components/ui/IconButton';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/States';
import { MarkdownPreview } from '@/features/paste/components/MarkdownPreview';
import { ApiError, api } from '@/services/api';
import { useFileStore } from '@/stores/file.store';
import { useRoomStore } from '@/stores/room.store';
import { useUIStore } from '@/stores/ui.store';
import type { FileItem } from '@/types/file';
import { formatBytes } from '@/utils/format-size';
import { PASTE_LANGUAGES, getMonacoLanguageForFile } from '@/utils/validators';

const LazyMonacoEditor = lazy(() => import('@/features/paste/components/MonacoCodeEditor'));

interface FileEditorModalProps {
  file: FileItem | null;
  roomCode: string;
  onClose: () => void;
}

type EditorMode = 'editor' | 'markdown' | 'raw';

export function FileEditorModal({ file, roomCode, onClose }: FileEditorModalProps) {
  const upsertFile = useFileStore((s) => s.upsertFile);
  const pushToast = useUIStore((s) => s.pushToast);

  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('plaintext');
  const [mode, setMode] = useState<EditorMode>('editor');
  const [mobileSimple, setMobileSimple] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const detectedLang = getMonacoLanguageForFile(file.original_name, file.mime_type);
    setLanguage(detectedLang);
    setMode('editor');
    setDirty(false);
    setLoadError(null);
    setLoading(true);

    api
      .fetchFileTextContent(file.id, roomCode)
      .then((txt) => {
        if (!cancelled) {
          setContent(txt);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Gagal memuat isi file.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file, roomCode]);

  const handleSave = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const oldSize = file.file_size;
      const updated = await api.updateFileContent(file.id, roomCode, content);
      upsertFile(updated);
      useRoomStore.getState().adjustUsedStorage(updated.file_size - oldSize);
      setDirty(false);
      pushToast('success', `${updated.original_name} berhasil disimpan`);
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Gagal menyimpan perubahan file.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      pushToast('success', 'Isi file disalin ke clipboard');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      pushToast('error', 'Gagal menyalin isi file');
    }
  };

  return (
    <Modal
      open={Boolean(file)}
      onClose={saving ? () => {} : onClose}
      closeOnBackdrop={!saving && !dirty}
      size="xl"
      title={file ? `Editor: ${file.original_name}` : 'Editor File'}
      description={
        file
          ? `${file.mime_type} • ${formatBytes(file.file_size)} • Edit langsung .txt, .md, atau kode`
          : undefined
      }
    >
      {file && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="glass-light rounded-[12px] p-2.5 flex flex-wrap items-center gap-2">
            <div className="w-40">
              <Select
                aria-label="Bahasa Syntax"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                options={PASTE_LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
              />
            </div>

            <div className="flex items-center gap-1">
              <IconButton
                label="Editor Kode"
                active={mode === 'editor'}
                onClick={() => setMode('editor')}
              >
                <FileCode2 size={16} strokeWidth={1.9} />
              </IconButton>
              <IconButton
                label="Teks Mentah"
                active={mode === 'raw'}
                onClick={() => setMode('raw')}
              >
                <FileText size={16} strokeWidth={1.9} />
              </IconButton>
              <IconButton
                label="Pratinjau Markdown"
                active={mode === 'markdown'}
                onClick={() => setMode('markdown')}
              >
                <Eye size={16} strokeWidth={1.9} />
              </IconButton>
              <IconButton label="Salin Semua" onClick={handleCopyAll}>
                {copied ? <Check size={16} strokeWidth={2.2} /> : <Copy size={16} strokeWidth={1.9} />}
              </IconButton>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {dirty ? (
                <Badge tone="warning">Belum disimpan</Badge>
              ) : (
                <Badge tone="accent">Tersimpan</Badge>
              )}
              <Button
                variant="primary"
                size="sm"
                loading={saving}
                disabled={loading || Boolean(loadError)}
                leftIcon={<Save size={14} strokeWidth={1.9} />}
                onClick={handleSave}
              >
                Simpan Perubahan
              </Button>
            </div>
          </div>

          <div className="flex md:hidden justify-end">
            <button
              type="button"
              onClick={() => setMobileSimple((v) => !v)}
              className="text-[11.5px] font-medium text-[var(--color-primary)] cursor-pointer"
            >
              {mobileSimple ? 'Gunakan Monaco Editor' : 'Gunakan Editor Ringan Mobile'}
            </button>
          </div>

          {/* Editor Surface */}
          <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--card-row-bg)] overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-72 w-full" />
              </div>
            ) : loadError ? (
              <div className="p-6 text-center text-[13px] text-[var(--color-danger)]">
                {loadError}
              </div>
            ) : mode === 'raw' ? (
              <pre className="p-4 min-h-[340px] max-h-[60vh] overflow-auto text-[12.5px] font-mono whitespace-pre-wrap break-words text-[var(--color-text-primary)]">
                {content}
              </pre>
            ) : mode === 'markdown' ? (
              <MarkdownPreview content={content} />
            ) : mobileSimple ? (
              <div className="p-2.5">
                <Textarea
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setDirty(true);
                  }}
                  rows={14}
                  className="font-mono text-[12.5px]"
                />
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-72 w-full" />
                  </div>
                }
              >
                <LazyMonacoEditor
                  value={content}
                  language={language}
                  onChange={(next) => {
                    setContent(next);
                    setDirty(true);
                  }}
                />
              </Suspense>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={saving} onClick={onClose}>
              Tutup
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
