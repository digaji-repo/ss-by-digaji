export type ThemeMode = 'light' | 'dark';

export type WorkspaceTab = 'files' | 'pastes' | 'activity';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  durationMs?: number;
}

export interface ConfirmDialogOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  icon?: 'trash' | 'logout' | 'warning';
  onConfirm: () => Promise<void> | void;
}

export interface AlertDialogOptions {
  title: string;
  description: string;
  buttonLabel?: string;
}
