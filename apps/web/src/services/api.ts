import type { CreateRoomPayload, RoomEventRecord, RoomInfo } from '@/types/room';
import type { PasteItem, SavePastePayload } from '@/types/paste';
import type { FileItem } from '@/types/file';

export class ApiError extends Error {
  status: number;
  code: string;
  remainingAttempts?: number;

  constructor(status: number, code: string, message: string, remainingAttempts?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.remainingAttempts = remainingAttempts;
  }
}

const TOKEN_STORAGE_PREFIX = 'droproom_token_';
const inFlightRoomLookups = new Map<string, Promise<RoomInfo>>();

export function saveRoomToken(code: string, token: string): void {
  try {
    sessionStorage.setItem(`${TOKEN_STORAGE_PREFIX}${code.toUpperCase()}`, token);
  } catch {
    // Ignore storage quota errors
  }
}

export function getRoomToken(code: string): string | null {
  try {
    return sessionStorage.getItem(`${TOKEN_STORAGE_PREFIX}${code.toUpperCase()}`);
  } catch {
    return null;
  }
}

export function clearRoomToken(code: string): void {
  try {
    sessionStorage.removeItem(`${TOKEN_STORAGE_PREFIX}${code.toUpperCase()}`);
  } catch {
    // Ignore
  }
}

export function buildAuthHeaders(code?: string): Record<string, string> {
  if (!code) return {};
  const token = getRoomToken(code);
  return token ? { 'X-Room-Token': token } : {};
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as {
    code?: string;
    message?: string;
    remaining_attempts?: number;
  };
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data.code ?? 'request_failed',
      data.message ?? `Request failed (${res.status})`,
      data.remaining_attempts
    );
  }
  return data as T;
}

