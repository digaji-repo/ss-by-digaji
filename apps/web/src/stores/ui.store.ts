import { create } from 'zustand';
import type {
  AlertDialogOptions,
  ConfirmDialogOptions,
  ThemeMode,
  ToastItem,
  ToastType,
  WorkspaceTab,
} from '@/types/ui';

function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('droproom_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {
    // Default light
  }
  return 'light';
}

interface UIState {
  theme: ThemeMode;
  activeTab: WorkspaceTab;
  showRightPanel: boolean;
  isOffline: boolean;
  toasts: ToastItem[];
  confirmDialog: ConfirmDialogOptions | null;
  alertDialog: AlertDialogOptions | null;
  settingsOpen: boolean;
  shareOpen: boolean;

  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setActiveTab: (tab: WorkspaceTab) => void;
  setShowRightPanel: (show: boolean) => void;
  setIsOffline: (offline: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setShareOpen: (open: boolean) => void;

  pushToast: (type: ToastType, message: string, durationMs?: number) => string;
  updateToast: (id: string, type: ToastType, message: string, durationMs?: number) => void;
  dismissToast: (id: string) => void;

  openConfirm: (options: ConfirmDialogOptions) => void;
  closeConfirm: () => void;
  openAlert: (options: AlertDialogOptions) => void;
  closeAlert: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  theme: getInitialTheme(),
  activeTab: 'files',
  showRightPanel: true,
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  toasts: [],
  confirmDialog: null,
  alertDialog: null,
  settingsOpen: false,
  shareOpen: false,

  setTheme: (theme) => {
    try {
      localStorage.setItem('droproom_theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
    } catch {
      // Ignore
    }
    set({ theme });
  },

  toggleTheme: () => {
    const next: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },

  setActiveTab: (activeTab) => set({ activeTab }),
  setShowRightPanel: (showRightPanel) => set({ showRightPanel }),
  setIsOffline: (isOffline) => set({ isOffline }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setShareOpen: (shareOpen) => set({ shareOpen }),

  pushToast: (type, message, durationMs) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const resolvedDuration = durationMs ?? (type === 'loading' ? 0 : 3500);
    set((state) => ({
      toasts: [...state.toasts.slice(-4), { id, type, message, durationMs: resolvedDuration }],
    }));
    if (resolvedDuration > 0) {
      window.setTimeout(() => {
        get().dismissToast(id);
      }, resolvedDuration);
    }
    return id;
  },

  updateToast: (id, type, message, durationMs = 3500) => {
    set((state) => ({
      toasts: state.toasts.map((t) =>
        t.id === id ? { ...t, type, message, durationMs } : t
      ),
    }));
    if (durationMs > 0) {
      window.setTimeout(() => {
        get().dismissToast(id);
      }, durationMs);
    }
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  openConfirm: (confirmDialog) => set({ confirmDialog }),
  closeConfirm: () => set({ confirmDialog: null }),
  openAlert: (alertDialog) => set({ alertDialog }),
  closeAlert: () => set({ alertDialog: null }),
}));
