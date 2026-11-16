package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/droproom/backend/internal/cache"
	"github.com/droproom/backend/internal/config"
	"github.com/droproom/backend/internal/middleware"
	"github.com/droproom/backend/internal/models"
	"github.com/droproom/backend/internal/realtime"
	"github.com/droproom/backend/internal/security"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// WSHandler handles WebSocket upgrades for room realtime synchronization.
type WSHandler struct {
	db       *sql.DB
	cache    *cache.Client
	hub      *realtime.Hub
	cfg      *config.Config
	upgrader websocket.Upgrader
}

// NewWSHandler constructs WSHandler.
func NewWSHandler(db *sql.DB, cacheClient *cache.Client, hub *realtime.Hub, cfg *config.Config) *WSHandler {
	return &WSHandler{
		db:    db,
		cache: cacheClient,
		hub:   hub,
		cfg:   cfg,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true
				}
				if slices.Contains(cfg.CORSAllowedOrigins, "*") || slices.Contains(cfg.CORSAllowedOrigins, origin) {
					return true
				}
				return strings.Contains(origin, r.Host)
			},
		},
	}
}

// ServeRoomWS handles GET /ws/rooms/{code}.
func (h *WSHandler) ServeRoomWS(w http.ResponseWriter, r *http.Request) {
	rawCode := r.PathValue("code")
	room, err := middleware.LoadRoomByCode(r.Context(), h.db, h.cache, rawCode)
	if err != nil {
		if errors.Is(err, security.ErrInvalidRoomCode) {
			middleware.WriteError(w, http.StatusBadRequest, "invalid_room_code", err.Error())
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			middleware.WriteError(w, http.StatusNotFound, "room_not_found", "Room not found.")
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Unable to resolve room.")
		return
	}

	if room.Status != models.RoomStatusActive || !time.Now().UTC().Before(room.ExpiresAt) {
		middleware.WriteError(w, http.StatusGone, "room_expired", "This room has expired.")
		return
	}

	if !middleware.IsRoomAuthorized(r, room, h.cfg.TokenSecret) {
		middleware.WriteError(w, http.StatusUnauthorized, "password_required", "Room password verification is required.")
		return
	}

	clientIP := middleware.ClientIP(r)
	if allowed, msg := h.hub.CanAcceptConnection(clientIP, room.ID, h.cfg.MaxWSPerIP, h.cfg.MaxWSPerRoom); !allowed {
		middleware.WriteError(w, http.StatusTooManyRequests, "ws_limit_exceeded", msg)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	peerID := strings.TrimSpace(r.URL.Query().Get("peer_id"))
	if peerID == "" || len(peerID) > 64 {
		peerID = uuid.NewString()
	}
	label := strings.TrimSpace(r.URL.Query().Get("label"))
	if label == "" {
		label = "Guest-" + strings.ToUpper(peerID[:4])
	}
	if len(label) > 32 {
		label = label[:32]
	}

	now := time.Now().UTC()
	peer := models.PeerPresence{
		PeerID:   peerID,
		Label:    label,
		JoinedAt: now,
	}

	client := &realtime.Client{
		Hub:      h.hub,
		Conn:     conn,
		Send:     make(chan []byte, 64),
		RoomID:   room.ID,
		RoomCode: room.RoomCode,
		ClientIP: clientIP,
		Peer:     peer,
	}

	h.hub.Register(client)

	var peers []models.PeerPresence
	if h.cache != nil {
		peers, _ = h.cache.ListOnlinePeers(r.Context(), room.ID)
	}
	if len(peers) == 0 {
		peers = []models.PeerPresence{peer}
	}

	joinedMsg, _ := json.Marshal(realtime.Envelope{
		Type:     realtime.EventRoomJoined,
		RoomID:   room.ID,
		RoomCode: room.RoomCode,
		Payload: map[string]interface{}{
			"self":        peer,
			"peers":       peers,
			"server_time": now,
			"expires_at":  room.ExpiresAt,
		},
		Timestamp: now,
	})
	select {
	case client.Send <- joinedMsg:
	default:
	}

	peerMeta, _ := json.Marshal(map[string]string{
		"peer_id": peer.PeerID,
		"label":   peer.Label,
	})
	_, _ = h.db.ExecContext(context.Background(), `
		INSERT INTO room_events (id, room_id, event_type, metadata, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, uuid.NewString(), room.ID, realtime.EventRoomUserOnline, string(peerMeta), now)

	h.hub.Publish(context.Background(), realtime.Envelope{
		Type:     realtime.EventRoomUserOnline,
		RoomID:   room.ID,
		RoomCode: room.RoomCode,
		Payload: map[string]interface{}{
			"peer":  peer,
			"peers": peers,
		},
		Timestamp: now,
	})

	go client.WritePump()
	client.ReadPump(func() {
		if h.cache != nil {
			_ = h.cache.RemovePeerOnline(context.Background(), room.ID, peer.PeerID)
			remainingPeers, _ := h.cache.ListOnlinePeers(context.Background(), room.ID)
			leftAt := time.Now().UTC()
			_, _ = h.db.ExecContext(context.Background(), `
				INSERT INTO room_events (id, room_id, event_type, metadata, created_at)
				VALUES (?, ?, ?, ?, ?)
			`, uuid.NewString(), room.ID, realtime.EventRoomUserLeft, string(peerMeta), leftAt)

			h.hub.Publish(context.Background(), realtime.Envelope{
				Type:     realtime.EventRoomUserLeft,
				RoomID:   room.ID,
				RoomCode: room.RoomCode,
				Payload: map[string]interface{}{
					"peer":  peer,
					"peers": remainingPeers,
				},
				Timestamp: leftAt,
			})
		}
	})
}
