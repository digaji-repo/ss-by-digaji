import { Clock, Home, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AmbientBackground } from '@/components/layout/AmbientBackground';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/CardAndTabs';

interface RoomStatusPageProps {
  code?: string;
}

export function RoomExpiredPage({ code }: RoomStatusPageProps) {
  const navigate = useNavigate();

  return (
    <AmbientBackground>
      <div className="flex-1 flex items-center justify-center p-4">
        <Card intensity="strong" padding="standard" className="max-w-md w-full text-center space-y-4 rounded-[20px]">
          <div className="w-12 h-12 rounded-full bg-[var(--color-warning)]/15 text-[var(--color-warning)] flex items-center justify-center mx-auto">
            <Clock size={22} strokeWidth={1.9} />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-[20px] font-bold text-[var(--color-text-primary)]">
              Room {code ? `${code} ` : ''}Telah Kedaluwarsa
            </h1>
            <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
              Masa berlaku room sementara ini telah berakhir. Seluruh file dan paste di dalamnya
              sudah dibersihkan secara otomatis.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <Button
              variant="secondary"
              className="flex-1"
              leftIcon={<Home size={15} strokeWidth={1.9} />}
              onClick={() => navigate('/')}
            >
              Ke Beranda
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              leftIcon={<Plus size={15} strokeWidth={1.9} />}
              onClick={() => navigate('/')}
            >
              Buat Room Baru
            </Button>
          </div>
        </Card>
      </div>
    </AmbientBackground>
  );
}

export function RoomNotFoundPage({ code }: RoomStatusPageProps) {
  const navigate = useNavigate();

  return (
    <AmbientBackground>
      <div className="flex-1 flex items-center justify-center p-4">
        <Card intensity="strong" padding="standard" className="max-w-md w-full text-center space-y-4 rounded-[20px]">
          <div className="w-12 h-12 rounded-full bg-[var(--color-danger)]/14 text-[var(--color-danger)] flex items-center justify-center mx-auto font-mono font-bold text-[15px]">
            404
          </div>
          <div className="space-y-1.5">
            <h1 className="text-[20px] font-bold text-[var(--color-text-primary)]">
              Room {code ? `${code} ` : ''}Tidak Ditemukan
            </h1>
            <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
              Periksa kembali kode room 3 karakter Anda, atau buat room baru untuk mulai berbagi file
              dan teks.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <Button
              variant="primary"
              className="w-full"
              leftIcon={<Home size={15} strokeWidth={1.9} />}
              onClick={() => navigate('/')}
            >
              Kembali ke Beranda
            </Button>
          </div>
        </Card>
      </div>
    </AmbientBackground>
  );
}