export const api = {
  async createRoom(payload: CreateRoomPayload): Promise<RoomInfo> {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const info = await parseJsonResponse<RoomInfo>(res);
    if (info.access_token) {
      saveRoomToken(info.room_code, info.access_token);
    }
    return info;
  },

  async getRoom(code: string): Promise<RoomInfo> {
    const normKey = code.trim().toUpperCase();
    const pending = inFlightRoomLookups.get(normKey);
    if (pending) {
      return pending;
    }
    const req = (async () => {
      const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
        credentials: 'include',
        headers: buildAuthHeaders(code),
      });
      return parseJsonResponse<RoomInfo>(res);
    })().finally(() => {
      inFlightRoomLookups.delete(normKey);
    });
    inFlightRoomLookups.set(normKey, req);
    return req;
  },

  async validateRoom(code: string, password?: string): Promise<RoomInfo> {
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/validate`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(code),
      },
      body: JSON.stringify({ password: password ?? '' }),
    });
    const info = await parseJsonResponse<RoomInfo>(res);
    if (info.access_token) {
      saveRoomToken(info.room_code, info.access_token);
    }
    return info;
  },

  async listEvents(code: string): Promise<RoomEventRecord[]> {
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/events`, {
      credentials: 'include',
      headers: buildAuthHeaders(code),
    });
    const data = await parseJsonResponse<{ events: RoomEventRecord[] }>(res);
    return data.events;
  },

  async listFiles(code: string): Promise<FileItem[]> {
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/files`, {
      credentials: 'include',
      headers: buildAuthHeaders(code),
    });
    const data = await parseJsonResponse<{ files: FileItem[] }>(res);
    return data.files;
  },

  async uploadFile(code: string, file: File): Promise<FileItem> {
    const form = new FormData();
    form.append('files', file, file.name);
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/files`, {
      method: 'POST',
      credentials: 'include',
      headers: buildAuthHeaders(code),
      body: form,
    });
    const data = await parseJsonResponse<{ files: FileItem[] }>(res);
    const saved = data.files[0];
    if (!saved) {
      throw new ApiError(500, 'upload_empty', 'Gagal membuat file di room.');
    }
    return saved;
  },

  async deleteFile(fileId: string, roomCode: string): Promise<void> {
    const res = await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: buildAuthHeaders(roomCode),
    });
    await parseJsonResponse<{ deleted: boolean }>(res);
  },

  async bulkDeleteFiles(roomCode: string, fileIds: string[]): Promise<{ deleted_ids: string[]; deleted_count: number }> {
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/files/bulk-delete`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(roomCode),
      },
      body: JSON.stringify({ file_ids: fileIds }),
    });
    return parseJsonResponse<{ deleted_ids: string[]; deleted_count: number }>(res);
  },

  async renameFile(fileId: string, roomCode: string, originalName: string): Promise<FileItem> {
    const res = await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(roomCode),
      },
      body: JSON.stringify({ original_name: originalName }),
    });
    return parseJsonResponse<FileItem>(res);
  },

  async updateFileContent(fileId: string, roomCode: string, content: string): Promise<FileItem> {
    const res = await fetch(`/api/files/${encodeURIComponent(fileId)}/content`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(roomCode),
      },
      body: JSON.stringify({ content }),
    });
    return parseJsonResponse<FileItem>(res);
  },

  async fetchFileTextContent(fileId: string, roomCode: string): Promise<string> {
    const res = await fetch(`/api/files/${encodeURIComponent(fileId)}/preview`, {
      credentials: 'include',
      cache: 'no-store',
      headers: buildAuthHeaders(roomCode),
    });
    if (!res.ok) {
      throw new ApiError(res.status, 'preview_failed', 'Gagal membaca isi file.');
    }
    return res.text();
  },

  async fetchFileBinary(fileId: string, roomCode: string): Promise<ArrayBuffer> {
    const res = await fetch(`/api/files/${encodeURIComponent(fileId)}/preview?_t=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
      headers: buildAuthHeaders(roomCode),
    });
    if (!res.ok) {
      throw new ApiError(res.status, 'preview_failed', 'Gagal memuat dokumen Word.');
    }
    return res.arrayBuffer();
  },

  async updateWordBinary(
    fileId: string,
    roomCode: string,
    blob: Blob,
    fileName: string
  ): Promise<FileItem> {
    const form = new FormData();
    form.append('file', blob, fileName);
    const res = await fetch(`/api/files/${encodeURIComponent(fileId)}/binary`, {
      method: 'PUT',
      credentials: 'include',
      headers: buildAuthHeaders(roomCode),
      body: form,
    });
    return parseJsonResponse<FileItem>(res);
  },

  async listPastes(code: string): Promise<PasteItem[]> {
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/pastes`, {
      credentials: 'include',
      headers: buildAuthHeaders(code),
    });
    const data = await parseJsonResponse<{ pastes: PasteItem[] }>(res);
    return data.pastes;
  },

  async createPaste(code: string, payload: SavePastePayload): Promise<PasteItem> {
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}/pastes`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(code),
      },
      body: JSON.stringify(payload),
    });
    return parseJsonResponse<PasteItem>(res);
  },

  async updatePaste(pasteId: string, roomCode: string, payload: SavePastePayload): Promise<PasteItem> {
    const res = await fetch(`/api/pastes/${encodeURIComponent(pasteId)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(roomCode),
      },
      body: JSON.stringify(payload),
    });
    return parseJsonResponse<PasteItem>(res);
  },

  async deletePaste(pasteId: string, roomCode: string): Promise<void> {
    const res = await fetch(`/api/pastes/${encodeURIComponent(pasteId)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: buildAuthHeaders(roomCode),
    });
    await parseJsonResponse<{ deleted: boolean }>(res);
  },

  getFileDownloadUrl(fileId: string, roomCode: string): string {
    const token = getRoomToken(roomCode);
    const base = `${window.location.origin}/api/files/${encodeURIComponent(fileId)}/download`;
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  },

  getFilePreviewUrl(fileId: string, roomCode: string): string {
    const token = getRoomToken(roomCode);
    const base = `${window.location.origin}/api/files/${encodeURIComponent(fileId)}/preview`;
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  },
};
