import { useRef } from 'react';
import { CloudUpload, Code, Folder } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useUpload } from '@/hooks/useUpload';
import { api } from '@/services/api';
import { useFileStore } from '@/stores/file.store';
import { useRoomStore } from '@/stores/room.store';
import { useUIStore } from '@/stores/ui.store';
import type { FileItem } from '@/types/file';
import { FileEditorModal } from './components/FileEditorModal';
import { FileList } from './components/FileList';
import { FilePreviewModal } from './components/FilePreviewModal';
import { FileUploadZone } from './components/FileUploadZone';
import { RenameFileModal } from './components/RenameFileModal';
import { TransferQueue } from './components/TransferQueue';

export function FilesFeature() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const room = useRoomStore((s) => s.room);
  const files = useFileStore((s) => s.files);
  const loading = useFileStore((s) => s.loading);
  const previewFile = useFileStore((s) => s.previewFile);
  const editingFile = useFileStore((s) => s.editingFile);
  const renamingFile = useFileStore((s) => s.renamingFile);
  const setPreviewFile = useFileStore((s) => s.setPreviewFile);
  const setEditingFile = useFileStore((s) => s.setEditingFile);
  const setRenamingFile = useFileStore((s) => s.setRenamingFile);
  const removeFile = useFileStore((s) => s.removeFile);

  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const pushToast = useUIStore((s) => s.pushToast);
  const openConfirm = useUIStore((s) => s.openConfirm);

  const roomCode = room?.room_code ?? '';
  const { enqueueUploads, pauseUpload, resumeOrRetryUpload, cancelTransfer, startDownload } =
    useUpload(roomCode);

  if (!room) return null;

  const remainingStorage = Math.max(0, room.storage_limit - room.used_storage);

  const handleCopyDownloadLink = async (file: FileItem) => {
    try {
      const url = api.getFileDownloadUrl(file.id, room.room_code);
      await navigator.clipboard.writeText(url);
      pushToast('success', 'Link unduh berhasil disalin');
    } catch {
      pushToast('error', 'Gagal menyalin link unduh');
    }
  };

  const handleRequestDelete = (file: FileItem) => {
    openConfirm({
      title: 'Hapus File?',
      description: `File ${file.original_name} akan dihapus secara permanen dari room ini.`,
      confirmLabel: 'Hapus File',
      cancelLabel: 'Batal',
      variant: 'danger',
      icon: 'trash',
      onConfirm: async () => {
        await api.deleteFile(file.id, room.room_code);
        removeFile(file.id);
        useRoomStore.getState().adjustUsedStorage(-file.file_size);
        pushToast('success', `${file.original_name} dihapus`);
      },
    });
  };

  const handleBulkDelete = (selectedFiles: FileItem[]) => {
    if (selectedFiles.length === 0) return;
    openConfirm({
      title: `Hapus ${selectedFiles.length} File?`,
      description: `${selectedFiles.length} file yang dipilih akan dihapus secara permanen dari room ini.`,
      confirmLabel: `Hapus ${selectedFiles.length} File`,
      cancelLabel: 'Batal',
      variant: 'danger',
      icon: 'trash',
      onConfirm: async () => {
        const ids = selectedFiles.map((f) => f.id);
        const res = await api.bulkDeleteFiles(room.room_code, ids);
        const deletedSet = new Set(res.deleted_ids);
        let freedBytes = 0;
        for (const f of selectedFiles) {
          if (deletedSet.has(f.id)) {
            freedBytes += f.file_size;
            removeFile(f.id);
          }
        }
        if (freedBytes > 0) {
          useRoomStore.getState().adjustUsedStorage(-freedBytes);
        }
        pushToast('success', `${res.deleted_count} file berhasil dihapus`);
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-[12px] bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
            <Folder size={21} strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-[19px] font-bold tracking-tight text-[var(--color-text-primary)] leading-tight">
              Files
            </h2>
            <p className="text-[12.5px] text-[var(--color-text-secondary)]">
              Upload, edit isi teks/kode, ubah nama, dan bagikan file di room ini.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<CloudUpload size={15} strokeWidth={2} />}
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 sm:flex-initial"
          >
            Upload File
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Code size={15} strokeWidth={2} />}
            onClick={() => setActiveTab('pastes')}
            className="flex-1 sm:flex-initial"
          >
            Buat Paste
          </Button>
        </div>
      </div>

      <FileUploadZone
        externalInputRef={fileInputRef}
        maxFileSize={room.max_file_size}
        remainingStorage={remainingStorage}
        onFilesSelected={enqueueUploads}
      />

      <TransferQueue
        onPauseUpload={pauseUpload}
        onResumeUpload={resumeOrRetryUpload}
        onRetryUpload={resumeOrRetryUpload}
        onCancelTransfer={cancelTransfer}
      />

      <FileList
        files={files}
        loading={loading}
        onPreview={setPreviewFile}
        onEditContent={setEditingFile}
        onRename={setRenamingFile}
        onCopyLink={handleCopyDownloadLink}
        onDownload={startDownload}
        onDelete={handleRequestDelete}
        onBulkDelete={handleBulkDelete}
      />

      <FilePreviewModal
        file={previewFile}
        roomCode={room.room_code}
        onClose={() => setPreviewFile(null)}
        onDownload={startDownload}
        onEditContent={setEditingFile}
      />

      <FileEditorModal
        file={editingFile}
        roomCode={room.room_code}
        onClose={() => setEditingFile(null)}
      />

      <RenameFileModal
        file={renamingFile}
        roomCode={room.room_code}
        onClose={() => setRenamingFile(null)}
      />
    </div>
  );
}
