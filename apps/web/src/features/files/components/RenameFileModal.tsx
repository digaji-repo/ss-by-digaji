import { useEffect, useState, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ApiError, api } from '@/services/api';
import { useFileStore } from '@/stores/file.store';
import { useUIStore } from '@/stores/ui.store';
import type { FileItem } from '@/types/file';

interface RenameFileModalProps {
  file: FileItem | null;
  roomCode: string;
  onClose: () => void;
}

export function RenameFileModal({ file, roomCode, onClose }: RenameFileModalProps) {
  const upsertFile = useFileStore((s) => s.upsertFile);
  const pushToast = useUIStore((s) => s.pushToast);

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      setName(file.original_name);
      setError(null);
    }
  }, [file]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Nama file tidak boleh kosong.');
      return;
    }
    if (trimmed === file.original_name) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await api.renameFile(file.id, roomCode, trimmed);
      upsertFile(updated);
      pushToast('success', `Nama file diubah menjadi ${updated.original_name}`);
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Gagal mengubah nama file.';
      setError(msg);
      pushToast('error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(file)}
      onClose={saving ? () => {} : onClose}
      closeOnBackdrop={!saving}
      size="sm"
      title="Ubah Nama File"
      description="Ubah nama atau ekstensi file teks/kode di dalam room ini."
    >
      {file && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nama File Baru"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            leftAddon={<Pencil size={15} strokeWidth={1.9} />}
            placeholder="contoh: catatan.md atau config.json"
            error={error ?? undefined}
          />

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" disabled={saving} onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" loading={saving}>
              Simpan Nama
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
