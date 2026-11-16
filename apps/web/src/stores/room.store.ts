import { create } from 'zustand';
import type { PeerPresence, RoomEventRecord, RoomInfo } from '@/types/room';
import type { ConnectionState } from '@/services/websocket';

interface RoomState {
  room: RoomInfo | null;
  serverOffsetMs: number;
  peers: PeerPresence[];
  selfPeerId: string | null;
  events: RoomEventRecord[];
  wsState: ConnectionState;
  expiringWarningShown: boolean;
  isExpired: boolean;
  isNotFound: boolean;
  needsPassword: boolean;
  loading: boolean;
  error: string | null;

  setRoom: (room: RoomInfo) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setNeedsPassword: (needs: boolean) => void;
  setExpired: (expired: boolean) => void;
  setNotFound: (notFound: boolean) => void;
  setWsState: (wsState: ConnectionState) => void;
  setPeers: (peers: PeerPresence[], selfPeerId?: string) => void;
  setEvents: (events: RoomEventRecord[]) => void;
  appendEvent: (event: RoomEventRecord) => void;
  setExpiringWarningShown: (shown: boolean) => void;
  adjustUsedStorage: (deltaBytes: number) => void;
  reset: () => void;
}

const initialState = {
  room: null,
  serverOffsetMs: 0,
  peers: [] as PeerPresence[],
  selfPeerId: null,
  events: [] as RoomEventRecord[],
  wsState: 'disconnected' as ConnectionState,
  expiringWarningShown: false,
  isExpired: false,
  isNotFound: false,
  needsPassword: false,
  loading: false,
  error: null,
};

export const useRoomStore = create<RoomState>((set) => ({
  ...initialState,

  setRoom: (room) =>
    set(() => {
      const serverTimeMs = new Date(room.server_time).getTime();
      const offset = Number.isFinite(serverTimeMs) ? serverTimeMs - Date.now() : 0;
      return {
        room,
        serverOffsetMs: offset,
        needsPassword: room.has_password && !room.authorized,
        isExpired: room.status === 'expired',
        isNotFound: false,
        error: null,
      };
    }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setNeedsPassword: (needsPassword) => set({ needsPassword }),
  setExpired: (isExpired) => set({ isExpired }),
  setNotFound: (isNotFound) => set({ isNotFound }),
  setWsState: (wsState) => set({ wsState }),

  setPeers: (peers, selfPeerId) =>
    set((state) => ({
      peers,
      selfPeerId: selfPeerId ?? state.selfPeerId,
    })),

  setEvents: (events) => set({ events }),

  appendEvent: (event) =>
    set((state) => {
      const exists = state.events.some((item) => item.id === event.id);
      if (exists) return state;
      const next = [...state.events, event];
      return { events: next.slice(-60) };
    }),

  setExpiringWarningShown: (expiringWarningShown) => set({ expiringWarningShown }),

  adjustUsedStorage: (deltaBytes) =>
    set((state) => {
      if (!state.room) return state;
      return {
        room: {
          ...state.room,
          used_storage: Math.max(0, state.room.used_storage + deltaBytes),
        },
      };
    }),

  reset: () => set({ ...initialState }),
}));
