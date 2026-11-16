import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LandingPage } from '@/features/landing/LandingPage';
import { WorkspacePage } from '@/features/room/WorkspacePage';
import { RoomNotFoundPage } from '@/features/room/components/RoomStatusPages';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/z/:code" element={<WorkspacePage />} />
        <Route path="/404" element={<RoomNotFoundPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
