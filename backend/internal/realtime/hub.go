package realtime

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/droproom/backend/internal/cache"
	"github.com/droproom/backend/internal/models"
	"github.com/gorilla/websocket"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 25 * time.Second
	maxMsgSize = 8192
)

// Client represents a single connected WebSocket peer in a room.
type Client struct {
	Hub      *Hub
	Conn     *websocket.Conn
	Send     chan []byte
	RoomID   string
	RoomCode string
	ClientIP string
	Peer     models.PeerPresence
}

type roomSub struct {
	clients map[*Client]struct{}
	cancel  context.CancelFunc
}

// Hub manages WebSocket clients per room and bridges broadcasts through Redis Pub/Sub.
type Hub struct {
	cache    *cache.Client
	mu       sync.RWMutex
	rooms    map[string]*roomSub
	ipCounts map[string]int
}

// NewHub constructs a Hub backed by Redis Pub/Sub for multi-instance event synchronization.
func NewHub(cacheClient *cache.Client) *Hub {
	return &Hub{
		cache:    cacheClient,
		rooms:    make(map[string]*roomSub),
		ipCounts: make(map[string]int),
	}
}

// Publish broadcasts an event via Redis Pub/Sub (or locally if cache is unavailable).
func (h *Hub) Publish(ctx context.Context, env Envelope) {
	if env.Timestamp.IsZero() {
		env.Timestamp = time.Now().UTC()
	}
	raw, err := json.Marshal(env)
	if err != nil {
		return
	}
	if h.cache != nil {
		if err := h.cache.PublishRoomEvent(ctx, env.RoomID, raw); err == nil {
			return
		}
	}
	h.broadcastLocal(env.RoomID, raw)
}

// CanAcceptConnection checks whether ip and roomID are under configured WebSocket concurrency limits.
func (h *Hub) CanAcceptConnection(ip, roomID string, maxPerIP, maxPerRoom int) (bool, string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if maxPerIP > 0 && ip != "" && h.ipCounts[ip] >= maxPerIP {
		return false, "Too many active WebSocket connections from your IP."
	}
	if maxPerRoom > 0 {
		if sub, ok := h.rooms[roomID]; ok && len(sub.clients) >= maxPerRoom {
			return false, "This room has reached the maximum number of active connections."
		}
	}
	return true, ""
}

// Register attaches a WebSocket client to its room and starts a Redis Pub/Sub listener if needed.
func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	sub, ok := h.rooms[c.RoomID]
	if !ok {
		subCtx, cancel := context.WithCancel(context.Background())
		sub = &roomSub{
			clients: make(map[*Client]struct{}),
			cancel:  cancel,
		}
		h.rooms[c.RoomID] = sub
		go h.listenRedisRoom(subCtx, c.RoomID)
	}
	sub.clients[c] = struct{}{}
	if c.ClientIP != "" {
		h.ipCounts[c.ClientIP]++
	}
	h.mu.Unlock()

	if h.cache != nil {
		_ = h.cache.SetPeerOnline(context.Background(), c.RoomID, c.Peer)
	}
}

// Unregister detaches a client and tears down the Redis Pub/Sub subscription if the room is empty locally.
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	sub, ok := h.rooms[c.RoomID]
	if ok {
		if _, exists := sub.clients[c]; exists {
			delete(sub.clients, c)
			close(c.Send)
			if c.ClientIP != "" {
				if cur := h.ipCounts[c.ClientIP] - 1; cur <= 0 {
					delete(h.ipCounts, c.ClientIP)
				} else {
					h.ipCounts[c.ClientIP] = cur
				}
			}
		}
		if len(sub.clients) == 0 {
			sub.cancel()
			delete(h.rooms, c.RoomID)
		}
	}
	h.mu.Unlock()

	if h.cache != nil {
		_ = h.cache.RemovePeerOnline(context.Background(), c.RoomID, c.Peer.PeerID)
	}
}

// CloseRoom closes all active WebSocket connections in a room (used on expiration).
func (h *Hub) CloseRoom(roomID string) {
	h.mu.Lock()
	sub, ok := h.rooms[roomID]
	if ok {
		for client := range sub.clients {
			_ = client.Conn.WriteControl(
				websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, "room expired"),
				time.Now().Add(time.Second),
			)
			_ = client.Conn.Close()
		}
	}
	h.mu.Unlock()
}

func (h *Hub) listenRedisRoom(ctx context.Context, roomID string) {
	if h.cache == nil {
		return
	}
	pubsub := h.cache.RDB.Subscribe(ctx, cache.RoomChannel(roomID))
	defer pubsub.Close()

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			h.broadcastLocal(roomID, []byte(msg.Payload))
		}
	}
}

func (h *Hub) broadcastLocal(roomID string, raw []byte) {
	h.mu.RLock()
	sub, ok := h.rooms[roomID]
	if !ok {
		h.mu.RUnlock()
		return
	}
	clients := make([]*Client, 0, len(sub.clients))
	for client := range sub.clients {
		clients = append(clients, client)
	}
	h.mu.RUnlock()

	for _, client := range clients {
		select {
		case client.Send <- raw:
		default:
			// Drop slow client cleanly instead of blocking the room broadcast.
			go func(cl *Client) {
				_ = cl.Conn.Close()
			}(client)
		}
	}
}

// WritePump pushes outbound messages and periodic WebSocket ping frames.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.Conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ReadPump enforces heartbeat pong deadlines and handles client disconnects.
func (c *Client) ReadPump(onDisconnect func()) {
	defer func() {
		if onDisconnect != nil {
			onDisconnect()
		}
		c.Hub.Unregister(c)
		_ = c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMsgSize)
	_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		if c.Hub.cache != nil {
			_ = c.Hub.cache.SetPeerOnline(context.Background(), c.RoomID, c.Peer)
		}
		return nil
	})

	for {
		_, msg, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ws close room=%s peer=%s err=%v", c.RoomCode, c.Peer.PeerID, err)
			}
			return
		}
		var incoming struct {
			Type string `json:"type"`
		}
		if json.Unmarshal(msg, &incoming) == nil && incoming.Type == "ping" {
			if c.Hub.cache != nil {
				_ = c.Hub.cache.SetPeerOnline(context.Background(), c.RoomID, c.Peer)
			}
			ack, _ := json.Marshal(map[string]interface{}{
				"type":      "pong",
				"timestamp": time.Now().UTC(),
			})
			select {
			case c.Send <- ack:
			default:
			}
		}
	}
}
