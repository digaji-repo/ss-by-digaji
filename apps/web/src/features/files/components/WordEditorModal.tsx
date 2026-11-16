import { useCallback, useEffect, useRef, useState } from 'react';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import CharacterCount from '@tiptap/extension-character-count';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Columns3,
  Download,
  FileText,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RefreshCw,
  Rows3,
  Save,
  Strikethrough,
  Table2,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/FormControls';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Primitives';
import { Skeleton } from '@/components/ui/States';
import {
  buildDocxBlobFromHtml,
  parseDocxArrayBufferToHtml,
} from '@/features/files/services/wordDocx';
import { ApiError, api } from '@/services/api';
import { useFileStore } from '@/stores/file.store';
import { useRoomStore } from '@/stores/room.store';
import { useUIStore } from '@/stores/ui.store';
import type { FileItem } from '@/types/file';
import { formatBytes } from '@/utils/format-size';

interface WordEditorModalProps {
  file: FileItem | null;
  roomCode: string;
  onClose: () => void;
}

const TEXT_COLORS = [
  { label: 'Default', hex: '' },
  { label: 'Biru iOS', hex: '#0A84FF' },
  { label: 'Hijau', hex: '#0F8A64' },
  { label: 'Oranye', hex: '#D97706' },
  { label: 'Merah', hex: '#DC2626' },
  { label: 'Ungu', hex: '#7C3AED' },
] as const;

