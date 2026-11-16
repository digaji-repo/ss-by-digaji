import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUpDown,
  Check,
  Download,
  Eye,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  LayoutGrid,
  Link as LinkIcon,
  List,
  Minus,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/DropdownAndPopover';
import { Select } from '@/components/ui/FormControls';
import { IconButton } from '@/components/ui/IconButton';
import { EmptyState, Skeleton } from '@/components/ui/States';
import type { FileItem } from '@/types/file';
import { formatRelativeTime } from '@/utils/format-date';
import { formatBytes } from '@/utils/format-size';
import { isEditableTextFile, isPreviewableFile } from '@/utils/validators';

export type FileSortOption =
  | 'newest'
  | 'oldest'
  | 'name_asc'
  | 'name_desc'
  | 'size_desc'
  | 'size_asc';

const SORT_OPTIONS: ReadonlyArray<{ value: FileSortOption; label: string }> = [
  { value: 'newest', label: 'Terbaru' },
  { value: 'oldest', label: 'Terlama' },
  { value: 'name_asc', label: 'Nama A–Z' },
  { value: 'name_desc', label: 'Nama Z–A' },
  { value: 'size_desc', label: 'Terbesar' },
  { value: 'size_asc', label: 'Terkecil' },
];

interface FileListProps {
  files: FileItem[];
  loading: boolean;
  onPreview: (file: FileItem) => void;
  onEditContent: (file: FileItem) => void;
  onRename: (file: FileItem) => void;
  onCopyLink: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
  onBulkDelete: (selectedFiles: FileItem[]) => void;
}

function getFileVisual(mimeType: string, name: string) {
  const m = mimeType.toLowerCase();
  const ext = name.split('.').pop()?.toLowerCase() ?? '';

  if (['doc', 'docx', 'odt', 'rtf'].includes(ext) || m.includes('wordprocessingml')) {
    return {
      icon: FileText,
      badgeBg: 'bg-[#0A84FF]/14 text-[#0A84FF]',
      extLabel: ext.toUpperCase().slice(0, 4) || 'DOC',
    };
  }
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext) || m.includes('spreadsheetml')) {
    return {
      icon: FileSpreadsheet,
      badgeBg: 'bg-[#30D5A0]/18 text-[#0F8A64] dark:text-[#30D5A0]',
      extLabel: ext.toUpperCase().slice(0, 4) || 'XLS',
    };
  }
  if (['ppt', 'pptx'].includes(ext) || m.includes('presentationml')) {
    return {
      icon: FileText,
      badgeBg: 'bg-[#FF9F0A]/16 text-[#D97706] dark:text-[#FF9F0A]',
      extLabel: ext.toUpperCase().slice(0, 4) || 'PPT',
    };
  }
  if (m.startsWith('image/')) {
    return {
      icon: FileImage,
      badgeBg: 'bg-[#0A84FF]/14 text-[#0A84FF]',
      extLabel: ext ? ext.toUpperCase().slice(0, 4) : 'IMG',
    };
  }
  if (m.startsWith('video/') && !isEditableTextFile(name, mimeType)) {
    return {
      icon: FileVideo,
      badgeBg: 'bg-[#5E5CE6]/14 text-[#5E5CE6]',
      extLabel: 'VID',
    };
  }
  if (m.startsWith('audio/')) {
    return {
      icon: FileAudio,
      badgeBg: 'bg-[#AF52DE]/14 text-[#AF52DE]',
      extLabel: 'AUD',
    };
  }
  if (
    ['zip', 'rar', '7z', 'tar', 'gz', 'tgz'].includes(ext) ||
    m.includes('zip') ||
    m.includes('tar') ||
    m.includes('rar') ||
    m.includes('gzip')
  ) {
    return {
      icon: FileArchive,
      badgeBg: 'bg-[#FF9F0A]/16 text-[#D97706] dark:text-[#FF9F0A]',
      extLabel: ext ? ext.toUpperCase().slice(0, 4) : 'ZIP',
    };
  }
  if (m.includes('pdf') || ext === 'pdf') {
    return {
      icon: FileText,
      badgeBg: 'bg-[#FF453A]/14 text-[#FF453A]',
      extLabel: 'PDF',
    };
  }
  if (isEditableTextFile(name, mimeType)) {
    return {
      icon: FileCode,
      badgeBg: 'bg-[#30D5A0]/18 text-[#0F8A64] dark:text-[#30D5A0]',
      extLabel: ext ? ext.toUpperCase().slice(0, 4) : 'TXT',
    };
  }
  return {
    icon: FileIcon,
    badgeBg: 'bg-[var(--color-text-secondary)]/14 text-[var(--color-text-secondary)]',
    extLabel: ext ? ext.toUpperCase().slice(0, 4) : 'FILE',
  };
}

