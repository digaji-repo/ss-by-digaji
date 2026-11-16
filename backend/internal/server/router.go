package server

import (
	"database/sql"
	"net/http"

	"github.com/droproom/backend/internal/cache"
	"github.com/droproom/backend/internal/config"
	"github.com/droproom/backend/internal/handlers"
	"github.com/droproom/backend/internal/middleware"
	"github.com/droproom/backend/internal/realtime"
	"github.com/droproom/backend/internal/storage"
)

// NewRouter constructs the HTTP + WebSocket router with security, CORS, and rate limiting middlewares.
func NewRouter(
	db *sql.DB,
	cacheClient *cache.Client,
	store storage.Backend,
	hub *realtime.Hub,
	cfg *config.Config,
) http.Handler {
	mux := http.NewServeMux()

	healthH := handlers.NewHealthHandler(db, cacheClient)
	roomH := handlers.NewRoomHandler(db, cacheClient, cfg)
	fileH := handlers.NewFileHandler(db, cacheClient, store, hub, cfg)
	pasteH := handlers.NewPasteHandler(db, cacheClient, hub, cfg)
	wsH := handlers.NewWSHandler(db, cacheClient, hub, cfg)

	roomGuard := middleware.RequireActiveRoom(db, cacheClient, cfg.TokenSecret, func(r *http.Request) string {
		return r.PathValue("code")
	})

	// Health & Room lifecycle
	mux.HandleFunc("GET /api/health", healthH.Check)
	mux.HandleFunc("POST /api/rooms", roomH.CreateRoom)
	mux.HandleFunc("GET /api/rooms/{code}", roomH.GetRoom)
	mux.HandleFunc("POST /api/rooms/{code}/validate", roomH.ValidateRoom)
	mux.Handle("GET /api/rooms/{code}/events", roomGuard(http.HandlerFunc(roomH.ListEvents)))

	// File sharing (streaming + chunked resumable + bulk delete + download + preview + rename/edit + delete)
	mux.Handle("POST /api/rooms/{code}/files", roomGuard(http.HandlerFunc(fileH.UploadFiles)))
	mux.Handle("POST /api/rooms/{code}/files/bulk-delete", roomGuard(http.HandlerFunc(fileH.BulkDeleteFiles)))
	mux.Handle("POST /api/rooms/{code}/files/chunked/init", roomGuard(http.HandlerFunc(fileH.InitChunkedUpload)))
	mux.Handle("GET /api/rooms/{code}/files/chunked/{uploadId}", roomGuard(http.HandlerFunc(fileH.GetChunkedStatus)))
	mux.Handle("PUT /api/rooms/{code}/files/chunked/{uploadId}/chunks/{index}", roomGuard(http.HandlerFunc(fileH.UploadChunkPart)))
	mux.Handle("POST /api/rooms/{code}/files/chunked/{uploadId}/complete", roomGuard(http.HandlerFunc(fileH.CompleteChunkedUpload)))
	mux.Handle("GET /api/rooms/{code}/files", roomGuard(http.HandlerFunc(fileH.ListFiles)))
	mux.HandleFunc("GET /api/files/{id}/download", fileH.DownloadFile)
	mux.HandleFunc("GET /api/files/{id}/preview", fileH.PreviewFile)
	mux.HandleFunc("PUT /api/files/{id}", fileH.RenameFile)
	mux.HandleFunc("PUT /api/files/{id}/content", fileH.UpdateFileContent)
	mux.HandleFunc("DELETE /api/files/{id}", fileH.DeleteFile)

	// Paste sharing
	mux.Handle("POST /api/rooms/{code}/pastes", roomGuard(http.HandlerFunc(pasteH.CreatePaste)))
	mux.Handle("GET /api/rooms/{code}/pastes", roomGuard(http.HandlerFunc(pasteH.ListPastes)))
	mux.HandleFunc("PUT /api/pastes/{id}", pasteH.UpdatePaste)
	mux.HandleFunc("DELETE /api/pastes/{id}", pasteH.DeletePaste)

	// WebSocket gateway
	mux.HandleFunc("GET /ws/rooms/{code}", wsH.ServeRoomWS)

	var handler http.Handler = mux
	handler = middleware.RateLimit(cacheClient, cfg.RateLimitRequestsPerMinute)(handler)
	handler = middleware.CORS(cfg.CORSAllowedOrigins)(handler)
	handler = middleware.SecurityHeaders(handler)
	return handler
}
