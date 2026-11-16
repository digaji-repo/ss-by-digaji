import { useState, type FormEvent } from 'react';
import { FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { WORD_DOCX_MIME } from '@/utils/validators';

interface CreateWordModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (file: File) => Promise<void>;
}

export function CreateWordModal({ open, onClose, onCreate }: CreateWordModalProps) {
  const [title, setTitle] = useState('Dokumen Baru');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (creating) return;
    const base = title.trim() || 'Dokumen Baru';
    const fileName = /\.docx$/i.test(base) ? base : `${base}.docx`;
    setCreating(true);
    try {
      const { createEmptyDocxBlob } = await import('@/features/files/services/wordDocx');
      const blob = await createEmptyDocxBlob(base);
      const file = new File([blob], fileName, { type: WORD_DOCX_MIME });
      await onCreate(file);
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={creating ? () => {} : onClose}
      closeOnBackdrop={!creating}
      size="sm"
      title="Buat Dokumen Word (.docx)"
      description="Buat file Word kosong lalu langsung edit dan bagikan di room ini."
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <Input
          label="Nama Dokumen"
          placeholder="Contoh: Laporan Mingguan"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
          autoFocus
        />

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" type="button" disabled={creating} onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={creating}
            leftIcon={<FilePlus2 size={15} strokeWidth={2} />}
          >
            Buat &amp; Buka Editor
          </Button>
        </div>
      </form>
    </Modal>
  );
}
