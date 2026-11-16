export type DurationUnit = 'minutes' | 'hours' | 'days';

export interface RoomInfo {
  id: string;
  room_code: string;
  created_at: string;
  expires_at: string;
  server_time: string;
  status: 'active' | 'expired';
  has_password: boolean;
  authorized: boolean;
  storage_limit: number;
  used_storage: number;
  max_file_size: number;
  access_token?: string;
}

export interface CreateRoomPayload {
  room_code?: string;
  duration_unit: DurationUnit;
  duration_value: number;
  password?: string;
  storage_limit?: number;
}

export interface PeerPresence {
  peer_id: string;
  label: string;
  joined_at: string;
}

export type WebSocketEventType =
  | 'room.joined'
  | 'room.user_online'
  | 'room.user_left'
  | 'room.expiring'
  | 'room.expired'
  | 'file.upload_started'
  | 'file.upload_completed'
  | 'file.updated'
  | 'file.deleted'
  | 'file.downloaded'
  | 'paste.created'
  | 'paste.updated'
  | 'paste.deleted';

export interface RoomEventRecord {
  id: string;
  room_id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface WebSocketEnvelope<T = Record<string, unknown>> {
  type: WebSocketEventType | 'pong';
  room_id: string;
  room_code: string;
  payload: T;
  timestamp: string;
}