const BLOCK_STYLE_OPTIONS = [
  { value: 'p', label: 'Paragraf Normal' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
] as const;

export default function WordEditorModal({ file, roomCode, onClose }: WordEditorModalProps) {
  const upsertFile = useFileStore((s) => s.upsertFile);
  const fileRevision = useFileStore((s) => (file ? s.fileRevisions[file.id] ?? 0 : 0));
  const pushToast = useUIStore((s) => s.pushToast);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [peerUpdateAvailable, setPeerUpdateAvailable] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [, setTick] = useState(0);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const dirtyRef = useRef(false);
  const loadedRevisionRef = useRef<number>(0);
  const suppressDirtyRef = useRef(false);

  dirtyRef.current = dirty;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false, autolink: true },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ allowBase64: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: 'Mulai mengetik dokumen Word Anda...' }),
      CharacterCount,
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'word-prose min-h-[44vh] focus:outline-none',
      },
    },
    onUpdate: () => {
      if (suppressDirtyRef.current) return;
      setDirty(true);
    },
    onSelectionUpdate: () => {
      setTick((n) => n + 1);
    },
  });

  const loadDocumentFromServer = useCallback(
    async (targetFile: FileItem, targetRev: number, signalCancelled?: () => boolean) => {
      if (!editor) return;
      setLoading(true);
      setLoadError(null);
      try {
        const buffer = await api.fetchFileBinary(targetFile.id, roomCode);
        if (signalCancelled?.()) return;
        const { html } = await parseDocxArrayBufferToHtml(buffer);
        if (signalCancelled?.()) return;

        suppressDirtyRef.current = true;
        editor.commands.setContent(html, { emitUpdate: false });
        suppressDirtyRef.current = false;

        setDirty(false);
        setPeerUpdateAvailable(false);
        loadedRevisionRef.current = targetRev;
      } catch (err) {
        if (signalCancelled?.()) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : 'Dokumen .docx tidak dapat dibaca atau file rusak.'
        );
      } finally {
        if (!signalCancelled?.()) setLoading(false);
      }
    },
    [editor, roomCode]
  );

  // Initial load when file modal opens
  useEffect(() => {
    if (!file || !editor) return;
    let cancelled = false;
    const revAtOpen = useFileStore.getState().fileRevisions[file.id] ?? 0;
    void loadDocumentFromServer(file, revAtOpen, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [file?.id, editor, loadDocumentFromServer]);

  // Live sync when peer saves changes to the same .docx file
  useEffect(() => {
    if (!file || !editor) return;
    if (fileRevision <= loadedRevisionRef.current) return;

    if (!dirtyRef.current) {
      void loadDocumentFromServer(file, fileRevision);
      pushToast('info', `${file.original_name} diperbarui oleh anggota lain`, 3000);
    } else {
      setPeerUpdateAvailable(true);
    }
  }, [file, fileRevision, editor, loadDocumentFromServer, pushToast]);

  const handleSave = useCallback(async () => {
    if (!file || !editor || saving) return;
    setSaving(true);
    try {
      const oldSize = file.file_size;
      const html = editor.getHTML();
      const docxBlob = await buildDocxBlobFromHtml(
        html,
        file.original_name.replace(/\.docx$/i, '')
      );

      // Expected revision increment from our own save so we ignore our echo event
      const currentRev = useFileStore.getState().fileRevisions[file.id] ?? 0;
      loadedRevisionRef.current = currentRev + 1;

      const updated = await api.updateWordBinary(
        file.id,
        roomCode,
        docxBlob,
        file.original_name
      );
      upsertFile(updated);
      useRoomStore.getState().adjustUsedStorage(updated.file_size - oldSize);
      setDirty(false);
      setPeerUpdateAvailable(false);
      pushToast('success', `${updated.original_name} tersimpan & disinkronkan ke room`, 3000);
    } catch (err) {
      loadedRevisionRef.current = useFileStore.getState().fileRevisions[file.id] ?? 0;
      pushToast(
        'error',
        err instanceof ApiError ? err.message : 'Gagal menyimpan dokumen Word.'
      );
    } finally {
      setSaving(false);
    }
  }, [file, editor, saving, roomCode, upsertFile, pushToast]);

  // Ctrl+S / Cmd+S shortcut
  useEffect(() => {
    if (!file) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [file, handleSave]);

  const handleDownloadLocalDocx = async () => {
    if (!file || !editor) return;
    try {
      const blob = await buildDocxBlobFromHtml(
        editor.getHTML(),
        file.original_name.replace(/\.docx$/i, '')
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.original_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      pushToast('error', 'Gagal mengekspor dokumen .docx');
    }
  };

  const handlePickImage = async (picked: File | undefined) => {
    if (!picked || !editor) return;
    try {
      const dataUrl = await rasterizeImageToDataUrl(picked);
      editor.chain().focus().setImage({ src: dataUrl, alt: picked.name }).run();
    } catch {
      pushToast('error', 'Gagal menyisipkan gambar ke dokumen');
    }
  };

  const handleApplyLink = () => {
    if (!editor) return;
    const trimmed = linkUrl.trim();
    if (!trimmed || trimmed === 'https://') {
      editor.chain().focus().unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    editor.chain().focus().setLink({ href: normalized }).run();
    setLinkOpen(false);
  };

  const activeBlockStyle = editor?.isActive('heading', { level: 1 })
    ? 'h1'
    : editor?.isActive('heading', { level: 2 })
      ? 'h2'
      : editor?.isActive('heading', { level: 3 })
        ? 'h3'
        : 'p';

  const handleBlockStyleChange = (val: string) => {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (val === 'h1') chain.setHeading({ level: 1 }).run();
    else if (val === 'h2') chain.setHeading({ level: 2 }).run();
    else if (val === 'h3') chain.setHeading({ level: 3 }).run();
    else chain.setParagraph().run();
  };

  const words = editor?.storage.characterCount?.words() ?? 0;
  const chars = editor?.storage.characterCount?.characters() ?? 0;
  const inTable = editor?.isActive('table') ?? false;

  return (
    <Modal
      open={Boolean(file)}
      onClose={saving ? () => {} : onClose}
      closeOnBackdrop={!saving && !dirty}
      size="xl"
      title={file ? `Word Editor: ${file.original_name}` : 'Word Editor'}
      description={
        file
          ? `${formatBytes(file.file_size)} • Edit dokumen .docx langsung & sinkron saat Simpan`
          : undefined
      }
    >
      {file && (
        <div className="space-y-3">
          {peerUpdateAvailable && (
            <div className="glass-light border border-[var(--color-primary)]/40 rounded-[12px] px-3.5 py-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-[var(--color-text-primary)]">
                Anggota lain baru saja menyimpan versi terbaru dokumen ini.
              </span>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<RefreshCw size={13} strokeWidth={2} />}
                onClick={() => void loadDocumentFromServer(file, fileRevision)}
              >
                Muat Versi Terbaru
              </Button>
            </div>
          )}

          {/* Formatting Ribbon */}
          <div className="glass-light rounded-[14px] p-2 flex flex-wrap items-center gap-1.5">
            <div className="w-36 shrink-0">
              <Select
                aria-label="Gaya Paragraf"
                value={activeBlockStyle}
                onChange={(e) => handleBlockStyleChange(e.target.value)}
                options={BLOCK_STYLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </div>

            <span className="h-6 w-px bg-[var(--color-border)] mx-0.5 hidden sm:block" />

            {/* Undo / Redo */}
            <div className="flex items-center gap-0.5">
              <IconButton
                label="Undo"
                size="sm"
                disabled={!editor?.can().undo()}
                onClick={() => editor?.chain().focus().undo().run()}
              >
                <Undo2 size={15} strokeWidth={1.9} />
              </IconButton>
              <IconButton
                label="Redo"
                size="sm"
                disabled={!editor?.can().redo()}
                onClick={() => editor?.chain().focus().redo().run()}
              >
                <Redo2 size={15} strokeWidth={1.9} />
              </IconButton>
            </div>

            <span className="h-6 w-px bg-[var(--color-border)] mx-0.5 hidden sm:block" />

            {/* Inline Text Formatting */}
            <div className="flex items-center gap-0.5">
              <IconButton
                label="Tebal (Bold)"
                size="sm"
                active={editor?.isActive('bold')}
                onClick={() => editor?.chain().focus().toggleBold().run()}
              >
                <Bold size={15} strokeWidth={2} />
              </IconButton>
              <IconButton
                label="Miring (Italic)"
                size="sm"
                active={editor?.isActive('italic')}
                onClick={() => editor?.chain().focus().toggleItalic().run()}
              >
                <Italic size={15} strokeWidth={2} />
              </IconButton>
              <IconButton
                label="Garis Bawah"
                size="sm"
                active={editor?.isActive('underline')}
                onClick={() => editor?.chain().focus().toggleUnderline().run()}
              >
                <UnderlineIcon size={15} strokeWidth={2} />
              </IconButton>
              <IconButton
                label="Coret (Strikethrough)"
                size="sm"
                active={editor?.isActive('strike')}
                onClick={() => editor?.chain().focus().toggleStrike().run()}
              >
                <Strikethrough size={15} strokeWidth={2} />
              </IconButton>
              <IconButton
                label="Highlight Kuning"
                size="sm"
                active={editor?.isActive('highlight')}
                onClick={() => editor?.chain().focus().toggleHighlight({ color: '#FEF08A' }).run()}
              >
                <Highlighter size={15} strokeWidth={1.9} />
              </IconButton>
            </div>

            <span className="h-6 w-px bg-[var(--color-border)] mx-0.5 hidden sm:block" />

            {/* Text Colors */}
            <div className="flex items-center gap-1 px-1" aria-label="Warna Teks">
              {TEXT_COLORS.map((swatch) => {
                const isSelected = swatch.hex
                  ? editor?.isActive('textStyle', { color: swatch.hex })
                  : !editor?.getAttributes('textStyle')?.color;
                return (
                  <button
                    key={swatch.label}
                    type="button"
                    title={`Warna: ${swatch.label}`}
                    aria-label={`Warna ${swatch.label}`}
                    onClick={() =>
                      swatch.hex
                        ? editor?.chain().focus().setColor(swatch.hex).run()
                        : editor?.chain().focus().unsetColor().run()
                    }
                    className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center transition-transform cursor-pointer ${
                      isSelected
                        ? 'scale-115 ring-2 ring-[var(--color-primary)] ring-offset-1 ring-offset-transparent'
                        : 'border-[var(--color-border)] hover:scale-105'
                    }`}
                    style={{
                      backgroundColor: swatch.hex || 'var(--color-text-primary)',
                    }}
                  >
                    {isSelected && <Check size={9} strokeWidth={3} className="text-white" />}
                  </button>
                );
              })}
            </div>

            <span className="h-6 w-px bg-[var(--color-border)] mx-0.5 hidden sm:block" />

            {/* Alignment */}
            <div className="flex items-center gap-0.5">
              <IconButton
                label="Rata Kiri"
                size="sm"
                active={editor?.isActive({ textAlign: 'left' })}
                onClick={() => editor?.chain().focus().setTextAlign('left').run()}
              >
                <AlignLeft size={15} strokeWidth={1.9} />
              </IconButton>
              <IconButton
                label="Rata Tengah"
                size="sm"
                active={editor?.isActive({ textAlign: 'center' })}
                onClick={() => editor?.chain().focus().setTextAlign('center').run()}
              >
                <AlignCenter size={15} strokeWidth={1.9} />
              </IconButton>
              <IconButton
                label="Rata Kanan"
                size="sm"
                active={editor?.isActive({ textAlign: 'right' })}
                onClick={() => editor?.chain().focus().setTextAlign('right').run()}
              >
                <AlignRight size={15} strokeWidth={1.9} />
              </IconButton>
              <IconButton
                label="Rata Kanan Kiri"
                size="sm"
                active={editor?.isActive({ textAlign: 'justify' })}
                onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
              >
                <AlignJustify size={15} strokeWidth={1.9} />
              </IconButton>
            </div>

            <span className="h-6 w-px bg-[var(--color-border)] mx-0.5 hidden sm:block" />

            {/* Lists & Blocks */}
            <div className="flex items-center gap-0.5">
              <IconButton
                label="Bullet List"
                size="sm"
                active={editor?.isActive('bulletList')}
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
              >
                <List size={15} strokeWidth={1.9} />
              </IconButton>
              <IconButton
                label="Numbered List"
                size="sm"
                active={editor?.isActive('orderedList')}
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              >
                <ListOrdered size={15} strokeWidth={1.9} />
              </IconButton>
              <IconButton
                label="Kutipan (Blockquote)"
                size="sm"
                active={editor?.isActive('blockquote')}
                onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              >
                <Quote size={15} strokeWidth={1.9} />
              </IconButton>
              <IconButton
                label="Garis Pembatas"
                size="sm"
                onClick={() => editor?.chain().focus().setHorizontalRule().run()}
              >
                <Minus size={15} strokeWidth={1.9} />
              </IconButton>
            </div>

            <span className="h-6 w-px bg-[var(--color-border)] mx-0.5 hidden sm:block" />

            {/* Insert Table, Image, Link */}
            <div className="flex items-center gap-0.5">
              <IconButton
                label="Sisipkan Tabel 3x3"
                size="sm"
                onClick={() =>
                  editor
                    ?.chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run()
                }
              >
                <Table2 size={15} strokeWidth={1.9} />
              </IconButton>
              <IconButton
                label="Sisipkan Gambar"
                size="sm"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImagePlus size={15} strokeWidth={1.9} />
              </IconButton>
              <IconButton
                label="Sisipkan Link"
                size="sm"
                active={editor?.isActive('link') || linkOpen}
                onClick={() => {
                  const prevHref = editor?.getAttributes('link')?.href;
                  setLinkUrl(typeof prevHref === 'string' && prevHref ? prevHref : 'https://');
                  setLinkOpen((v) => !v);
                }}
              >
                <Link2 size={15} strokeWidth={1.9} />
              </IconButton>
            </div>

            {inTable && (
              <div className="flex items-center gap-0.5 ml-auto pl-2 border-l border-[var(--color-border)]">
                <IconButton
                  label="Tambah Baris Tabel"
                  size="sm"
                  onClick={() => editor?.chain().focus().addRowAfter().run()}
                >
                  <Rows3 size={15} strokeWidth={1.9} />
                </IconButton>
                <IconButton
                  label="Tambah Kolom Tabel"
                  size="sm"
                  onClick={() => editor?.chain().focus().addColumnAfter().run()}
                >
                  <Columns3 size={15} strokeWidth={1.9} />
                </IconButton>
                <IconButton
                  label="Hapus Tabel"
                  variant="danger"
                  size="sm"
                  onClick={() => editor?.chain().focus().deleteTable().run()}
                >
                  <Trash2 size={14} strokeWidth={1.9} />
                </IconButton>
              </div>
            )}

            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                void handlePickImage(e.target.files?.[0]);
                e.currentTarget.value = '';
              }}
            />
          </div>

          {/* Inline Link Bar (replaces browser prompt) */}
          {linkOpen && (
            <div className="glass-light rounded-[12px] p-2.5 flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="https://contoh.com"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyLink();
                    }
                  }}
                />
              </div>
              <Button variant="primary" size="sm" onClick={handleApplyLink}>
                Terapkan Link
              </Button>
              {editor?.isActive('link') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    editor.chain().focus().unsetLink().run();
                    setLinkOpen(false);
                  }}
                >
                  Hapus Link
                </Button>
              )}
              <IconButton label="Batal" size="sm" onClick={() => setLinkOpen(false)}>
                <X size={15} strokeWidth={1.9} />
              </IconButton>
            </div>
          )}

          {/* Paper Canvas */}
          <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-muted)]/70 p-3 sm:p-5 max-h-[54vh] overflow-y-auto">
            {loading ? (
              <div className="bg-white dark:bg-[#12151C] rounded-[12px] p-6 sm:p-8 max-w-[740px] mx-auto space-y-3 border border-[var(--color-border)]">
                <Skeleton className="h-7 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-32 w-full rounded-[10px]" />
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-[var(--color-danger)]">
                <FileText size={28} strokeWidth={1.8} className="mb-2" />
                <p className="text-[13px]">{loadError}</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-[#12151C] text-[#141C2E] dark:text-[#F1F5F9] rounded-[12px] shadow-[0_8px_28px_rgba(15,23,42,0.06)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.45)] border border-[var(--color-border)] px-5 py-6 sm:px-10 sm:py-8 max-w-[760px] mx-auto">
                <EditorContent editor={editor} />
              </div>
            )}
          </div>

          {/* Status & Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              {dirty ? (
                <Badge tone="warning">Belum disimpan</Badge>
              ) : (
                <Badge tone="accent">Tersimpan</Badge>
              )}
              <span className="text-[12px] text-[var(--color-text-secondary)]">
                {words} kata • {chars} karakter • Ctrl+S
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
              <Button variant="secondary" disabled={saving} onClick={onClose}>
                Tutup
              </Button>
              <Button
                variant="secondary"
                leftIcon={<Download size={15} strokeWidth={1.9} />}
                disabled={loading || Boolean(loadError)}
                onClick={() => void handleDownloadLocalDocx()}
              >
                Unduh .docx
              </Button>
              <Button
                variant="primary"
                loading={saving}
                disabled={loading || Boolean(loadError) || !dirty}
                leftIcon={<Save size={15} strokeWidth={1.9} />}
                onClick={() => void handleSave()}
              >
                Simpan ke Room
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

async function rasterizeImageToDataUrl(file: File): Promise<string> {
  const rawUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('invalid image'));
      el.src = rawUrl;
    });
    const maxW = 960;
    const scale = img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, 0, 0, width, height);
    const preferPng = file.type === 'image/png' || file.type === 'image/webp';
    return canvas.toDataURL(preferPng ? 'image/png' : 'image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(rawUrl);
  }
}
