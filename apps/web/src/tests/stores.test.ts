import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRANSFER_AUTOCLOSE_MS, useFileStore } from '@/stores/file.store';
import { usePasteStore } from '@/stores/paste.store';
import { useRoomStore } from '@/stores/room.store';
import { useUIStore } from '@/stores/ui.store';

describe('Zustand stores', () => {
  beforeEach(() => {
    useRoomStore.getState().reset();
    useFileStore.getState().reset();
    usePasteStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates room state and adjusts used storage', () => {
    useRoomStore.getState().setRoom({
      id: 'r1',
      room_code: 'QWE',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      server_time: new Date().toISOString(),
      status: 'active',
      has_password: false,
      authorized: true,
      storage_limit: 10_000,
      used_storage: 1000,
      max_file_size: 5000,
    });

    useRoomStore.getState().adjustUsedStorage(500);
    expect(useRoomStore.getState().room?.used_storage).toBe(1500);
    useRoomStore.getState().adjustUsedStorage(-2000);
    expect(useRoomStore.getState().room?.used_storage).toBe(0);
  });

  it('upserts files and updates download counter', () => {
    useFileStore.getState().upsertFile({
      id: 'f1',
      room_id: 'r1',
      original_name: 'demo.txt',
      mime_type: 'text/plain',
      file_size: 120,
      download_count: 0,
      created_at: new Date().toISOString(),
    });
    useFileStore.getState().updateDownloadCount('f1', 3);
    expect(useFileStore.getState().files[0]?.download_count).toBe(3);
  });

  it('manages pastes and global toasts', () => {
    usePasteStore.getState().upsertPaste(
      {
        id: 'p1',
        room_id: 'r1',
        title: 'Hello',
        content: 'console.log(1)',
        syntax_language: 'javascript',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      true
    );
    expect(usePasteStore.getState().activePasteId).toBe('p1');
    expect(usePasteStore.getState().recentlySyncedId).toBe('p1');

    const toastId = useUIStore.getState().pushToast('success', 'Berhasil', 0);
    expect(useUIStore.getState().toasts.some((t) => t.id === toastId)).toBe(true);
    useUIStore.getState().dismissToast(toastId);
    expect(useUIStore.getState().toasts.some((t) => t.id === toastId)).toBe(false);
  });

  it('auto-closes completed transfer items after 3 seconds', () => {
    vi.useFakeTimers();
    useFileStore.getState().addTransfer({
      localId: 'up_test_1',
      fileName: 'video.mp4',
      totalSize: 1024,
      transferredBytes: 0,
      progress: 0,
      status: 'uploading',
      kind: 'upload',
    });

    useFileStore.getState().updateTransfer('up_test_1', {
      status: 'completed',
      progress: 100,
      transferredBytes: 1024,
    });
    expect(useFileStore.getState().transfers).toHaveLength(1);

    vi.advanceTimersByTime(TRANSFER_AUTOCLOSE_MS - 1);
    expect(useFileStore.getState().transfers).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(useFileStore.getState().transfers).toHaveLength(0);
  });
});
