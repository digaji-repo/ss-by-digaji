import { ApiError, buildAuthHeaders } from '@/services/api';
import type { FileItem } from '@/types/file';

const CHUNK_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_CHUNK_RETRIES = 3;

export interface UploadProgressCallbacks {
  onProgress: (transferredBytes: number, totalBytes: number) => void;
  onSessionReady?: (uploadId: string, chunkSize: number, totalChunks: number) => void;
  signal?: AbortSignal;
}

function getChunkResumeKey(roomCode: string, file: File): string {
  return `droproom_upload_${roomCode.toUpperCase()}_${file.name}_${file.size}_${file.lastModified}`;
}

export async function uploadFileWithStrategy(
  roomCode: string,
  file: File,
  callbacks: UploadProgressCallbacks
): Promise<FileItem> {
  if (file.size <= CHUNK_THRESHOLD_BYTES) {
    return uploadSingleStream(roomCode, file, callbacks);
  }
  return uploadChunkedResumable(roomCode, file, callbacks);
}

function uploadSingleStream(
  roomCode: string,
  file: File,
  callbacks: UploadProgressCallbacks
): Promise<FileItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('files', file, file.name);

    xhr.open('POST', `/api/rooms/${encodeURIComponent(roomCode)}/files`);
    xhr.withCredentials = true;
    const headers = buildAuthHeaders(roomCode);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }

    const onAbort = () => xhr.abort();
    callbacks.signal?.addEventListener('abort', onAbort, { once: true });

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        callbacks.onProgress(ev.loaded, ev.total);
      }
    };

    xhr.onload = () => {
      callbacks.signal?.removeEventListener('abort', onAbort);
      try {
        const parsed = JSON.parse(xhr.responseText) as {
          files?: FileItem[];
          code?: string;
          message?: string;
        };
        if (xhr.status >= 200 && xhr.status < 300 && parsed.files && parsed.files[0]) {
          callbacks.onProgress(file.size, file.size);
          resolve(parsed.files[0]);
          return;
        }
        reject(new ApiError(xhr.status, parsed.code ?? 'upload_failed', parsed.message ?? 'Upload gagal'));
      } catch {
        reject(new ApiError(xhr.status, 'upload_failed', 'Gagal memproses respons upload'));
      }
    };

    xhr.onerror = () => {
      callbacks.signal?.removeEventListener('abort', onAbort);
      reject(new ApiError(0, 'network_error', 'Koneksi terputus saat upload'));
    };

    xhr.onabort = () => {
      callbacks.signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Upload dibatalkan', 'AbortError'));
    };

    xhr.send(formData);
  });
}

