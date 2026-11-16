import { useState, type FormEvent } from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ApiError, api } from '@/services/api';
import { useUIStore } from '@/stores/ui.store';
import { isValidRoomCode, normalizeRoomCode } from '@/utils/validators';

export function JoinRoomForm() {
  const navigate = useNavigate();
  const pushToast = useUIStore((s) => s.pushToast);

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalized = normalizeRoomCode(code);
    if (!isValidRoomCode(normalized)) {
      setError('Masukkan tepat 3 karakter kode room (A–Z, 0–9).');
      return;
    }

    setLoading(true);
    try {
      await api.getRoom(normalized);
      navigate(`/z/${normalized}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 410) {
          navigate(`/z/${normalized}`);
          return;
        }
        if (err.status === 404) {
          setError(`Room ${normalized} tidak ditemukan.`);
          pushToast('error', `Room ${normalized} tidak ditemukan`);
          return;
        }
        setError(err.message);
        pushToast('error', err.message);
      } else {
        setError('Gagal menghubungi server.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleJoin} className="space-y-4">
      <Input
        label="Kode Room (3 Karakter)"
        value={code}
        onChange={(e) => {
          setCode(normalizeRoomCode(e.target.value));
          setError(null);
        }}
        maxLength={3}
        placeholder="7KF"
        leftAddon={<KeyRound size={16} strokeWidth={1.9} />}
        className="font-mono uppercase tracking-[0.35em] text-center font-bold text-[16px]"
        hint="Contoh: 7KF atau QWE. Anda juga bisa membuka langsung /z/KODE."
        error={error ?? undefined}
      />

      <Button
        type="submit"
        loading={loading}
        leftIcon={<LogIn size={16} strokeWidth={2} />}
        className="w-full h-11 rounded-[12px] text-[14px] font-semibold"
      >
        Masuk Room
      </Button>
    </form>
  );
}
