import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { MainLayout } from '@/components/layout/MainLayout';
import { RoomInfoPanel } from '@/components/layout/RoomInfoPanel';
import { ErrorState, WorkspaceSkeleton } from '@/components/ui/States';
import { ActivityFeature } from '@/features/activity/ActivityFeature';
import { FilesFeature } from '@/features/files/FilesFeature';
import { PasteFeature } from '@/features/paste/PasteFeature';
import { useRoomLoader } from '@/hooks/useRoom';
import { useRoomWebSocket } from '@/hooks/useWebSocket';
import { useRoomStore } from '@/stores/room.store';
import { useUIStore } from '@/stores/ui.store';
import { PasswordGateModal } from './components/PasswordGateModal';
import { RoomModals } from './components/RoomModals';
import { RoomExpiredPage, RoomNotFoundPage } from './components/RoomStatusPages';

export function WorkspacePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const room = useRoomStore((s) => s.room);
  const loading = useRoomStore((s) => s.loading);
  const error = useRoomStore((s) => s.error);
  const isExpired = useRoomStore((s) => s.isExpired);
  const isNotFound = useRoomStore((s) => s.isNotFound);
  const needsPassword = useRoomStore((s) => s.needsPassword);

  const activeTab = useUIStore((s) => s.activeTab);
  const pushToast = useUIStore((s) => s.pushToast);
  const openConfirm = useUIStore((s) => s.openConfirm);

  const normalizedCode = code?.toUpperCase() ?? '';
  const { reload, handleUnlocked } = useRoomLoader(normalizedCode);

  useRoomWebSocket(room?.room_code, Boolean(room && room.authorized && !isExpired));

  const handleCopyShareLink = async () => {
    const shareCode = room?.room_code ?? normalizedCode;
    const url = `${window.location.origin}/z/${shareCode}`;
    try {
      await navigator.clipboard.writeText(url);
      pushToast('success', 'Link room berhasil disalin');
    } catch {
      pushToast('error', 'Gagal menyalin link room');
    }
  };

  const handleLeaveRoom = () => {
    openConfirm({
      title: 'Keluar dari Room?',
      description:
        'Kamu akan meninggalkan workspace ini. Room tetap aktif hingga masa berlakunya berakhir.',
      confirmLabel: 'Keluar',
      cancelLabel: 'Tetap di Sini',
      variant: 'danger',
      icon: 'logout',
      onConfirm: () => {
        navigate('/');
      },
    });
  };

  if (isExpired) {
    return <RoomExpiredPage code={normalizedCode} />;
  }

  if (isNotFound) {
    return <RoomNotFoundPage code={normalizedCode} />;
  }

  if (loading && !room) {
    return (
      <div className="min-h-screen app-ambient-canvas">
        <WorkspaceSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen app-ambient-canvas flex items-center justify-center p-4">
        <div className="glass-strong rounded-[18px] p-6 max-w-md w-full">
          <ErrorState
            title="Gagal Memuat Room"
            description={error}
            onRetry={() => void reload()}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <MainLayout onLeaveRoom={handleLeaveRoom} onCopyShareLink={handleCopyShareLink}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === 'files' && <FilesFeature />}
            {activeTab === 'pastes' && <PasteFeature />}
            {activeTab === 'activity' && (
              <div className="space-y-5">
                <ActivityFeature />
                <div className="lg:hidden">
                  <RoomInfoPanel />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </MainLayout>

      <PasswordGateModal
        open={needsPassword && !isExpired}
        roomCode={normalizedCode}
        onUnlocked={(unlocked) => void handleUnlocked(unlocked)}
        onBackHome={() => navigate('/')}
      />

      <RoomModals onCopyShareLink={handleCopyShareLink} />
    </>
  );
}
