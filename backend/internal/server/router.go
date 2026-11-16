package server

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/droproom/backend/internal/cache"
	"github.com/droproom/backend/internal/config"
	"github.com/droproom/backend/internal/handlers"
	"github.com/droproom/backend/internal/middleware"
	"github.com/droproom/backend/internal/realtime"
	"github.com/droproom/backend/internal/storage"
)

// NewRouter constructs the HTTP + WebSocket router with security, CORS, concurrency, and granular rate limiting middlewares.
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

	roomKey := func(r *http.Request) string {
		return strings.ToUpper(strings.TrimSpace(r.PathValue("code")))
	}

	rlCreate := middleware.EndpointRateLimit(cacheClient, "create", cfg.RLCreateRoomPerMin, middleware.ClientIP)
	rlJoin := middleware.EndpointRateLimit(cacheClient, "join", cfg.RLJoinRoomPerMin, middleware.ClientIP)
	rlValidateRoom := middleware.EndpointRateLimit(cacheClient, "pw_room", cfg.RLValidatePWPerMinRoom, roomKey)
	rlWS := middleware.EndpointRateLimit(cacheClient, "ws", cfg.RLWSHandshakePerMin, middleware.ClientIP)

	uploadLimiter := middleware.NewConcurrencyLimiter()
	downloadLimiter := middleware.NewConcurrencyLimiter()
	upConc := uploadLimiter.Limit(cfg.MaxConcurrentUploadsPerIP, middleware.ClientIP)
	dlConc := downloadLimiter.Limit(cfg.MaxConcurrentDownloadsPerIP, middleware.ClientIP)

	// Health & Room lifecycle
	mux.HandleFunc("GET /api/health", healthH.Check)
	mux.Handle("POST /api/rooms", rlCreate(http.HandlerFunc(roomH.CreateRoom)))
	mux.Handle("GET /api/rooms/{code}", rlJoin(http.HandlerFunc(roomH.GetRoom)))
	mux.Handle("POST /api/rooms/{code}/validate", rlValidateRoom(http.HandlerFunc(roomH.ValidateRoom)))
	mux.Handle("GET /api/rooms/{code}/events", roomGuard(http.HandlerFunc(roomH.ListEvents)))

	// File sharing (quarantine + ClamAV + concurrency + bandwidth caps)
	mux.Handle("POST /api/rooms/{code}/files", upConc(roomGuard(http.HandlerFunc(fileH.UploadFiles))))
	mux.Handle("POST /api/rooms/{code}/files/bulk-delete", roomGuard(http.HandlerFunc(fileH.BulkDeleteFiles)))
	mux.Handle("POST /api/rooms/{code}/files/chunked/init", upConc(roomGuard(http.HandlerFunc(fileH.InitChunkedUpload))))
	mux.Handle("GET /api/rooms/{code}/files/chunked/{uploadId}", roomGuard(http.HandlerFunc(fileH.GetChunkedStatus)))
	mux.Handle("PUT /api/rooms/{code}/files/chunked/{uploadId}/chunks/{index}", upConc(roomGuard(http.HandlerFunc(fileH.UploadChunkPart))))
	mux.Handle("POST /api/rooms/{code}/files/chunked/{uploadId}/complete", upConc(roomGuard(http.HandlerFunc(fileH.CompleteChunkedUpload))))
	mux.Handle("GET /api/rooms/{code}/files", roomGuard(http.HandlerFunc(fileH.ListFiles)))
	mux.Handle("GET /api/files/{id}/download", dlConc(http.HandlerFunc(fileH.DownloadFile)))
	mux.Handle("GET /api/files/{id}/preview", dlConc(http.HandlerFunc(fileH.PreviewFile)))
	mux.HandleFunc("PUT /api/files/{id}", fileH.RenameFile)
	mux.HandleFunc("PUT /api/files/{id}/content", fileH.UpdateFileContent)
	mux.Handle("PUT /api/files/{id}/binary", upConc(http.HandlerFunc(fileH.UpdateWordBinary)))
	mux.HandleFunc("DELETE /api/files/{id}", fileH.DeleteFile)

	// Paste sharing
	mux.Handle("POST /api/rooms/{code}/pastes", roomGuard(http.HandlerFunc(pasteH.CreatePaste)))
	mux.Handle("GET /api/rooms/{code}/pastes", roomGuard(http.HandlerFunc(pasteH.ListPastes)))
	mux.HandleFunc("PUT /api/pastes/{id}", pasteH.UpdatePaste)
	mux.HandleFunc("DELETE /api/pastes/{id}", pasteH.DeletePaste)

	// WebSocket gateway
	mux.Handle("GET /ws/rooms/{code}", rlWS(http.HandlerFunc(wsH.ServeRoomWS)))

	var handler http.Handler = mux
	handler = middleware.RateLimit(cacheClient, cfg.RateLimitRequestsPerMinute)(handler)
	handler = middleware.CORS(cfg.CORSAllowedOrigins)(handler)
	handler = middleware.SecurityHeaders(handler)
	return handler
}
