import { useState } from 'react';
import { LogOut, Trash2, TriangleAlert } from 'lucide-react';
import { useUIStore } from '@/stores/ui.store';
import { Modal } from './Modal';
import { Button } from './Button';

export function GlobalDialogHost() {
  const confirmDialog = useUIStore((s) => s.confirmDialog);
  const closeConfirm = useUIStore((s) => s.closeConfirm);
  const alertDialog = useUIStore((s) => s.alertDialog);
  const closeAlert = useUIStore((s) => s.closeAlert);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (!confirmDialog) return;
    setBusy(true);
    try {
      await confirmDialog.onConfirm();
      closeConfirm();
    } finally {
      setBusy(false);
    }
  };

  const Icon =
    confirmDialog?.icon === 'logout'
      ? LogOut
      : confirmDialog?.icon === 'warning'
        ? TriangleAlert
        : Trash2;

  return (
    <>
      <Modal
        open={Boolean(confirmDialog)}
        onClose={busy ? () => {} : closeConfirm}
        size="sm"
        showCloseButton={false}
        closeOnBackdrop={!busy}
      >
        {confirmDialog && (
          <div className="flex flex-col items-center text-center pt-1">
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center mb-3 ${
                confirmDialog.variant === 'primary'
                  ? 'bg-[var(--color-primary)]/14 text-[var(--color-primary)]'
                  : 'bg-[var(--color-danger)]/14 text-[var(--color-danger)]'
              }`}
            >
              <Icon size={20} strokeWidth={1.9} />
            </div>
            <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
              {confirmDialog.title}
            </h3>
            <p className="text-[13px] text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
              {confirmDialog.description}
            </p>
            <div className="grid grid-cols-2 gap-2.5 w-full mt-5">
              <Button variant="secondary" disabled={busy} onClick={closeConfirm}>
                {confirmDialog.cancelLabel ?? 'Batal'}
              </Button>
              <Button
                variant={confirmDialog.variant === 'primary' ? 'primary' : 'danger'}
                loading={busy}
                onClick={handleConfirm}
              >
                {confirmDialog.confirmLabel ?? 'Konfirmasi'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(alertDialog)} onClose={closeAlert} size="sm" showCloseButton={false}>
        {alertDialog && (
          <div className="flex flex-col items-center text-center pt-1">
            <div className="w-11 h-11 rounded-full flex items-center justify-center mb-3 bg-[var(--color-warning)]/14 text-[var(--color-warning)]">
              <TriangleAlert size={20} strokeWidth={1.9} />
            </div>
            <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">
              {alertDialog.title}
            </h3>
            <p className="text-[13px] text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
              {alertDialog.description}
            </p>
            <Button variant="primary" className="w-full mt-5" onClick={closeAlert}>
              {alertDialog.buttonLabel ?? 'Mengerti'}
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
