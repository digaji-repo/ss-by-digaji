import { useEffect, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { GlobalDialogHost } from '@/components/ui/Dialogs';
import { ToastContainer } from '@/components/ui/Toast';
import { useUIStore } from '@/stores/ui.store';

export function AppProviders({ children }: { children: ReactNode }) {
  const theme = useUIStore((s) => s.theme);
  const setIsOffline = useUIStore((s) => s.setIsOffline);
  const pushToast = useUIStore((s) => s.pushToast);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const onOffline = () => {
      setIsOffline(true);
      pushToast('warning', 'Koneksi internet terputus');
    };
    const onOnline = () => {
      setIsOffline(false);
      pushToast('success', 'Koneksi internet kembali normal');
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [pushToast, setIsOffline]);

  return (
    <MotionConfig reducedMotion="user">
      {children}
      <ToastContainer />
      <GlobalDialogHost />
    </MotionConfig>
  );
}
