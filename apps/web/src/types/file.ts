export interface FileItem {
  id: string;
  room_id: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  download_count: number;
  created_at: string;
}

export type TransferStatus =
  | 'queued'
  | 'uploading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'downloading';

export interface FileTransferItem {
  localId: string;
  file?: File;
  fileId?: string;
  fileName: string;
  totalSize: number;
  transferredBytes: number;
  progress: number;
  status: TransferStatus;
  kind: 'upload' | 'download';
  uploadId?: string;
  chunkSize?: number;
  totalChunks?: number;
  error?: string;
}
