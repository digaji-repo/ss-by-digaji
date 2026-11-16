import { create } from 'zustand';
import type { FileItem, FileTransferItem } from '@/types/file';

export const TRANSFER_AUTOCLOSE_MS = 3000;

const transferAutoCloseTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTransferTimer(localId: string) {
  const existing = transferAutoCloseTimers.get(localId);
  if (existing !== undefined) {
    clearTimeout(existing);
    transferAutoCloseTimers.delete(localId);
  }
}

function clearAllTransferTimers() {
  for (const timer of transferAutoCloseTimers.values()) {
    clearTimeout(timer);
  }
  transferAutoCloseTimers.clear();
}

interface FileState {
  files: FileItem[];
  transfers: FileTransferItem[];
  loading: boolean;
  previewFile: FileItem | null;
  editingFile: FileItem | null;
  wordEditingFile: FileItem | null;
  renamingFile: FileItem | null;
  fileRevisions: Record<string, number>;

  setFiles: (files: FileItem[]) => void;
  setLoading: (loading: boolean) => void;
  upsertFile: (file: FileItem) => void;
  removeFile: (fileId: string) => void;
  updateDownloadCount: (fileId: string, downloadCount: number) => void;
  setPreviewFile: (file: FileItem | null) => void;
  setEditingFile: (file: FileItem | null) => void;
  setWordEditingFile: (file: FileItem | null) => void;
  setRenamingFile: (file: FileItem | null) => void;

  addTransfer: (transfer: FileTransferItem) => void;
  updateTransfer: (localId: string, patch: Partial<FileTransferItem>) => void;
  removeTransfer: (localId: string) => void;
  clearCompletedTransfers: () => void;
  reset: () => void;
}

export const useFileStore = create<FileState>((set, get) => ({
  files: [],
  transfers: [],
  loading: false,
  previewFile: null,
  editingFile: null,
  wordEditingFile: null,
  renamingFile: null,
  fileRevisions: {},

  setFiles: (files) => set({ files }),
  setLoading: (loading) => set({ loading }),

  upsertFile: (file) =>
    set((state) => {
      const idx = state.files.findIndex((item) => item.id === file.id);
      if (idx >= 0) {
        const next = [...state.files];
        next[idx] = file;
        const nextRev = (state.fileRevisions[file.id] ?? 0) + 1;
        return {
          files: next,
          fileRevisions: { ...state.fileRevisions, [file.id]: nextRev },
          previewFile: state.previewFile?.id === file.id ? file : state.previewFile,
          editingFile: state.editingFile?.id === file.id ? file : state.editingFile,
          wordEditingFile: state.wordEditingFile?.id === file.id ? file : state.wordEditingFile,
          renamingFile: state.renamingFile?.id === file.id ? file : state.renamingFile,
        };
      }
      return { files: [file, ...state.files] };
    }),

  removeFile: (fileId) =>
    set((state) => ({
      files: state.files.filter((item) => item.id !== fileId),
      previewFile: state.previewFile?.id === fileId ? null : state.previewFile,
      editingFile: state.editingFile?.id === fileId ? null : state.editingFile,
      wordEditingFile: state.wordEditingFile?.id === fileId ? null : state.wordEditingFile,
      renamingFile: state.renamingFile?.id === fileId ? null : state.renamingFile,
    })),

  updateDownloadCount: (fileId, downloadCount) =>
    set((state) => ({
      files: state.files.map((item) =>
        item.id === fileId ? { ...item, download_count: downloadCount } : item
      ),
    })),

  setPreviewFile: (previewFile) => set({ previewFile }),
  setEditingFile: (editingFile) => set({ editingFile }),
  setWordEditingFile: (wordEditingFile) => set({ wordEditingFile }),
  setRenamingFile: (renamingFile) => set({ renamingFile }),

  addTransfer: (transfer) =>
    set((state) => ({
      transfers: [transfer, ...state.transfers],
    })),

  updateTransfer: (localId, patch) => {
    set((state) => ({
      transfers: state.transfers.map((item) =>
        item.localId === localId ? { ...item, ...patch } : item
      ),
    }));
    if (patch.status === 'completed') {
      clearTransferTimer(localId);
      const timer = setTimeout(() => {
        transferAutoCloseTimers.delete(localId);
        get().removeTransfer(localId);
      }, TRANSFER_AUTOCLOSE_MS);
      transferAutoCloseTimers.set(localId, timer);
    } else if (patch.status !== undefined) {
      clearTransferTimer(localId);
    }
  },

  removeTransfer: (localId) => {
    clearTransferTimer(localId);
    set((state) => ({
      transfers: state.transfers.filter((item) => item.localId !== localId),
    }));
  },

  clearCompletedTransfers: () => {
    for (const item of get().transfers) {
      if (item.status === 'completed') {
        clearTransferTimer(item.localId);
      }
    }
    set((state) => ({
      transfers: state.transfers.filter((item) => item.status !== 'completed'),
    }));
  },

  reset: () => {
    clearAllTransferTimers();
    set({
      files: [],
      transfers: [],
      loading: false,
      previewFile: null,
      editingFile: null,
      wordEditingFile: null,
      renamingFile: null,
      fileRevisions: {},
    });
  },
}));
