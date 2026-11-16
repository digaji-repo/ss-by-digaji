import { useRef } from 'react';
import { ApiError, api } from '@/services/api';
import { downloadFileWithProgress, uploadFileWithStrategy } from '@/services/file.service';
import { useFileStore } from '@/stores/file.store';
import { useRoomStore } from '@/stores/room.store';
import { useUIStore } from '@/stores/ui.store';
import type { FileItem } from '@/types/file';

export function useUpload(roomCode: string) {
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const filesMapRef = useRef<Map<string, File>>(new Map());

  const addTransfer = useFileStore((s) => s.addTransfer);
  const updateTransfer = useFileStore((s) => s.updateTransfer);
  const removeTransfer = useFileStore((s) => s.removeTransfer);
  const upsertFile = useFileStore((s) => s.upsertFile);
  const pushToast = useUIStore((s) => s.pushToast);

  const runUpload = async (localId: string, file: File) => {
    const controller = new AbortController();
    controllersRef.current.set(localId, controller);
    updateTransfer(localId, { status: 'uploading', error: undefined });

    try {
      const saved = await uploadFileWithStrategy(roomCode, file, {
        signal: controller.signal,
        onSessionReady: (uploadId, chunkSize, totalChunks) => {
          updateTransfer(localId, { uploadId, chunkSize, totalChunks });
        },
        onProgress: (transferredBytes, totalBytes) => {
          const pct = totalBytes > 0 ? (transferredBytes / totalBytes) * 100 : 0;
          updateTransfer(localId, {
            transferredBytes,
            totalSize: totalBytes,
            progress: Math.min(100, pct),
          });
        },
      });
      updateTransfer(localId, {
        status: 'completed',
        progress: 100,
        transferredBytes: file.size,
      });
      upsertFile(saved);
      useRoomStore.getState().adjustUsedStorage(saved.file_size);
      pushToast('success', `${file.name} berhasil diupload`, 3000);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        updateTransfer(localId, { status: 'paused' });
        return;
      }
      const message = err instanceof ApiError ? err.message : 'Upload gagal, silakan coba lagi';
      updateTransfer(localId, { status: 'failed', error: message });
      pushToast('error', `${file.name}: ${message}`);
    } finally {
      controllersRef.current.delete(localId);
    }
  };

  const enqueueUploads = (selectedFiles: File[]) => {
    const room = useRoomStore.getState().room;
    for (const file of selectedFiles) {
      if (room && file.size > room.max_file_size) {
        pushToast('error', `${file.name} melebihi batas ukuran file maksimum`);
        continue;
      }
      const localId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      filesMapRef.current.set(localId, file);
      addTransfer({
        localId,
        file,
        fileName: file.name,
        totalSize: file.size,
        transferredBytes: 0,
        progress: 0,
        status: 'queued',
        kind: 'upload',
      });
      void runUpload(localId, file);
    }
  };

  const pauseUpload = (localId: string) => {
    controllersRef.current.get(localId)?.abort();
  };

  const resumeOrRetryUpload = (localId: string) => {
    const file = filesMapRef.current.get(localId);
    if (!file) return;
    void runUpload(localId, file);
  };

  const cancelTransfer = (localId: string) => {
    controllersRef.current.get(localId)?.abort();
    filesMapRef.current.delete(localId);
    removeTransfer(localId);
  };

  const startDownload = async (file: FileItem) => {
    const localId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    addTransfer({
      localId,
      fileId: file.id,
      fileName: file.original_name,
      totalSize: file.file_size,
      transferredBytes: 0,
      progress: 0,
      status: 'downloading',
      kind: 'download',
    });

    try {
      const url = api.getFileDownloadUrl(file.id, roomCode);
      await downloadFileWithProgress(url, file.original_name, (loaded, total) => {
        const pct = total > 0 ? (loaded / total) * 100 : 100;
        updateTransfer(localId, {
          transferredBytes: loaded,
          totalSize: total,
          progress: Math.min(100, pct),
        });
      });
      updateTransfer(localId, {
        status: 'completed',
        progress: 100,
        transferredBytes: file.file_size,
      });
      pushToast('success', `${file.original_name} berhasil diunduh`, 3000);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Gagal mengunduh file';
      updateTransfer(localId, { status: 'failed', error: msg });
      pushToast('error', msg);
    }
  };

  return {
    enqueueUploads,
    pauseUpload,
    resumeOrRetryUpload,
    cancelTransfer,
    startDownload,
  };
}
