import type { WebSocketEnvelope } from '@/types/room';
import { getRoomToken } from '@/services/api';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface RoomSocketCallbacks {
  onStateChange: (state: ConnectionState) => void;
  onMessage: (envelope: WebSocketEnvelope) => void;
  onAuthError: (statusCode: number) => void;
}

export class RoomWebSocketClient {
  private readonly roomCode: string;
  private readonly peerId: string;
  private readonly callbacks: RoomSocketCallbacks;
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private manuallyClosed = false;

  constructor(roomCode: string, peerId: string, callbacks: RoomSocketCallbacks) {
    this.roomCode = roomCode.toUpperCase();
    this.peerId = peerId;
    this.callbacks = callbacks;
  }

  connect(): void {
    this.manuallyClosed = false;
    this.openSocket();
  }

  disconnect(): void {
    this.manuallyClosed = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close(1000, 'client disconnect');
      this.ws = null;
    }
    this.callbacks.onStateChange('disconnected');
  }

  private openSocket(): void {
    this.clearTimers();
    this.callbacks.onStateChange(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getRoomToken(this.roomCode);
    const params = new URLSearchParams({ peer_id: this.peerId });
    if (token) {
      params.set('token', token);
    }
    const url = `${protocol}//${window.location.host}/ws/rooms/${encodeURIComponent(this.roomCode)}?${params.toString()}`;

    const socket = new WebSocket(url);
    this.ws = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.callbacks.onStateChange('connected');
      this.startHeartbeat();
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as WebSocketEnvelope;
        if (parsed.type === 'pong') return;
        this.callbacks.onMessage(parsed);
      } catch {
        // Ignore malformed non-JSON messages
      }
    };

    socket.onclose = (event) => {
      this.clearTimers();
      this.ws = null;
      if (this.manuallyClosed) {
        this.callbacks.onStateChange('disconnected');
        return;
      }
      if (event.code === 1000 && event.reason === 'room expired') {
        this.callbacks.onAuthError(410);
        return;
      }
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // Handled via onclose reconnect flow
    };
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20_000);
  }

  private scheduleReconnect(): void {
    this.callbacks.onStateChange('reconnecting');
    const delayMs = Math.min(1000 * 2 ** this.reconnectAttempt, 15_000) + Math.floor(Math.random() * 400);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      if (!this.manuallyClosed) {
        this.openSocket();
      }
    }, delayMs);
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