async function uploadChunkedResumable(
  roomCode: string,
  file: File,
  callbacks: UploadProgressCallbacks
): Promise<FileItem> {
  const resumeKey = getChunkResumeKey(roomCode, file);
  let uploadId = localStorage.getItem(resumeKey);
  let chunkSize = DEFAULT_CHUNK_SIZE;
  let totalChunks = Math.ceil(file.size / chunkSize);
  let uploadedSet = new Set<number>();

  if (uploadId) {
    try {
      const statusRes = await fetch(
        `/api/rooms/${encodeURIComponent(roomCode)}/files/chunked/${encodeURIComponent(uploadId)}`,
        {
          credentials: 'include',
          headers: buildAuthHeaders(roomCode),
          signal: callbacks.signal,
        }
      );
      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as { uploaded_chunks: number[] };
        uploadedSet = new Set(statusData.uploaded_chunks);
      } else {
        uploadId = null;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      uploadId = null;
    }
  }

  if (!uploadId) {
    const initRes = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/files/chunked/init`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(roomCode),
      },
      signal: callbacks.signal,
      body: JSON.stringify({
        file_name: file.name,
        total_size: file.size,
        chunk_size: chunkSize,
        content_type: file.type || 'application/octet-stream',
      }),
    });
    const initData = (await initRes.json()) as {
      upload_id?: string;
      chunk_size?: number;
      total_chunks?: number;
      code?: string;
      message?: string;
    };
    if (!initRes.ok || !initData.upload_id) {
      throw new ApiError(initRes.status, initData.code ?? 'chunk_init_failed', initData.message ?? 'Gagal memulai upload chunk');
    }
    uploadId = initData.upload_id;
    chunkSize = initData.chunk_size ?? chunkSize;
    totalChunks = initData.total_chunks ?? totalChunks;
    localStorage.setItem(resumeKey, uploadId);
  }

  callbacks.onSessionReady?.(uploadId, chunkSize, totalChunks);

  let completedBytes = 0;
  for (const idx of uploadedSet) {
    const start = idx * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    completedBytes += Math.max(0, end - start);
  }
  callbacks.onProgress(completedBytes, file.size);

  for (let index = 0; index < totalChunks; index += 1) {
    if (callbacks.signal?.aborted) {
      throw new DOMException('Upload dijeda', 'AbortError');
    }
    if (uploadedSet.has(index)) {
      continue;
    }

    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const slice = file.slice(start, end);

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_CHUNK_RETRIES; attempt += 1) {
      try {
        await uploadSingleChunkWithProgress(
          roomCode,
          uploadId,
          index,
          slice,
          (chunkLoaded) => {
            callbacks.onProgress(Math.min(file.size, completedBytes + chunkLoaded), file.size);
          },
          callbacks.signal
        );
        lastError = null;
        break;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }
        lastError = err;
        if (attempt < MAX_CHUNK_RETRIES) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    completedBytes += slice.size;
    callbacks.onProgress(completedBytes, file.size);
  }

  const completeRes = await fetch(
    `/api/rooms/${encodeURIComponent(roomCode)}/files/chunked/${encodeURIComponent(uploadId)}/complete`,
    {
      method: 'POST',
      credentials: 'include',
      headers: buildAuthHeaders(roomCode),
      signal: callbacks.signal,
    }
  );
  const completeData = (await completeRes.json()) as FileItem & { code?: string; message?: string };
  if (!completeRes.ok) {
    throw new ApiError(completeRes.status, completeData.code ?? 'chunk_complete_failed', completeData.message ?? 'Gagal menggabungkan file');
  }

  localStorage.removeItem(resumeKey);
  callbacks.onProgress(file.size, file.size);
  return completeData;
}

function uploadSingleChunkWithProgress(
  roomCode: string,
  uploadId: string,
  index: number,
  chunk: Blob,
  onChunkProgress: (loaded: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      'PUT',
      `/api/rooms/${encodeURIComponent(roomCode)}/files/chunked/${encodeURIComponent(uploadId)}/chunks/${index}`
    );
    xhr.withCredentials = true;
    const headers = buildAuthHeaders(roomCode);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }

    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onChunkProgress(ev.loaded);
      }
    };

    xhr.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new ApiError(xhr.status, 'chunk_failed', `Chunk ${index} gagal (${xhr.status})`));
    };

    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new ApiError(0, 'network_error', 'Koneksi terputus saat upload chunk'));
    };

    xhr.onabort = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Upload dijeda', 'AbortError'));
    };

    xhr.send(chunk);
  });
}

export async function downloadFileWithProgress(
  url: string,
  fileName: string,
  onProgress: (loaded: number, total: number) => void
): Promise<void> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new ApiError(res.status, 'download_failed', 'Gagal mengunduh file');
  }

  const totalHeader = res.headers.get('Content-Length');
  const total = totalHeader ? Number(totalHeader) : 0;

  if (!res.body) {
    const blob = await res.blob();
    triggerBrowserDownload(blob, fileName);
    return;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total || loaded);
    }
  }

  const blob = new Blob(chunks as BlobPart[]);
  triggerBrowserDownload(blob, fileName);
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}
