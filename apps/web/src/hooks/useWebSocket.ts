import { useEffect, useRef } from 'react';
import { RoomWebSocketClient } from '@/services/websocket';
import { useFileStore } from '@/stores/file.store';
import { usePasteStore } from '@/stores/paste.store';
import { useRoomStore } from '@/stores/room.store';
import { useUIStore } from '@/stores/ui.store';
import type { FileItem } from '@/types/file';
import type { PasteItem } from '@/types/paste';
import type { PeerPresence, WebSocketEnvelope } from '@/types/room';

function getOrCreatePeerId(): string {
  try {
    const existing = sessionStorage.getItem('droproom_peer_id');
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `peer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('droproom_peer_id', generated);
    return generated;
  } catch {
    return `peer_${Date.now()}`;
  }
}

export function useRoomWebSocket(roomCode: string | undefined, enabled: boolean) {
  const clientRef = useRef<RoomWebSocketClient | null>(null);

  useEffect(() => {
    if (!roomCode || !enabled) return;

    const peerId = getOrCreatePeerId();
    const roomStore = useRoomStore.getState();
    const fileStore = useFileStore.getState();
    const pasteStore = usePasteStore.getState();
    const uiStore = useUIStore.getState();

    const handleEnvelope = (env: WebSocketEnvelope) => {
      const payload = (env.payload ?? {}) as Record<string, unknown>;
      const eventRecord = {
        id: `${env.type}_${env.timestamp}_${Math.random().toString(36).slice(2, 7)}`,
        room_id: env.room_id,
        event_type: env.type,
        metadata: payload,
        created_at: env.timestamp || new Date().toISOString(),
      };

      switch (env.type) {
        case 'room.joined': {
          const selfPeer = payload.self as PeerPresence | undefined;
          const peers = (payload.peers as PeerPresence[] | undefined) ?? [];
          roomStore.setPeers(peers, selfPeer?.peer_id);
          break;
        }
        case 'room.user_online':
        case 'room.user_left': {
          const peers = (payload.peers as PeerPresence[] | undefined) ?? [];
          const peer = payload.peer as PeerPresence | undefined;
          roomStore.setPeers(peers);
          roomStore.appendEvent({
            ...eventRecord,
            metadata: peer ? { label: peer.label, peer_id: peer.peer_id } : payload,
          });
          break;
        }
        case 'room.expiring': {
          roomStore.appendEvent(eventRecord);
          if (!useRoomStore.getState().expiringWarningShown) {
            roomStore.setExpiringWarningShown(true);
            uiStore.pushToast('warning', 'Room akan segera berakhir dalam beberapa menit');
          }
          break;
        }
        case 'room.expired': {
          roomStore.appendEvent(eventRecord);
          roomStore.setExpired(true);
          uiStore.pushToast('warning', 'Masa berlaku room telah berakhir');
          break;
        }
        case 'file.upload_started': {
          roomStore.appendEvent(eventRecord);
          break;
        }
        case 'file.upload_completed': {
          const file = payload as unknown as FileItem;
          const existed = useFileStore.getState().files.some((item) => item.id === file.id);
          fileStore.upsertFile(file);
          if (!existed && typeof file.file_size === 'number') {
            roomStore.adjustUsedStorage(file.file_size);
          }
          roomStore.appendEvent(eventRecord);
          break;
        }
        case 'file.updated': {
          const file = payload as unknown as FileItem;
          const prev = useFileStore.getState().files.find((item) => item.id === file.id);
          fileStore.upsertFile(file);
          if (prev && typeof file.file_size === 'number') {
            const delta = file.file_size - prev.file_size;
            if (delta !== 0) roomStore.adjustUsedStorage(delta);
          }
          roomStore.appendEvent(eventRecord);
          break;
        }
        case 'file.deleted': {
          const fileId = typeof payload.id === 'string' ? payload.id : '';
          const existing = useFileStore.getState().files.find((item) => item.id === fileId);
          if (existing) {
            roomStore.adjustUsedStorage(-existing.file_size);
          }
          if (fileId) fileStore.removeFile(fileId);
          roomStore.appendEvent(eventRecord);
          break;
        }
        case 'file.downloaded': {
          const fileId = typeof payload.file_id === 'string' ? payload.file_id : '';
          const count =
            typeof payload.download_count === 'number' ? payload.download_count : undefined;
          if (fileId && typeof count === 'number') {
            fileStore.updateDownloadCount(fileId, count);
          }
          roomStore.appendEvent(eventRecord);
          break;
        }
        case 'paste.created':
        case 'paste.updated': {
          const paste = payload as unknown as PasteItem;
          if (paste?.id) {
            pasteStore.upsertPaste(paste, true);
          }
          roomStore.appendEvent(eventRecord);
          break;
        }
        case 'paste.deleted': {
          const pasteId = typeof payload.id === 'string' ? payload.id : '';
          if (pasteId) pasteStore.removePaste(pasteId);
          roomStore.appendEvent(eventRecord);
          break;
        }
      }
    };

    const client = new RoomWebSocketClient(roomCode, peerId, {
      onStateChange: (wsState) => useRoomStore.getState().setWsState(wsState),
      onMessage: handleEnvelope,
      onAuthError: (statusCode) => {
        if (statusCode === 410) {
          useRoomStore.getState().setExpired(true);
        }
      },
    });

    clientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [roomCode, enabled]);
}
