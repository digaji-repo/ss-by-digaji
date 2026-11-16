import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Calendar,
  CheckCircle2,
  CircleAlert,
  Clock,
  Dices,
  Eye,
  EyeOff,
  Link2,
  LoaderCircle,
  Lock,
  PlusCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Checkbox, Select } from '@/components/ui/FormControls';
import { Input } from '@/components/ui/Input';
import { ApiError, api } from '@/services/api';
import { useUIStore } from '@/stores/ui.store';
import type { DurationUnit } from '@/types/room';
import { DURATION_PRESETS, isValidRoomCode, normalizeRoomCode } from '@/utils/validators';

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomThreeCharCode(): string {
  let out = '';
  for (let i = 0; i < 3; i += 1) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)] ?? 'A';
  }
  return out;
}

function computeExpiryPreview(unit: DurationUnit, value: number): string {
  const multiplier =
    unit === 'minutes' ? 60_000 : unit === 'hours' ? 3_600_000 : 86_400_000;
  const target = new Date(Date.now() + value * multiplier);
  return target.toLocaleString('id-ID', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CreateRoomForm() {
  const navigate = useNavigate();
  const pushToast = useUIStore((s) => s.pushToast);

  const [roomCode, setRoomCode] = useState<string>(() => randomThreeCharCode());
  const [availability, setAvailability] = useState<'checking' | 'available' | 'taken' | 'invalid'>(
    'available'
  );
  const [unit, setUnit] = useState<DurationUnit>('days');
  const [value, setValue] = useState<number>(3);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presets = DURATION_PRESETS[unit];

  const expiryPreview = useMemo(() => computeExpiryPreview(unit, value), [unit, value]);

  // Live debounced availability check for the 3-char code
  useEffect(() => {
    const norm = normalizeRoomCode(roomCode);
    if (!isValidRoomCode(norm)) {
      setAvailability('invalid');
      return;
    }

    let cancelled = false;
    setAvailability('checking');

    const timer = window.setTimeout(async () => {
      try {
        await api.getRoom(norm);
        if (!cancelled) setAvailability('taken');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          setAvailability('available');
        } else {
          setAvailability('available');
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [roomCode]);

  const handleUnitChange = (nextUnit: DurationUnit) => {
    setUnit(nextUnit);
    setValue(DURATION_PRESETS[nextUnit][0]);
  };

  const handleRandomize = () => {
    setError(null);
    let next = randomThreeCharCode();
    if (next === roomCode) next = randomThreeCharCode();
    setRoomCode(next);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalized = normalizeRoomCode(roomCode);
    if (!isValidRoomCode(normalized)) {
      setError('Kode room harus tepat 3 karakter (A–Z dan 0–9).');
      return;
    }
    if (usePassword && password.trim().length === 0) {
      setError('Masukkan password room atau matikan opsi proteksi password.');
      return;
    }

    setLoading(true);
    try {
      const room = await api.createRoom({
        room_code: normalized,
        duration_unit: unit,
        duration_value: value,
        password: usePassword ? password : undefined,
      });
      pushToast('success', `Room ${room.room_code} berhasil dibuat`);
      navigate(`/z/${room.room_code}`);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Gagal membuat room. Pastikan server aktif.';
      setError(msg);
      pushToast('error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Kode Room + Acak Button */}
      <div className="space-y-2">
        <label className="text-[12.5px] font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
          <Link2 size={14} strokeWidth={2} className="text-[var(--color-text-secondary)]" />
          Kode Room (3 karakter)
        </label>

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              value={roomCode}
              onChange={(e) => {
                setRoomCode(normalizeRoomCode(e.target.value));
                setError(null);
              }}
              maxLength={3}
              placeholder="7KF"
              className="font-mono uppercase tracking-[0.2em] font-bold text-[15px]"
            />
          </div>

          <Button
            variant="secondary"
            onClick={handleRandomize}
            leftIcon={<Dices size={15} strokeWidth={1.9} />}
            className="h-10 px-3.5 shrink-0"
          >
            Acak
          </Button>
        </div>

        {/* Availability indicator */}
        <div className="flex items-center gap-1.5 text-[12px] min-h-[18px]">
          {availability === 'checking' && (
            <span className="inline-flex items-center gap-1.5 text-[var(--color-text-secondary)]">
              <LoaderCircle size={13} strokeWidth={2} className="animate-spin" />
              Memeriksa ketersediaan...
            </span>
          )}
          {availability === 'available' && (
            <span className="inline-flex items-center gap-1.5 text-[#0F8A64] dark:text-[var(--color-accent)] font-medium">
              <CheckCircle2 size={14} strokeWidth={2.2} />
              Kode tersedia
            </span>
          )}
          {availability === 'taken' && (
            <span className="inline-flex items-center gap-1.5 text-[var(--color-warning)] font-medium">
              <CircleAlert size={14} strokeWidth={2.1} />
              Kode sedang dipakai — klik Acak atau ketik kode lain
            </span>
          )}
          {availability === 'invalid' && (
            <span className="inline-flex items-center gap-1.5 text-[var(--color-text-secondary)]">
              Masukkan 3 karakter A–Z atau 0–9
            </span>
          )}
        </div>
      </div>

      {/* Masa Berlaku Room */}
      <div className="space-y-2">
        <label className="text-[12.5px] font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
          <Clock size={14} strokeWidth={2} className="text-[var(--color-text-secondary)]" />
          Masa Berlaku Room{' '}
          <span className="font-normal text-[var(--color-text-secondary)]">(maks. 7 hari)</span>
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-[88px_112px_1fr] gap-2 items-stretch">
          <Select
            aria-label="Nilai Durasi"
            value={String(value)}
            onChange={(e) => setValue(Number(e.target.value))}
            className="h-10 font-semibold"
            options={presets.map((p) => ({ value: String(p), label: String(p) }))}
          />

          <Select
            aria-label="Satuan Durasi"
            value={unit}
            onChange={(e) => handleUnitChange(e.target.value as DurationUnit)}
            className="h-10 font-semibold"
            options={[
              { value: 'minutes', label: 'Menit' },
              { value: 'hours', label: 'Jam' },
              { value: 'days', label: 'Hari' },
            ]}
          />

          <div className="col-span-2 sm:col-span-1 rounded-[10px] border border-[#30D5A0]/25 bg-[#30D5A0]/10 dark:bg-[#30D5A0]/12 px-3 py-1.5 flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-[8px] bg-[#30D5A0]/18 text-[#0F8A64] dark:text-[var(--color-accent)] flex items-center justify-center shrink-0">
              <Calendar size={14} strokeWidth={2} />
            </span>
            <div className="leading-tight min-w-0">
              <span className="block text-[10.5px] text-[var(--color-text-secondary)]">
                Berakhir pada
              </span>
              <span className="block text-[12px] font-semibold text-[var(--color-text-primary)] truncate">
                {expiryPreview}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Optional Password */}
      <div className="space-y-2 pt-0.5">
        <Checkbox
          checked={usePassword}
          onChange={(e) => setUsePassword(e.target.checked)}
          label={
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-text-secondary)]">
              <Lock size={13} strokeWidth={1.9} />
              Proteksi dengan password opsional
            </span>
          }
        />

        <AnimatePresence initial={false}>
          {usePassword && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password room"
                rightAddon={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff size={16} strokeWidth={1.9} />
                    ) : (
                      <Eye size={16} strokeWidth={1.9} />
                    )}
                  </button>
                }
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && (
        <div className="rounded-[10px] bg-[var(--color-danger)]/12 border border-[var(--color-danger)]/30 px-3 py-2 text-[12.5px] text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <Button
        type="submit"
        loading={loading}
        leftIcon={<PlusCircle size={17} strokeWidth={2} />}
        className="w-full h-11 rounded-[12px] text-[14px] font-semibold"
      >
        Buat Room
      </Button>
    </form>
  );
}
