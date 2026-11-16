import { Suspense, lazy, useEffect, useState } from 'react';
import {
  Check,
  Code,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileText,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/FormControls';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Primitives';
import { EmptyState, Skeleton } from '@/components/ui/States';
import { ApiError, api } from '@/services/api';
import { usePasteStore } from '@/stores/paste.store';
import { useRoomStore } from '@/stores/room.store';
import { useUIStore } from '@/stores/ui.store';
import { formatRelativeTime } from '@/utils/format-date';
import { PASTE_LANGUAGES, getExtensionForLanguage } from '@/utils/validators';
import { MarkdownPreview } from './components/MarkdownPreview';

const LazyMonacoEditor = lazy(() => import('./components/MonacoCodeEditor'));

type EditorViewMode = 'editor' | 'raw' | 'markdown';

export function PasteFeature() {
  const room = useRoomStore((s) => s.room);
  const pastes = usePasteStore((s) => s.pastes);
  const activePasteId = usePasteStore((s) => s.activePasteId);
  const recentlySyncedId = usePasteStore((s) => s.recentlySyncedId);
  const loading = usePasteStore((s) => s.loading);
  const setActivePasteId = usePasteStore((s) => s.setActivePasteId);
  const upsertPaste = usePasteStore((s) => s.upsertPaste);
  const removePaste = usePasteStore((s) => s.removePaste);
  const clearRecentlySynced = usePasteStore((s) => s.clearRecentlySynced);

  const pushToast = useUIStore((s) => s.pushToast);
  const openConfirm = useUIStore((s) => s.openConfirm);

  const activePaste = pastes.find((p) => p.id === activePasteId) ?? null;

  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('plaintext');
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState<EditorViewMode>('editor');
  const [useSimpleMobileEditor, setUseSimpleMobileEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync local draft when active paste switches or updates remotely while clean
  useEffect(() => {
    if (!activePaste) {
      setTitle('');
      setLanguage('plaintext');
      setContent('');
      setDirty(false);
      return;
    }
    if (!dirty || activePaste.id !== activePasteId) {
      setTitle(activePaste.title);
      setLanguage(activePaste.syntax_language);
      setContent(activePaste.content);
      setDirty(false);
    }
  }, [activePaste, activePasteId, dirty]);

  useEffect(() => {
    if (!recentlySyncedId) return;
    const t = window.setTimeout(() => clearRecentlySynced(), 1200);
    return () => window.clearTimeout(t);
  }, [recentlySyncedId, clearRecentlySynced]);

  if (!room) return null;

  const handleSelectPaste = (id: string) => {
    setDirty(false);
    setActivePasteId(id);
  };

  const handleCreateNew = async () => {
    setSaving(true);
    try {
      const created = await api.createPaste(room.room_code, {
        title: `Paste #${pastes.length + 1}`,
        content: '',
        syntax_language: 'plaintext',
      });
      upsertPaste(created, false);
      setActivePasteId(created.id);
      setDirty(false);
      setViewMode('editor');
      pushToast('success', 'Paste baru dibuat');
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Gagal membuat paste');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!activePaste) {
        const created = await api.createPaste(room.room_code, {
          title: title.trim() || 'Untitled Paste',
          content,
          syntax_language: language,
        });
        upsertPaste(created, false);
        setActivePasteId(created.id);
        setDirty(false);
        pushToast('success', 'Paste berhasil disimpan');
      } else {
        const updated = await api.updatePaste(activePaste.id, room.room_code, {
          title: title.trim() || 'Untitled Paste',
          content,
          syntax_language: language,
        });
        upsertPaste(updated, false);
        setDirty(false);
        pushToast('success', 'Paste berhasil disimpan');
      }
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Gagal menyimpan paste');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!activePaste) return;
    openConfirm({
      title: 'Hapus Paste?',
      description: `Paste "${activePaste.title}" akan dihapus dari room ini.`,
      confirmLabel: 'Hapus Paste',
      cancelLabel: 'Batal',
      variant: 'danger',
      icon: 'trash',
      onConfirm: async () => {
        await api.deletePaste(activePaste.id, room.room_code);
        removePaste(activePaste.id);
        setDirty(false);
        pushToast('success', 'Paste dihapus');
      },
    });
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      pushToast('success', 'Seluruh isi paste disalin');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      pushToast('error', 'Gagal menyalin teks');
    }
  };

  const handleDownloadPaste = () => {
    const ext = getExtensionForLanguage(language);
    const safeTitle = (title.trim() || 'paste').replace(/[^a-zA-Z0-9._-]/g, '_');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-[12px] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
            <Code size={21} strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-[19px] font-bold tracking-tight text-[var(--color-text-primary)] leading-tight">
              Paste &amp; Teks
            </h2>
            <p className="text-[12.5px] text-[var(--color-text-secondary)]">
              Editor kode realtime dengan syntax highlighting &amp; pratinjau Markdown.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          size="sm"
          loading={saving}
          leftIcon={<Plus size={15} strokeWidth={2} />}
          onClick={handleCreateNew}
        >
          Paste Baru
        </Button>
      </div>

      {pastes.length === 0 ? (
        <EmptyState
          icon={<Code size={22} strokeWidth={1.8} />}
          title="Belum Ada Paste"
          description="Buat paste baru untuk membagikan potongan kode, catatan, atau skrip secara realtime."
          action={
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus size={15} strokeWidth={2} />}
              onClick={handleCreateNew}
            >
              Buat Paste Pertama
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[210px_1fr] gap-3.5">
          {/* Paste List */}
          <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-y-auto lg:max-h-[520px] pb-1 lg:pb-0">
            {pastes.map((p) => {
              const selected = p.id === activePaste?.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPaste(p.id)}
                  className={`shrink-0 lg:shrink text-left px-3 py-2 rounded-[10px] border transition-all cursor-pointer min-w-[160px] lg:min-w-0 ${
                    selected
                      ? 'bg-[var(--color-primary)]/14 border-[var(--color-primary)]/40 text-[var(--color-text-primary)]'
                      : 'bg-[var(--card-row-bg)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--card-row-hover-bg)]'
                  } ${recentlySyncedId === p.id ? 'animate-paste-sync' : ''}`}
                >
                  <p className="text-[13px] font-semibold truncate">{p.title}</p>
                  <div className="flex items-center justify-between gap-2 mt-0.5 text-[11px] opacity-80">
                    <span className="font-mono">{p.syntax_language}</span>
                    <span>{formatRelativeTime(p.updated_at)}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Editor */}
          {activePaste && (
            <div className="space-y-3 min-w-0">
              {/* Editor Toolbar */}
              <div className="glass-light rounded-[12px] p-2.5 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[160px]">
                  <Input
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Judul paste..."
                    className="h-8 text-[13px]"
                  />
                </div>

                <Select
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    setDirty(true);
                  }}
                  options={PASTE_LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
                />

                <div className="flex items-center gap-1">
                  <IconButton
                    label="Mode Editor"
                    active={viewMode === 'editor'}
                    onClick={() => setViewMode('editor')}
                  >
                    <FileCode2 size={16} strokeWidth={1.9} />
                  </IconButton>
                  <IconButton
                    label="Tampilan Teks Mentah"
                    active={viewMode === 'raw'}
                    onClick={() => setViewMode('raw')}
                  >
                    <FileText size={16} strokeWidth={1.9} />
                  </IconButton>
                  <IconButton
                    label="Pratinjau Markdown"
                    active={viewMode === 'markdown'}
                    onClick={() => setViewMode('markdown')}
                  >
                    <Eye size={16} strokeWidth={1.9} />
                  </IconButton>
                  <IconButton label="Salin Semua" onClick={handleCopyAll}>
                    {copied ? <Check size={16} strokeWidth={2.1} /> : <Copy size={16} strokeWidth={1.9} />}
                  </IconButton>
                  <IconButton label="Unduh Paste" onClick={handleDownloadPaste}>
                    <Download size={16} strokeWidth={1.9} />
                  </IconButton>
                  <IconButton label="Hapus Paste" variant="danger" onClick={handleDelete}>
                    <Trash2 size={16} strokeWidth={1.9} />
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
                    leftIcon={<Save size={14} strokeWidth={1.9} />}
                    onClick={handleSave}
                  >
                    Simpan
                  </Button>
                </div>
              </div>

              {/* Editor Mode Switcher for Mobile */}
              <div className="flex md:hidden items-center justify-end">
                <button
                  type="button"
                  onClick={() => setUseSimpleMobileEditor((v) => !v)}
                  className="text-[11.5px] font-medium text-[var(--color-primary)] cursor-pointer"
                >
                  {useSimpleMobileEditor ? 'Gunakan Monaco Editor' : 'Gunakan Editor Ringan Mobile'}
                </button>
              </div>

              {/* Surface */}
              <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--card-row-bg)] overflow-hidden">
                {viewMode === 'raw' ? (
                  <pre className="p-4 min-h-[320px] max-h-[480px] overflow-auto text-[12.5px] font-mono whitespace-pre-wrap break-words text-[var(--color-text-primary)]">
                    {content || '(Kosong)'}
                  </pre>
                ) : viewMode === 'markdown' ? (
                  <MarkdownPreview content={content} />
                ) : useSimpleMobileEditor ? (
                  <div className="p-2">
                    <Textarea
                      value={content}
                      onChange={(e) => {
                        setContent(e.target.value);
                        setDirty(true);
                      }}
                      rows={14}
                      className="font-mono text-[12.5px]"
                      placeholder="Tulis kode atau catatan di sini..."
                    />
                  </div>
                ) : (
                  <Suspense
                    fallback={
                      <div className="p-4 space-y-2">
                        <Skeleton className="h-5 w-1/3" />
                        <Skeleton className="h-64 w-full" />
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
