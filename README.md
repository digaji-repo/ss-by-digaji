# ss-by-digaji

**DropRoom** — temporary file & text/code sharing workspace without login, featuring real-time room sync (WebSocket + Redis), iOS Liquid Glass UI (Light & OLED Dark Mode), inline preview, Monaco text/code editor, bulk actions, and automatic session expiration cleanup.

## Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, Motion (`motion/react`), Lucide React, Monaco Editor
- **Backend**: Go (`net/http`, WebSocket, background cleanup worker)
- **Database & Cache**: MySQL / MariaDB + Redis

## Local Setup

1. Copy environment template and configure your database & secret:

   ```bash
   cp .env.example .env
   ```

2. Run backend (`backend/`):

   ```bash
   cd backend
   go run ./cmd/server
   ```

3. Run frontend (`apps/web/`):

   ```bash
   cd apps/web
   npm install
   npm run dev -- --host 127.0.0.1 --port 5173
   ```

4. Or launch the full local Windows stack via [scripts/dev.ps1](scripts/dev.ps1).