interface SelectCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}

function SelectCheckbox({ checked, indeterminate = false, onChange, label }: SelectCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`w-[18px] h-[18px] rounded-[6px] border flex items-center justify-center transition-all duration-150 shrink-0 cursor-pointer ${
        checked || indeterminate
          ? 'bg-gradient-to-b from-[#2A97FF] to-[#0A84FF] border-[#0A84FF] text-white shadow-[0_2px_8px_rgba(10,132,255,0.3)]'
          : 'border-[var(--color-border)] bg-[var(--input-bg)] hover:border-[var(--color-primary)]/60'
      }`}
    >
      {indeterminate ? (
        <Minus size={12} strokeWidth={2.6} />
      ) : checked ? (
        <Check size={12} strokeWidth={2.6} />
      ) : null}
    </button>
  );
}

export function FileList({
  files,
  loading,
  onPreview,
  onEditContent,
  onRename,
  onCopyLink,
  onDownload,
  onDelete,
  onBulkDelete,
}: FileListProps) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<FileSortOption>('newest');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Prune selection IDs that no longer exist in files list
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const validSet = new Set(files.map((f) => f.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (validSet.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [files]);

  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? files.filter((f) => f.original_name.toLowerCase().includes(q)) : [...files];

    list.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'name_asc':
          return a.original_name.localeCompare(b.original_name, undefined, {
            numeric: true,
            sensitivity: 'base',
          });
        case 'name_desc':
          return b.original_name.localeCompare(a.original_name, undefined, {
            numeric: true,
            sensitivity: 'base',
          });
        case 'size_desc':
          return b.file_size - a.file_size;
        case 'size_asc':
          return a.file_size - b.file_size;
      }
    });
    return list;
  }, [files, query, sortBy]);

  const visibleIds = useMemo(() => filteredAndSorted.map((f) => f.id), [filteredAndSorted]);
  const selectedVisibleCount = useMemo(
    () => visibleIds.filter((id) => selectedIds.has(id)).length,
    [visibleIds, selectedIds]
  );
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };

  const selectedFiles = useMemo(
    () => files.filter((f) => selectedIds.has(f.id)),
    [files, selectedIds]
  );

  if (loading) {
    return (
      <div className="space-y-2.5">
        <Skeleton className="h-14 w-full rounded-[12px]" />
        <Skeleton className="h-14 w-full rounded-[12px]" />
        <Skeleton className="h-14 w-full rounded-[12px]" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar: Select All + Daftar File (N) + Search + Sort Dropdown + View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          {filteredAndSorted.length > 0 && (
            <SelectCheckbox
              checked={allVisibleSelected}
              indeterminate={someVisibleSelected}
              onChange={toggleSelectAllVisible}
              label="Pilih semua file"
            />
          )}
          <h3 className="text-[14.5px] font-semibold text-[var(--color-text-primary)]">
            Daftar File{' '}
            <span className="font-normal text-[var(--color-text-secondary)]">
              ({filteredAndSorted.length})
            </span>
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 h-9 px-3 rounded-[10px] border border-[var(--color-border)] bg-[var(--input-bg)] flex-1 min-w-[150px] sm:w-48">
            <Search size={14} strokeWidth={1.9} className="text-[var(--color-text-secondary)] shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari file..."
              className="w-full bg-transparent text-[12.5px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]/75 focus:outline-none"
            />
          </div>

          <div className="w-[138px] shrink-0">
            <Select
              aria-label="Urutkan File"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as FileSortOption)}
              options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              className="h-9 text-[12.5px]"
            />
          </div>

          <div className="hidden md:inline-flex items-center p-0.5 rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-muted)]">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="Tampilan Daftar"
              className={`w-7 h-7 rounded-[7px] flex items-center justify-center transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-xs'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <List size={15} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Tampilan Grid"
              className={`w-7 h-7 rounded-[7px] flex items-center justify-center transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-xs'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <LayoutGrid size={15} strokeWidth={1.9} />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      <AnimatePresence initial={false}>
        {selectedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="glass-light rounded-[12px] px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 border border-[var(--color-primary)]/30"
          >
            <div className="flex items-center gap-2 text-[12.5px] font-medium text-[var(--color-text-primary)]">
              <ArrowUpDown size={14} strokeWidth={2} className="text-[var(--color-primary)]" />
              <span>
                <strong>{selectedFiles.length}</strong> file dipilih
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Batal Pilih
              </Button>
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Trash2 size={14} strokeWidth={2} />}
                onClick={() => onBulkDelete(selectedFiles)}
              >
                Hapus Terpilih ({selectedFiles.length})
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {filteredAndSorted.length === 0 ? (
        <EmptyState
          icon={<Folder size={22} strokeWidth={1.8} />}
          title={query ? 'File Tidak Ditemukan' : 'Belum Ada File'}
          description={
            query
              ? `Tidak ada file yang cocok dengan pencarian "${query}".`
              : 'Upload file pertama ke room ini untuk mulai berbagi secara realtime.'
          }
        />
      ) : (
        /* Scrollable Container inside Card */
        <div className="glass-light rounded-[14px] p-2 sm:p-2.5">
          <div className="max-h-[400px] sm:max-h-[460px] overflow-y-auto pr-1.5">
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredAndSorted.map((file) => {
                  const visual = getFileVisual(file.mime_type, file.original_name);
                  const Icon = visual.icon;
                  const previewable = isPreviewableFile(file.mime_type, file.original_name);
                  const editable = isEditableTextFile(file.original_name, file.mime_type);
                  const isSelected = selectedIds.has(file.id);

                  return (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.16 }}
                      className={`rounded-[13px] border p-3.5 flex flex-col gap-3 transition-colors ${
                        isSelected
                          ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/8'
                          : 'border-[var(--color-border)] bg-[var(--card-row-bg)] hover:bg-[var(--card-row-hover-bg)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <SelectCheckbox
                            checked={isSelected}
                            onChange={() => toggleSelectOne(file.id)}
                            label={`Pilih ${file.original_name}`}
                          />
                          <span
                            className={`w-10 h-10 rounded-[10px] flex flex-col items-center justify-center shrink-0 ${visual.badgeBg}`}
                          >
                            <Icon size={17} strokeWidth={1.9} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[13.5px] font-semibold truncate text-[var(--color-text-primary)]">
                              {file.original_name}
                            </p>
                            <p className="text-[11.5px] text-[var(--color-text-secondary)]">
                              {formatBytes(file.file_size)} • {formatRelativeTime(file.created_at)}
                            </p>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#30D5A0]/16 text-[#0F8A64] dark:text-[#30D5A0] text-[11px] font-semibold shrink-0">
                          <ArrowDown size={11} strokeWidth={2.2} />
                          {file.download_count} kali
                        </span>
                      </div>

                      <div className="flex items-center justify-end gap-1 pt-2 border-t border-[var(--color-border)]/70">
                        {editable && (
                          <IconButton
                            label="Edit Teks / Kode"
                            size="sm"
                            onClick={() => onEditContent(file)}
                          >
                            <FileCode2 size={15} strokeWidth={1.9} />
                          </IconButton>
                        )}
                        <IconButton label="Ubah Nama File" size="sm" onClick={() => onRename(file)}>
                          <Pencil size={15} strokeWidth={1.9} />
                        </IconButton>
                        {previewable && (
                          <IconButton label="Pratinjau" size="sm" onClick={() => onPreview(file)}>
                            <Eye size={15} strokeWidth={1.9} />
                          </IconButton>
                        )}
                        <IconButton label="Unduh File" size="sm" onClick={() => onDownload(file)}>
                          <Download size={15} strokeWidth={1.9} />
                        </IconButton>
                        <IconButton
                          label="Link Unduh"
                          size="sm"
                          onClick={() => onCopyLink(file)}
                        >
                          <LinkIcon size={15} strokeWidth={1.9} />
                        </IconButton>
                        <IconButton
                          label="Hapus File"
                          variant="danger"
                          size="sm"
                          onClick={() => onDelete(file)}
                        >
                          <Trash2 size={15} strokeWidth={1.9} />
                        </IconButton>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAndSorted.map((file) => {
                  const visual = getFileVisual(file.mime_type, file.original_name);
                  const Icon = visual.icon;
                  const previewable = isPreviewableFile(file.mime_type, file.original_name);
                  const editable = isEditableTextFile(file.original_name, file.mime_type);
                  const isSelected = selectedIds.has(file.id);

                  const menuItems = [
                    ...(editable
                      ? [
                          {
                            id: 'edit',
                            label: 'Edit Teks / Kode',
                            icon: <FileCode2 size={14} strokeWidth={1.9} />,
                            onClick: () => onEditContent(file),
                          },
                        ]
                      : []),
                    {
                      id: 'rename',
                      label: 'Ubah Nama File',
                      icon: <Pencil size={14} strokeWidth={1.9} />,
                      onClick: () => onRename(file),
                    },
                    ...(previewable
                      ? [
                          {
                            id: 'preview',
                            label: 'Pratinjau File',
                            icon: <Eye size={14} strokeWidth={1.9} />,
                            onClick: () => onPreview(file),
                          },
                        ]
                      : []),
                    {
                      id: 'download',
                      label: 'Unduh File',
                      icon: <Download size={14} strokeWidth={1.9} />,
                      onClick: () => onDownload(file),
                    },
                    {
                      id: 'copy',
                      label: 'Link Unduh',
                      icon: <LinkIcon size={14} strokeWidth={1.9} />,
                      onClick: () => onCopyLink(file),
                    },
                    {
                      id: 'delete',
                      label: 'Hapus File',
                      icon: <Trash2 size={14} strokeWidth={1.9} />,
                      danger: true,
                      onClick: () => onDelete(file),
                    },
                  ];

                  return (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.16 }}
                      className={`rounded-[13px] border px-3 sm:px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all duration-150 ${
                        isSelected
                          ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/8'
                          : 'border-[var(--color-border)] bg-[var(--card-row-bg)] hover:bg-[var(--card-row-hover-bg)]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <SelectCheckbox
                          checked={isSelected}
                          onChange={() => toggleSelectOne(file.id)}
                          label={`Pilih ${file.original_name}`}
                        />
                        <span
                          className={`w-10 h-10 rounded-[10px] flex flex-col items-center justify-center shrink-0 ${visual.badgeBg}`}
                        >
                          <Icon size={17} strokeWidth={1.9} />
                          <span className="text-[8.5px] font-bold tracking-wider leading-none mt-0.5">
                            {visual.extLabel}
                          </span>
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-semibold truncate text-[var(--color-text-primary)]">
                            {file.original_name}
                          </p>
                          <p className="text-[11.5px] text-[var(--color-text-secondary)]">
                            {formatBytes(file.file_size)} • {formatRelativeTime(file.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 shrink-0">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#30D5A0]/16 text-[#0F8A64] dark:text-[#30D5A0] text-[11.5px] font-semibold">
                          <ArrowDown size={11} strokeWidth={2.3} />
                          {file.download_count} kali
                        </span>

                        <div className="flex items-center gap-0.5">
                          {editable && (
                            <IconButton
                              label="Edit Teks / Kode"
                              size="sm"
                              onClick={() => onEditContent(file)}
                            >
                              <FileCode2 size={15} strokeWidth={1.9} />
                            </IconButton>
                          )}
                          <IconButton
                            label="Ubah Nama File"
                            size="sm"
                            onClick={() => onRename(file)}
                          >
                            <Pencil size={15} strokeWidth={1.9} />
                          </IconButton>
                          {previewable && (
                            <IconButton label="Pratinjau" size="sm" onClick={() => onPreview(file)}>
                              <Eye size={15} strokeWidth={1.9} />
                            </IconButton>
                          )}
                          <IconButton label="Unduh File" size="sm" onClick={() => onDownload(file)}>
                            <Download size={15} strokeWidth={1.9} />
                          </IconButton>
                          <IconButton
                            label="Link Unduh"
                            size="sm"
                            onClick={() => onCopyLink(file)}
                          >
                            <LinkIcon size={15} strokeWidth={1.9} />
                          </IconButton>
                          <Dropdown
                            items={menuItems}
                            trigger={
                              <IconButton label="Opsi Lainnya" size="sm">
                                <MoreHorizontal size={15} strokeWidth={1.9} />
                              </IconButton>
                            }
                          />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
