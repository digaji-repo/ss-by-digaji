import { create } from 'zustand';
import type { PasteItem } from '@/types/paste';

interface PasteState {
  pastes: PasteItem[];
  activePasteId: string | null;
  recentlySyncedId: string | null;
  loading: boolean;

  setPastes: (pastes: PasteItem[]) => void;
  setLoading: (loading: boolean) => void;
  setActivePasteId: (id: string | null) => void;
  upsertPaste: (paste: PasteItem, fromRealtime?: boolean) => void;
  removePaste: (pasteId: string) => void;
  clearRecentlySynced: () => void;
  reset: () => void;
}

export const usePasteStore = create<PasteState>((set) => ({
  pastes: [],
  activePasteId: null,
  recentlySyncedId: null,
  loading: false,

  setPastes: (pastes) =>
    set((state) => ({
      pastes,
      activePasteId:
        state.activePasteId && pastes.some((p) => p.id === state.activePasteId)
          ? state.activePasteId
          : (pastes[0]?.id ?? null),
    })),

  setLoading: (loading) => set({ loading }),
  setActivePasteId: (activePasteId) => set({ activePasteId }),

  upsertPaste: (paste, fromRealtime = false) =>
    set((state) => {
      const idx = state.pastes.findIndex((p) => p.id === paste.id);
      let next: PasteItem[];
      if (idx >= 0) {
        next = [...state.pastes];
        next[idx] = paste;
      } else {
        next = [paste, ...state.pastes];
      }
      return {
        pastes: next,
        activePasteId: state.activePasteId ?? paste.id,
        recentlySyncedId: fromRealtime ? paste.id : state.recentlySyncedId,
      };
    }),

  removePaste: (pasteId) =>
    set((state) => {
      const next = state.pastes.filter((p) => p.id !== pasteId);
      const nextActive =
        state.activePasteId === pasteId ? (next[0]?.id ?? null) : state.activePasteId;
      return {
        pastes: next,
        activePasteId: nextActive,
      };
    }),

  clearRecentlySynced: () => set({ recentlySyncedId: null }),
  reset: () => set({ pastes: [], activePasteId: null, recentlySyncedId: null, loading: false }),
}));
