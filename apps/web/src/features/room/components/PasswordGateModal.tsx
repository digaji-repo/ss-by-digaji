import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ApiError, api } from '@/services/api';
import { useUIStore } from '@/stores/ui.store';
import type { RoomInfo } from '@/types/room';

interface PasswordGateModalProps {
  open: boolean;
  roomCode: string;
  onUnlocked: (room: RoomInfo) => void;
  onBackHome: () => void;
}

export function PasswordGateModal({
  open,
  roomCode,
  onUnlocked,
  onBackHome,
}: PasswordGateModalProps) {
  const pushToast = useUIStore((s) => s.pushToast);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Masukkan password room.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const unlocked = await api.validateRoom(roomCode, password);
      pushToast('success', `Berhasil masuk ke room ${unlocked.room_code}`);
      onUnlocked(unlocked);
    } catch (err) {
      if (err instanceof ApiError) {
        const suffix =
          typeof err.remainingAttempts === 'number'
            ? ` (${err.remainingAttempts} percobaan tersisa)`
            : '';
        setError(`${err.message}${suffix}`);
      } else {
        setError('Gagal memverifikasi password.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onBackHome} closeOnBackdrop={false} showCloseButton={false} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4 text-center">
        <div className="w-11 h-11 rounded-full bg-[var(--color-primary)]/14 text-[var(--color-primary)] flex items-center justify-center mx-auto">
          <Lock size={20} strokeWidth={1.9} />
        </div>

        <div>
          <h2 className="text-[17px] font-semibold text-[var(--color-text-primary)]">
            Room {roomCode} Terkunci
          </h2>
          <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-1">
            Masukkan password room untuk mengakses file dan paste di dalamnya.
          </p>
        </div>

        <div className="text-left">
          <Input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password room"
            error={error ?? undefined}
            rightAddon={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label="Toggle password visibility"
                className="text-[var(--color-text-secondary)] cursor-pointer"
              >
                {showPassword ? <EyeOff size={16} strokeWidth={1.9} /> : <Eye size={16} strokeWidth={1.9} />}
              </button>
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="secondary" onClick={onBackHome}>
            Kembali
          </Button>
          <Button type="submit" loading={loading}>
            Buka Room
          </Button>
        </div>
      </form>
    </Modal>
  );
}
