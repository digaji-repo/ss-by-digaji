package realtime

import "time"

// All 12 WebSocket events required by PRD section 6.
const (
	EventRoomJoined          = "room.joined"
	EventRoomUserOnline      = "room.user_online"
	EventRoomUserLeft        = "room.user_left"
	EventRoomExpiring        = "room.expiring"
	EventRoomExpired         = "room.expired"
	EventFileUploadStarted   = "file.upload_started"
	EventFileUploadCompleted = "file.upload_completed"
	EventFileUpdated         = "file.updated"
	EventFileDeleted         = "file.deleted"
	EventFileDownloaded      = "file.downloaded"
	EventPasteCreated        = "paste.created"
	EventPasteUpdated        = "paste.updated"
	EventPasteDeleted        = "paste.deleted"
)

// Envelope is the standard WebSocket message payload sent to clients and over Redis Pub/Sub.
type Envelope struct {
	Type      string      `json:"type"`
	RoomID    string      `json:"room_id"`
	RoomCode  string      `json:"room_code"`
	Payload   interface{} `json:"payload"`
	Timestamp time.Time   `json:"timestamp"`
}
