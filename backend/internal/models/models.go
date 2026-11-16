package models

import (
	"encoding/json"
	"time"
)

const (
	RoomStatusActive  = "active"
	RoomStatusExpired = "expired"
)

// Room maps to the rooms table.
type Room struct {
	ID           string    `json:"id"`
	RoomCode     string    `json:"room_code"`
	CreatedAt    time.Time `json:"created_at"`
	ExpiresAt    time.Time `json:"expires_at"`
	Status       string    `json:"status"`
	PasswordHash *string   `json:"-"`
	StorageLimit int64     `json:"storage_limit"`
}

// RoomResponse is the safe external representation returned by REST APIs.
type RoomResponse struct {
	ID           string    `json:"id"`
	RoomCode     string    `json:"room_code"`
	CreatedAt    time.Time `json:"created_at"`
	ExpiresAt    time.Time `json:"expires_at"`
	ServerTime   time.Time `json:"server_time"`
	Status       string    `json:"status"`
	HasPassword  bool      `json:"has_password"`
	Authorized   bool      `json:"authorized"`
	StorageLimit int64     `json:"storage_limit"`
	UsedStorage  int64     `json:"used_storage"`
	MaxFileSize  int64     `json:"max_file_size"`
	AccessToken  string    `json:"access_token,omitempty"`
}

// FileRecord maps to the files table.
type FileRecord struct {
	ID            string    `json:"id"`
	RoomID        string    `json:"room_id"`
	OriginalName  string    `json:"original_name"`
	StoredName    string    `json:"-"`
	MimeType      string    `json:"mime_type"`
	FileSize      int64     `json:"file_size"`
	StoragePath   string    `json:"-"`
	DownloadCount int       `json:"download_count"`
	CreatedAt     time.Time `json:"created_at"`
}

// Paste maps to the pastes table.
type Paste struct {
	ID             string    `json:"id"`
	RoomID         string    `json:"room_id"`
	Title          string    `json:"title"`
	Content        string    `json:"content"`
	SyntaxLanguage string    `json:"syntax_language"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// RoomEvent maps to the room_events table.
type RoomEvent struct {
	ID        string          `json:"id"`
	RoomID    string          `json:"room_id"`
	EventType string          `json:"event_type"`
	Metadata  json.RawMessage `json:"metadata"`
	CreatedAt time.Time       `json:"created_at"`
}

// DownloadLog maps to the download_logs table.
type DownloadLog struct {
	ID           string    `json:"id"`
	FileID       string    `json:"file_id"`
	RoomID       string    `json:"room_id"`
	DownloadedAt time.Time `json:"downloaded_at"`
}

// PeerPresence describes a connected WebSocket participant in a room.
type PeerPresence struct {
	PeerID   string    `json:"peer_id"`
	Label    string    `json:"label"`
	JoinedAt time.Time `json:"joined_at"`
}
