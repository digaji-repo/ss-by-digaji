import { useCallback, useEffect } from 'react';
import { ApiError, api } from '@/services/api';
import { useFileStore } from '@/stores/file.store';
import { usePasteStore } from '@/stores/paste.store';
import { useRoomStore } from '@/stores/room.store';
import type { RoomInfo } from '@/types/room';

export function useRoomLoader(code: string | undefined) {
  const setRoom = useRoomStore((s) => s.setRoom);
  const setLoading = useRoomStore((s) => s.setLoading);
  const setError = useRoomStore((s) => s.setError);
  const setExpired = useRoomStore((s) => s.setExpired);
  const setNotFound = useRoomStore((s) => s.setNotFound);
  const setEvents = useRoomStore((s) => s.setEvents);
  const resetRoom = useRoomStore((s) => s.reset);

  const setFiles = useFileStore((s) => s.setFiles);
  const setFilesLoading = useFileStore((s) => s.setLoading);
  const resetFiles = useFileStore((s) => s.reset);

  const setPastes = usePasteStore((s) => s.setPastes);
  const setPastesLoading = usePasteStore((s) => s.setLoading);
  const resetPastes = usePasteStore((s) => s.reset);

  const loadWorkspaceData = useCallback(
    async (roomCode: string) => {
      setFilesLoading(true);
      setPastesLoading(true);
      try {
        const [files, pastes, events] = await Promise.all([
          api.listFiles(roomCode),
          api.listPastes(roomCode),
          api.listEvents(roomCode),
        ]);
        setFiles(files);
        setPastes(pastes);
        setEvents(events);
      } catch (err) {
        if (err instanceof ApiError && err.status === 410) {
          setExpired(true);
        }
      } finally {
        setFilesLoading(false);
        setPastesLoading(false);
      }
    },
    [setEvents, setExpired, setFiles, setFilesLoading, setPastes, setPastesLoading]
  );

  const initializeRoom = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    setError(null);
    try {
      const info = await api.getRoom(code);
      setRoom(info);
      if (info.authorized && info.status === 'active') {
        await loadWorkspaceData(info.room_code);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 410) {
          setExpired(true);
          return;
        }
        if (err.status === 404 || err.status === 400) {
          setNotFound(true);
          return;
        }
        setError(err.message);
      } else {
        setError('Gagal terhubung ke server DropRoom.');
      }
    } finally {
      setLoading(false);
    }
  }, [code, loadWorkspaceData, setError, setExpired, setLoading, setNotFound, setRoom]);

  useEffect(() => {
    resetRoom();
    resetFiles();
    resetPastes();
    void initializeRoom();
    return () => {
      resetRoom();
      resetFiles();
      resetPastes();
    };
  }, [code, initializeRoom, resetFiles, resetPastes, resetRoom]);

  const handleUnlocked = useCallback(
    async (unlockedRoom: RoomInfo) => {
      setRoom(unlockedRoom);
      await loadWorkspaceData(unlockedRoom.room_code);
    },
    [loadWorkspaceData, setRoom]
  );

  return { reload: initializeRoom, handleUnlocked };
}
