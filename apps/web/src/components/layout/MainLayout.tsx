import type { ReactNode } from 'react';
import { AmbientBackground } from './AmbientBackground';
import { AppHeader } from './AppHeader';
import { MobileNavigation } from './MobileNavigation';
import { RoomInfoPanel } from './RoomInfoPanel';
import { Sidebar } from './Sidebar';

interface MainLayoutProps {
  onLeaveRoom: () => void;
  onCopyShareLink: () => void;
  children: ReactNode;
}

export function MainLayout({ onLeaveRoom, onCopyShareLink, children }: MainLayoutProps) {
  return (
    <AmbientBackground>
      <AppHeader onLeaveRoom={onLeaveRoom} onCopyShareLink={onCopyShareLink} />

      <div className="flex-1 w-full max-w-[1440px] mx-auto px-3 sm:px-5 pt-4 pb-24 lg:pb-8 grid grid-cols-1 lg:grid-cols-[276px_1fr] gap-4 items-start">
        {/* Left Column: Menu Card + Info Room + Quick Paste stacked cleanly */}
        <aside className="hidden lg:flex flex-col gap-4 sticky top-[84px] max-h-[calc(100vh-100px)] overflow-y-auto pr-0.5">
          <Sidebar />
          <RoomInfoPanel />
        </aside>

        <main className="min-w-0 glass-medium rounded-[18px] p-4 sm:p-5">{children}</main>
      </div>

      <MobileNavigation />
    </AmbientBackground>
  );
}
