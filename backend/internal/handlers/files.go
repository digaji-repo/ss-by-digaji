package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/droproom/backend/internal/cache"
	"github.com/droproom/backend/internal/config"
	"github.com/droproom/backend/internal/middleware"
	"github.com/droproom/backend/internal/models"
	"github.com/droproom/backend/internal/realtime"
	"github.com/droproom/backend/internal/security"
	"github.com/droproom/backend/internal/storage"
	"github.com/google/uuid"
)

const maxChunkPartSize = 10 * 1024 * 1024

var errRoomExpiredTx = errors.New("room expired during upload")

// FileHandler handles streaming uploads, chunked resumable uploads, streaming downloads, previews, and deletion.
type FileHandler struct {
	db        *sql.DB
	cache     *cache.Client
	storage   storage.Backend
	hub       *realtime.Hub
	cfg       *config.Config
	scanner   security.MalwareScanner
	forceScan bool
}

// NewFileHandler constructs FileHandler with optional ClamAV scanner enabled via config.
func NewFileHandler(db *sql.DB, cacheClient *cache.Client, store storage.Backend, hub *realtime.Hub, cfg *config.Config) *FileHandler {
	var scanner security.MalwareScanner
	if cfg != nil && cfg.ClamAVEnabled {
		scanner = security.NewClamAVScanner(cfg.ClamAVAddr, cfg.ClamAVTimeout)
	}
	return &FileHandler{
		db:      db,
		cache:   cacheClient,
		storage: store,
		hub:     hub,
		cfg:     cfg,
		scanner: scanner,
	}
}

// SetMalwareScanner injects a custom MalwareScanner (e.g., in integration tests) and enforces scanning.
func (h *FileHandler) SetMalwareScanner(s security.MalwareScanner) {
	h.scanner = s
	h.forceScan = s != nil
}

// inspectQuarantinedFile validates extension/signature, OOXML archive safety, and ClamAV malware signatures before file release.
func (h *FileHandler) inspectQuarantinedFile(
	ctx context.Context,
	q *storage.QuarantineFile,
	origName string,
	declaredMIME string,
) (detectedMIME string, httpStatus int, errCode string, errMsg string) {
	detected, err := security.ValidateExtensionAndDetectMIME(origName, q.HeaderBytes, declaredMIME)
	if err != nil {
		_ = h.storage.DeleteQuarantine(q)
		if errors.Is(err, security.ErrInvalidSignature) {
			return "", http.StatusBadRequest, "invalid_signature", err.Error()
		}
		return "", http.StatusBadRequest, "blocked_file_type", err.Error()
	}

	if security.IsWordDocumentFile(origName, detected) {
		maxUncompressed := int64(30 * 1024 * 1024)
		if h.cfg != nil && h.cfg.MaxDocxUncompressedBytes > 0 {
			maxUncompressed = h.cfg.MaxDocxUncompressedBytes
		}
		if err := security.InspectOOXMLArchive(q.AbsPath, maxUncompressed, true); err != nil {
			_ = h.storage.DeleteQuarantine(q)
			if errors.Is(err, security.ErrZipBombDetected) {
				return "", http.StatusUnprocessableEntity, "zip_bomb_detected", err.Error()
			}
			return "", http.StatusBadRequest, "invalid_docx", err.Error()
		}
	}

	if h.scanner != nil && (h.forceScan || (h.cfg != nil && h.cfg.ClamAVEnabled)) {
		if scanErr := h.scanner.ScanFile(ctx, q.AbsPath); scanErr != nil {
			if errors.Is(scanErr, security.ErrMalwareDetected) {
				_ = h.storage.QuarantineInfected(q, scanErr.Error())
				log.Printf("[SECURITY] Malware quarantined: file=%q quarantine=%s reason=%v", origName, q.ID, scanErr)
				return "", http.StatusUnprocessableEntity, "malware_detected", "File rejected: malware detected and isolated in quarantine."
			}
			if h.cfg == nil || !h.cfg.ClamAVFailOpen {
				_ = h.storage.DeleteQuarantine(q)
				return "", http.StatusServiceUnavailable, "scanner_unavailable", "Malware scanner is temporarily unavailable. Upload rejected."
			}
		}
	}

	return detected, 0, "", ""
}

// UploadFiles handles streaming multipart upload via POST /api/rooms/{code}/files.
func (h *FileHandler) UploadFiles(w http.ResponseWriter, r *http.Request) {
	room, ok := middleware.RoomFromContext(r.Context())
	if !ok {
		middleware.WriteError(w, http.StatusUnauthorized, "unauthorized", "Room context missing.")
		return
	}

	mr, err := r.MultipartReader()
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_multipart", "Expected multipart/form-data upload stream.")
		return
	}

	savedRecords := make([]models.FileRecord, 0, 2)
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			middleware.WriteError(w, http.StatusBadRequest, "upload_stream_error", "Failed reading upload stream.")
			return
		}

		if part.FileName() == "" {
			_ = part.Close()
			continue
		}

		origName, err := security.SanitizeFilename(part.FileName())
		if err != nil {
			_ = part.Close()
			middleware.WriteError(w, http.StatusBadRequest, "invalid_filename", err.Error())
			return
		}

		if _, err := security.ValidateExtensionAndDetectMIME(origName, nil, part.Header.Get("Content-Type")); errors.Is(err, security.ErrBlockedExtension) {
			_ = part.Close()
			middleware.WriteError(w, http.StatusBadRequest, "blocked_file_type", err.Error())
			return
		}

		remainingStorage, err := h.remainingRoomQuota(r.Context(), room)
		if err != nil {
			_ = part.Close()
			middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to verify room storage quota.")
			return
		}
		if remainingStorage <= 0 {
			_ = part.Close()
			middleware.WriteError(w, http.StatusRequestEntityTooLarge, "storage_limit_exceeded", "Room storage limit reached.")
			return
		}

		maxAllowed := h.cfg.MaxFileSizeBytes
		if remainingStorage < maxAllowed {
			maxAllowed = remainingStorage
		}

		h.hub.Publish(r.Context(), realtime.Envelope{
			Type:     realtime.EventFileUploadStarted,
			RoomID:   room.ID,
			RoomCode: room.RoomCode,
			Payload: map[string]interface{}{
				"original_name": origName,
			},
			Timestamp: time.Now().UTC(),
		})

		qFile, err := h.storage.SaveQuarantineStream(part, maxAllowed)
		_ = part.Close()
		if err != nil {
			if errors.Is(err, storage.ErrFileTooLarge) {
				middleware.WriteError(w, http.StatusRequestEntityTooLarge, "file_too_large", "File exceeds maximum allowed size or remaining room storage.")
				return
			}
			middleware.WriteError(w, http.StatusInternalServerError, "storage_error", "Failed to save uploaded file to quarantine.")
			return
		}

		detectedMime, status, code, msg := h.inspectQuarantinedFile(r.Context(), qFile, origName, part.Header.Get("Content-Type"))
		if status != 0 {
			middleware.WriteError(w, status, code, msg)
			return
		}

		storedName := uuid.NewString() + ".bin"
		res, err := h.storage.PromoteQuarantine(qFile, room.ID, storedName)
		if err != nil {
			_ = h.storage.DeleteQuarantine(qFile)
			middleware.WriteError(w, http.StatusInternalServerError, "storage_error", "Failed to promote verified file.")
			return
		}

		rec, err := h.commitUploadedFile(r.Context(), room, origName, storedName, detectedMime, res)
		if err != nil {
			_ = h.storage.Delete(res.StoragePath)
			if errors.Is(err, errRoomExpiredTx) {
				middleware.WriteError(w, http.StatusGone, "room_expired", "This room has expired.")
				return
			}
			if errors.Is(err, storage.ErrFileTooLarge) {
				middleware.WriteError(w, http.StatusRequestEntityTooLarge, "storage_limit_exceeded", "Room storage limit exceeded.")
				return
			}
			middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to save file metadata.")
			return
		}

		h.hub.Publish(r.Context(), realtime.Envelope{
			Type:      realtime.EventFileUploadCompleted,
			RoomID:    room.ID,
			RoomCode:  room.RoomCode,
			Payload:   rec,
			Timestamp: time.Now().UTC(),
		})
		savedRecords = append(savedRecords, rec)
	}

	if len(savedRecords) == 0 {
		middleware.WriteError(w, http.StatusBadRequest, "no_files", "No file parts found in upload request.")
		return
	}

	middleware.WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"files": savedRecords,
	})
}

type chunkInitRequest struct {
	FileName    string `json:"file_name"`
	TotalSize   int64  `json:"total_size"`
	ChunkSize   int64  `json:"chunk_size"`
	ContentType string `json:"content_type"`
}

// InitChunkedUpload handles POST /api/rooms/{code}/files/chunked/init.
func (h *FileHandler) InitChunkedUpload(w http.ResponseWriter, r *http.Request) {
	room, ok := middleware.RoomFromContext(r.Context())
	if !ok {
		middleware.WriteError(w, http.StatusUnauthorized, "unauthorized", "Room context missing.")
		return
	}

	var req chunkInitRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16*1024)).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_json", "Invalid chunk init request.")
		return
	}

	origName, err := security.SanitizeFilename(req.FileName)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_filename", err.Error())
		return
	}
	if _, err := security.ValidateExtensionAndDetectMIME(origName, nil, req.ContentType); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "blocked_file_type", err.Error())
		return
	}

	if req.TotalSize <= 0 || req.TotalSize > h.cfg.MaxFileSizeBytes {
		middleware.WriteError(w, http.StatusRequestEntityTooLarge, "file_too_large", "File size exceeds allowed limit.")
		return
	}

	remaining, err := h.remainingRoomQuota(r.Context(), room)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to verify storage quota.")
		return
	}
	if req.TotalSize > remaining {
		middleware.WriteError(w, http.StatusRequestEntityTooLarge, "storage_limit_exceeded", "Insufficient room storage quota.")
		return
	}

	chunkSize := req.ChunkSize
	if chunkSize <= 0 || chunkSize > maxChunkPartSize {
		chunkSize = 5 * 1024 * 1024
	}
	totalChunks := int((req.TotalSize + chunkSize - 1) / chunkSize)
	if totalChunks < 1 {
		totalChunks = 1
	}

	uploadID := uuid.NewString()
	session := &cache.ChunkSession{
		UploadID:    uploadID,
		RoomID:      room.ID,
		RoomCode:    room.RoomCode,
		FileName:    origName,
		ContentType: req.ContentType,
		TotalSize:   req.TotalSize,
		ChunkSize:   chunkSize,
		TotalChunks: totalChunks,
		CreatedAt:   time.Now().UTC().Unix(),
	}

	if h.cache != nil {
		if err := h.cache.SaveChunkSession(r.Context(), session, h.cfg.ChunkUploadTTL); err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "cache_error", "Unable to start chunk upload session.")
			return
		}
	}

	h.hub.Publish(r.Context(), realtime.Envelope{
		Type:     realtime.EventFileUploadStarted,
		RoomID:   room.ID,
		RoomCode: room.RoomCode,
		Payload: map[string]interface{}{
			"original_name": origName,
			"upload_id":     uploadID,
		},
		Timestamp: time.Now().UTC(),
	})

	middleware.WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"upload_id":       uploadID,
		"chunk_size":      chunkSize,
		"total_chunks":    totalChunks,
		"uploaded_chunks": []int{},
	})
}

// GetChunkedStatus handles GET /api/rooms/{code}/files/chunked/{uploadId}.
func (h *FileHandler) GetChunkedStatus(w http.ResponseWriter, r *http.Request) {
	room, ok := middleware.RoomFromContext(r.Context())
	if !ok {
		middleware.WriteError(w, http.StatusUnauthorized, "unauthorized", "Room context missing.")
		return
	}
	uploadID := r.PathValue("uploadId")
	if _, err := uuid.Parse(uploadID); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_upload_id", "Invalid upload ID.")
		return
	}

	if h.cache != nil {
		sess, err := h.cache.GetChunkSession(r.Context(), uploadID)
		if err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "cache_error", "Failed to load upload session.")
			return
		}
		if sess == nil || sess.RoomID != room.ID {
			middleware.WriteError(w, http.StatusNotFound, "upload_session_not_found", "Upload session not found or expired.")
			return
		}
	}

	indices, err := h.storage.ListChunkIndices(uploadID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "storage_error", "Failed to inspect uploaded chunks.")
		return
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"upload_id":       uploadID,
		"uploaded_chunks": indices,
	})
}

// UploadChunkPart handles PUT /api/rooms/{code}/files/chunked/{uploadId}/chunks/{index}.
func (h *FileHandler) UploadChunkPart(w http.ResponseWriter, r *http.Request) {
	room, ok := middleware.RoomFromContext(r.Context())
	if !ok {
		middleware.WriteError(w, http.StatusUnauthorized, "unauthorized", "Room context missing.")
		return
	}
	uploadID := r.PathValue("uploadId")
	if _, err := uuid.Parse(uploadID); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_upload_id", "Invalid upload ID.")
		return
	}
	index, err := strconv.Atoi(r.PathValue("index"))
	if err != nil || index < 0 {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_chunk_index", "Invalid chunk index.")
		return
	}

	if h.cache != nil {
		sess, err := h.cache.GetChunkSession(r.Context(), uploadID)
		if err != nil || sess == nil || sess.RoomID != room.ID {
			middleware.WriteError(w, http.StatusNotFound, "upload_session_not_found", "Upload session not found.")
			return
		}
		if index >= sess.TotalChunks {
			middleware.WriteError(w, http.StatusBadRequest, "invalid_chunk_index", "Chunk index out of range.")
			return
		}
	}

	n, err := h.storage.WriteChunk(uploadID, index, r.Body, maxChunkPartSize)
	if err != nil {
		if errors.Is(err, storage.ErrFileTooLarge) {
			middleware.WriteError(w, http.StatusRequestEntityTooLarge, "chunk_too_large", "Chunk exceeds maximum chunk size.")
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "storage_error", "Failed to write chunk.")
		return
	}

	if h.cache != nil {
		_ = h.cache.MarkChunkUploaded(r.Context(), uploadID, index, h.cfg.ChunkUploadTTL)
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"upload_id": uploadID,
		"index":     index,
		"size":      n,
	})
}

// CompleteChunkedUpload handles POST /api/rooms/{code}/files/chunked/{uploadId}/complete.
func (h *FileHandler) CompleteChunkedUpload(w http.ResponseWriter, r *http.Request) {
	room, ok := middleware.RoomFromContext(r.Context())
	if !ok {
		middleware.WriteError(w, http.StatusUnauthorized, "unauthorized", "Room context missing.")
		return
	}
	uploadID := r.PathValue("uploadId")
	if _, err := uuid.Parse(uploadID); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_upload_id", "Invalid upload ID.")
		return
	}

	var sess *cache.ChunkSession
	if h.cache != nil {
		var err error
		sess, err = h.cache.GetChunkSession(r.Context(), uploadID)
		if err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "cache_error", "Failed to load upload session.")
			return
		}
	}
	if sess == nil || sess.RoomID != room.ID {
		middleware.WriteError(w, http.StatusNotFound, "upload_session_not_found", "Upload session not found.")
		return
	}

	qFile, err := h.storage.AssembleChunksToQuarantine(uploadID, sess.TotalChunks, h.cfg.MaxFileSizeBytes)
	if err != nil {
		if errors.Is(err, storage.ErrMissingChunk) {
			middleware.WriteError(w, http.StatusBadRequest, "missing_chunks", err.Error())
			return
		}
		if errors.Is(err, storage.ErrFileTooLarge) {
			middleware.WriteError(w, http.StatusRequestEntityTooLarge, "file_too_large", err.Error())
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "storage_error", "Failed to assemble uploaded chunks into quarantine.")
		return
	}

	detectedMime, status, code, msg := h.inspectQuarantinedFile(r.Context(), qFile, sess.FileName, sess.ContentType)
	if status != 0 {
		middleware.WriteError(w, status, code, msg)
		return
	}

	storedName := uuid.NewString() + ".bin"
	res, err := h.storage.PromoteQuarantine(qFile, room.ID, storedName)
	if err != nil {
		_ = h.storage.DeleteQuarantine(qFile)
		middleware.WriteError(w, http.StatusInternalServerError, "storage_error", "Failed to promote verified chunked file.")
		return
	}

	rec, err := h.commitUploadedFile(r.Context(), room, sess.FileName, storedName, detectedMime, res)
	if err != nil {
		_ = h.storage.Delete(res.StoragePath)
		if errors.Is(err, errRoomExpiredTx) {
			middleware.WriteError(w, http.StatusGone, "room_expired", "This room has expired.")
			return
		}
		if errors.Is(err, storage.ErrFileTooLarge) {
			middleware.WriteError(w, http.StatusRequestEntityTooLarge, "storage_limit_exceeded", "Room storage limit exceeded.")
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to save file metadata.")
		return
	}

	if h.cache != nil {
		h.cache.DeleteChunkSession(r.Context(), uploadID, room.ID)
	}

	h.hub.Publish(r.Context(), realtime.Envelope{
		Type:      realtime.EventFileUploadCompleted,
		RoomID:    room.ID,
		RoomCode:  room.RoomCode,
		Payload:   rec,
		Timestamp: time.Now().UTC(),
	})

	middleware.WriteJSON(w, http.StatusCreated, rec)
}

func (h *FileHandler) remainingRoomQuota(ctx context.Context, room *models.Room) (int64, error) {
	var used int64
	err := h.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(file_size), 0) FROM files WHERE room_id = ?`, room.ID).Scan(&used)
	if err != nil {
		return 0, err
	}
	return room.StorageLimit - used, nil
}

func (h *FileHandler) commitUploadedFile(ctx context.Context, room *models.Room, origName, storedName, mimeType string, res *storage.SavedStreamResult) (models.FileRecord, error) {
	now := time.Now().UTC()
	rec := models.FileRecord{
		ID:            uuid.NewString(),
		RoomID:        room.ID,
		OriginalName:  origName,
		StoredName:    storedName,
		MimeType:      mimeType,
		FileSize:      res.Size,
		StoragePath:   res.StoragePath,
		DownloadCount: 0,
		CreatedAt:     now,
	}

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return rec, err
	}
	defer func() { _ = tx.Rollback() }()

	var storageLimit int64
	var roomStatus string
	var expiresAt time.Time
	err = tx.QueryRowContext(ctx, `SELECT storage_limit, status, expires_at FROM rooms WHERE id = ? FOR UPDATE`, room.ID).Scan(&storageLimit, &roomStatus, &expiresAt)
	if err != nil {
		return rec, err
	}
	if roomStatus != models.RoomStatusActive || !time.Now().UTC().Before(expiresAt) {
		return rec, errRoomExpiredTx
	}

	var used int64
	err = tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(file_size), 0) FROM files WHERE room_id = ?`, room.ID).Scan(&used)
	if err != nil {
		return rec, err
	}
	if used+res.Size > storageLimit {
		return rec, storage.ErrFileTooLarge
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO files (id, room_id, original_name, stored_name, mime_type, file_size, storage_path, download_count, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
	`, rec.ID, rec.RoomID, rec.OriginalName, rec.StoredName, rec.MimeType, rec.FileSize, rec.StoragePath, rec.CreatedAt)
	if err != nil {
		return rec, err
	}

	metaBytes, _ := json.Marshal(map[string]interface{}{
		"file_id":       rec.ID,
		"original_name": rec.OriginalName,
		"file_size":     rec.FileSize,
	})
	_, _ = tx.ExecContext(ctx, `
		INSERT INTO room_events (id, room_id, event_type, metadata, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, uuid.NewString(), room.ID, realtime.EventFileUploadCompleted, string(metaBytes), now)

	if err := tx.Commit(); err != nil {
		return rec, err
	}
	return rec, nil
}

// ListFiles handles GET /api/rooms/{code}/files.
func (h *FileHandler) ListFiles(w http.ResponseWriter, r *http.Request) {
	room, ok := middleware.RoomFromContext(r.Context())
	if !ok {
		middleware.WriteError(w, http.StatusUnauthorized, "unauthorized", "Room context missing.")
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, room_id, original_name, stored_name, mime_type, file_size, storage_path, download_count, created_at
		FROM files
		WHERE room_id = ?
		ORDER BY created_at DESC
	`, room.ID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to list files.")
		return
	}
	defer rows.Close()

	files := make([]models.FileRecord, 0)
	for rows.Next() {
		var f models.FileRecord
		if err := rows.Scan(&f.ID, &f.RoomID, &f.OriginalName, &f.StoredName, &f.MimeType, &f.FileSize, &f.StoragePath, &f.DownloadCount, &f.CreatedAt); err == nil {
			files = append(files, f)
		}
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"files": files,
	})
}

// DownloadFile handles streaming GET /api/files/{id}/download with Range support & download logging.
func (h *FileHandler) DownloadFile(w http.ResponseWriter, r *http.Request) {
	fileRec, room, ok := h.resolveAuthorizedFile(w, r)
	if !ok {
		return
	}

	f, err := h.storage.Open(fileRec.StoragePath)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "file_missing", "Stored file is no longer available.")
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "storage_error", "Failed to read file metadata.")
		return
	}

	rangeHeader := r.Header.Get("Range")
	shouldTrackDownload := r.Method == http.MethodGet && (rangeHeader == "" || strings.HasPrefix(rangeHeader, "bytes=0-"))

	if shouldTrackDownload {
		now := time.Now().UTC()
		var newCount int
		tx, err := h.db.BeginTx(r.Context(), nil)
		if err == nil {
			_, _ = tx.ExecContext(r.Context(), `
				UPDATE files SET download_count = download_count + 1 WHERE id = ?
			`, fileRec.ID)
			_ = tx.QueryRowContext(r.Context(), `
				SELECT download_count FROM files WHERE id = ?
			`, fileRec.ID).Scan(&newCount)
			_, _ = tx.ExecContext(r.Context(), `
				INSERT INTO download_logs (id, file_id, room_id, downloaded_at) VALUES (?, ?, ?, ?)
			`, uuid.NewString(), fileRec.ID, room.ID, now)
			metaBytes, _ := json.Marshal(map[string]interface{}{
				"file_id":        fileRec.ID,
				"original_name":  fileRec.OriginalName,
				"download_count": newCount,
			})
			_, _ = tx.ExecContext(r.Context(), `
				INSERT INTO room_events (id, room_id, event_type, metadata, created_at)
				VALUES (?, ?, ?, ?, ?)
			`, uuid.NewString(), room.ID, realtime.EventFileDownloaded, string(metaBytes), now)
			if err := tx.Commit(); err == nil {
				h.hub.Publish(r.Context(), realtime.Envelope{
					Type:     realtime.EventFileDownloaded,
					RoomID:   room.ID,
					RoomCode: room.RoomCode,
					Payload: map[string]interface{}{
						"file_id":        fileRec.ID,
						"original_name":  fileRec.OriginalName,
						"download_count": newCount,
					},
					Timestamp: now,
				})
			}
		}
	}

	encodedName := url.PathEscape(fileRec.OriginalName)
	w.Header().Set("Content-Type", fileRec.MimeType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, strings.ReplaceAll(fileRec.OriginalName, `"`, `'`), encodedName))

	outWriter := wrapBandwidthLimitedWriter(w, r.Context(), h.cfg.DownloadBandwidthKBps)
	http.ServeContent(outWriter, r, fileRec.OriginalName, stat.ModTime(), f)
}

type bandwidthResponseWriter struct {
	http.ResponseWriter
	ctx         context.Context
	bytesPerSec int64
	tokens      int64
	lastRefill  time.Time
}

func wrapBandwidthLimitedWriter(w http.ResponseWriter, ctx context.Context, kbps int64) http.ResponseWriter {
	if kbps <= 0 {
		return w
	}
	bps := kbps * 1024
	return &bandwidthResponseWriter{
		ResponseWriter: w,
		ctx:            ctx,
		bytesPerSec:    bps,
		tokens:         64 * 1024,
		lastRefill:     time.Now(),
	}
}

func (bw *bandwidthResponseWriter) Write(p []byte) (int, error) {
	total := 0
	const chunkCap = 32 * 1024
	for total < len(p) {
		end := total + chunkCap
		if end > len(p) {
			end = len(p)
		}
		need := int64(end - total)
		now := time.Now()
		elapsed := now.Sub(bw.lastRefill).Seconds()
		if elapsed > 0 {
			bw.tokens += int64(elapsed * float64(bw.bytesPerSec))
			maxBurst := int64(64 * 1024)
			if bw.tokens > maxBurst {
				bw.tokens = maxBurst
			}
			bw.lastRefill = now
		}
		if bw.tokens < need {
			waitSec := float64(need-bw.tokens) / float64(bw.bytesPerSec)
			timer := time.NewTimer(time.Duration(waitSec * float64(time.Second)))
			select {
			case <-bw.ctx.Done():
				timer.Stop()
				return total, bw.ctx.Err()
			case <-timer.C:
			}
			bw.tokens = need
			bw.lastRefill = time.Now()
		}
		bw.tokens -= need
		n, err := bw.ResponseWriter.Write(p[total:end])
		total += n
		if err != nil {
			return total, err
		}
	}
	return total, nil
}

// PreviewFile handles GET /api/files/{id}/preview safely inline with CSP sandbox headers.
func (h *FileHandler) PreviewFile(w http.ResponseWriter, r *http.Request) {
	fileRec, _, ok := h.resolveAuthorizedFile(w, r)
	if !ok {
		return
	}

	isEditable := security.IsEditableTextFile(fileRec.OriginalName, fileRec.MimeType)
	isWord := security.IsWordDocumentFile(fileRec.OriginalName, fileRec.MimeType)
	if !security.IsPreviewableMIME(fileRec.MimeType) && !isEditable && !isWord {
		middleware.WriteError(w, http.StatusUnsupportedMediaType, "preview_unsupported", "Preview is not supported for this file type.")
		return
	}
	if h.cfg != nil && h.cfg.MaxPreviewBytes > 0 && fileRec.FileSize > h.cfg.MaxPreviewBytes {
		middleware.WriteError(w, http.StatusRequestEntityTooLarge, "preview_too_large", "File is too large for safe inline preview. Please download instead.")
		return
	}

	f, err := h.storage.Open(fileRec.StoragePath)
	if err != nil {
		middleware.WriteError(w, http.StatusNotFound, "file_missing", "Stored file is no longer available.")
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "storage_error", "Failed to read file metadata.")
		return
	}

	contentType := fileRec.MimeType
	if isEditable && !strings.HasPrefix(contentType, "text/") && contentType != "application/json" {
		contentType = "text/plain; charset=utf-8"
	} else if isWord {
		contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	}

	if isEditable || isWord {
		w.Header().Set("Cache-Control", "no-store")
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox")
	w.Header().Set("Content-Disposition", "inline")

	http.ServeContent(w, r, fileRec.OriginalName, stat.ModTime(), f)
}

type renameFileRequest struct {
	OriginalName string `json:"original_name"`
}

// RenameFile handles PUT /api/files/{id} to update a file's display name safely.
func (h *FileHandler) RenameFile(w http.ResponseWriter, r *http.Request) {
	fileRec, room, ok := h.resolveAuthorizedFile(w, r)
	if !ok {
		return
	}

	var req renameFileRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8*1024)).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_json", "Invalid rename payload.")
		return
	}

	newName, err := security.SanitizeFilename(req.OriginalName)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_filename", err.Error())
		return
	}

	headerSample := make([]byte, 512)
	if f, openErr := h.storage.Open(fileRec.StoragePath); openErr == nil {
		n, _ := f.Read(headerSample)
		headerSample = headerSample[:n]
		_ = f.Close()
	} else {
		headerSample = nil
	}

	newMime, err := security.ValidateExtensionAndDetectMIME(newName, headerSample, fileRec.MimeType)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "blocked_file_type", err.Error())
		return
	}

	now := time.Now().UTC()
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to begin transaction.")
		return
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(r.Context(), `
		UPDATE files SET original_name = ?, mime_type = ? WHERE id = ?
	`, newName, newMime, fileRec.ID); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to rename file.")
		return
	}

	metaBytes, _ := json.Marshal(map[string]interface{}{
		"file_id":       fileRec.ID,
		"old_name":      fileRec.OriginalName,
		"original_name": newName,
		"action":        "renamed",
	})
	_, _ = tx.ExecContext(r.Context(), `
		INSERT INTO room_events (id, room_id, event_type, metadata, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, uuid.NewString(), room.ID, realtime.EventFileUpdated, string(metaBytes), now)

	if err := tx.Commit(); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to commit file rename.")
		return
	}

	fileRec.OriginalName = newName
	fileRec.MimeType = newMime

	h.hub.Publish(r.Context(), realtime.Envelope{
		Type:      realtime.EventFileUpdated,
		RoomID:    room.ID,
		RoomCode:  room.RoomCode,
		Payload:   fileRec,
		Timestamp: now,
	})

	middleware.WriteJSON(w, http.StatusOK, fileRec)
}

type updateFileContentRequest struct {
	Content string `json:"content"`
}

// overwriteFileBytesAndPublish atomically verifies room quota, overwrites stored bytes, records an edit event, and broadcasts file.updated.
func (h *FileHandler) overwriteFileBytesAndPublish(w http.ResponseWriter, r *http.Request, fileRec *models.FileRecord, room *models.Room, newBytes []byte, action string) {
	newSize := int64(len(newBytes))
	now := time.Now().UTC()
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to begin transaction.")
		return
	}
	defer func() { _ = tx.Rollback() }()

	var storageLimit int64
	var roomStatus string
	var expiresAt time.Time
	if err := tx.QueryRowContext(r.Context(), `
		SELECT storage_limit, status, expires_at FROM rooms WHERE id = ? FOR UPDATE
	`, room.ID).Scan(&storageLimit, &roomStatus, &expiresAt); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to lock room.")
		return
	}
	if roomStatus != models.RoomStatusActive || !now.Before(expiresAt) {
		middleware.WriteError(w, http.StatusGone, "room_expired", "This room has expired.")
		return
	}

	var used int64
	if err := tx.QueryRowContext(r.Context(), `SELECT COALESCE(SUM(file_size), 0) FROM files WHERE room_id = ?`, room.ID).Scan(&used); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to check storage quota.")
		return
	}
	if used-fileRec.FileSize+newSize > storageLimit {
		middleware.WriteError(w, http.StatusRequestEntityTooLarge, "storage_limit_exceeded", "Room storage limit exceeded.")
		return
	}

	if err := h.storage.OverwriteBytes(fileRec.StoragePath, newBytes); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "storage_error", "Failed to save updated file contents.")
		return
	}

	if _, err := tx.ExecContext(r.Context(), `UPDATE files SET file_size = ? WHERE id = ?`, newSize, fileRec.ID); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to update file metadata.")
		return
	}

	metaBytes, _ := json.Marshal(map[string]interface{}{
		"file_id":       fileRec.ID,
		"original_name": fileRec.OriginalName,
		"file_size":     newSize,
		"action":        action,
	})
	_, _ = tx.ExecContext(r.Context(), `
		INSERT INTO room_events (id, room_id, event_type, metadata, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, uuid.NewString(), room.ID, realtime.EventFileUpdated, string(metaBytes), now)

	if err := tx.Commit(); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to commit file edit.")
		return
	}

	fileRec.FileSize = newSize

	h.hub.Publish(r.Context(), realtime.Envelope{
		Type:      realtime.EventFileUpdated,
		RoomID:    room.ID,
		RoomCode:  room.RoomCode,
		Payload:   fileRec,
		Timestamp: now,
	})

	middleware.WriteJSON(w, http.StatusOK, fileRec)
}

// UpdateFileContent handles PUT /api/files/{id}/content for editing text, markdown, and code files.
func (h *FileHandler) UpdateFileContent(w http.ResponseWriter, r *http.Request) {
	fileRec, room, ok := h.resolveAuthorizedFile(w, r)
	if !ok {
		return
	}

	if !security.IsEditableTextFile(fileRec.OriginalName, fileRec.MimeType) {
		middleware.WriteError(w, http.StatusUnsupportedMediaType, "not_editable", "Only text, markdown, and source code files can be edited.")
		return
	}

	maxEditBytes := int64(5 * 1024 * 1024)
	if h.cfg.MaxFileSizeBytes < maxEditBytes {
		maxEditBytes = h.cfg.MaxFileSizeBytes
	}

	var req updateFileContentRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxEditBytes+16*1024)).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_json", "Invalid or oversized file content payload.")
		return
	}

	newBytes := []byte(req.Content)
	if int64(len(newBytes)) > maxEditBytes {
		middleware.WriteError(w, http.StatusRequestEntityTooLarge, "file_too_large", "Edited content exceeds maximum allowed size.")
		return
	}

	h.overwriteFileBytesAndPublish(w, r, fileRec, room, newBytes, "edited")
}

// UpdateWordBinary handles PUT /api/files/{id}/binary for saving updated OOXML (.docx) Word documents.
func (h *FileHandler) UpdateWordBinary(w http.ResponseWriter, r *http.Request) {
	fileRec, room, ok := h.resolveAuthorizedFile(w, r)
	if !ok {
		return
	}

	if !security.IsWordDocumentFile(fileRec.OriginalName, fileRec.MimeType) {
		middleware.WriteError(w, http.StatusUnsupportedMediaType, "not_editable", "Only .docx Word documents can be updated via this endpoint.")
		return
	}

	maxWordBytes := int64(25 * 1024 * 1024)
	if h.cfg.MaxFileSizeBytes < maxWordBytes {
		maxWordBytes = h.cfg.MaxFileSizeBytes
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxWordBytes+64*1024)
	if err := r.ParseMultipartForm(4 * 1024 * 1024); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_multipart", "Invalid or oversized Word document payload.")
		return
	}
	defer func() {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	}()

	src, _, err := r.FormFile("file")
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "missing_file", "Word document file part is required.")
		return
	}
	defer src.Close()

	qFile, err := h.storage.SaveQuarantineStream(src, maxWordBytes)
	if err != nil {
		if errors.Is(err, storage.ErrFileTooLarge) {
			middleware.WriteError(w, http.StatusRequestEntityTooLarge, "file_too_large", "Word document exceeds maximum editable size.")
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "storage_error", "Failed to stage Word document.")
		return
	}

	_, status, code, msg := h.inspectQuarantinedFile(r.Context(), qFile, fileRec.OriginalName, fileRec.MimeType)
	if status != 0 {
		middleware.WriteError(w, status, code, msg)
		return
	}

	newBytes, err := os.ReadFile(qFile.AbsPath)
	_ = h.storage.DeleteQuarantine(qFile)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "read_error", "Failed to read verified Word document.")
		return
	}

	h.overwriteFileBytesAndPublish(w, r, fileRec, room, newBytes, "edited")
}

// DeleteFile handles DELETE /api/files/{id}.
func (h *FileHandler) DeleteFile(w http.ResponseWriter, r *http.Request) {
	fileRec, room, ok := h.resolveAuthorizedFile(w, r)
	if !ok {
		return
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to begin transaction.")
		return
	}
	defer func() { _ = tx.Rollback() }()

	res, err := tx.ExecContext(r.Context(), `DELETE FROM files WHERE id = ?`, fileRec.ID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to delete file.")
		return
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		middleware.WriteError(w, http.StatusNotFound, "file_not_found", "File not found.")
		return
	}

	now := time.Now().UTC()
	metaBytes, _ := json.Marshal(map[string]string{
		"file_id":       fileRec.ID,
		"original_name": fileRec.OriginalName,
	})
	_, _ = tx.ExecContext(r.Context(), `
		INSERT INTO room_events (id, room_id, event_type, metadata, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, uuid.NewString(), room.ID, realtime.EventFileDeleted, string(metaBytes), now)

	if err := tx.Commit(); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to commit file deletion.")
		return
	}

	_ = h.storage.Delete(fileRec.StoragePath)

	h.hub.Publish(r.Context(), realtime.Envelope{
		Type:     realtime.EventFileDeleted,
		RoomID:   room.ID,
		RoomCode: room.RoomCode,
		Payload: map[string]interface{}{
			"id":            fileRec.ID,
			"original_name": fileRec.OriginalName,
		},
		Timestamp: now,
	})

	middleware.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"deleted": true,
		"id":      fileRec.ID,
	})
}

type bulkDeleteFilesRequest struct {
	FileIDs []string `json:"file_ids"`
}

// BulkDeleteFiles handles POST /api/rooms/{code}/files/bulk-delete.
func (h *FileHandler) BulkDeleteFiles(w http.ResponseWriter, r *http.Request) {
	room, ok := middleware.RoomFromContext(r.Context())
	if !ok {
		middleware.WriteError(w, http.StatusUnauthorized, "unauthorized", "Room context missing.")
		return
	}

	var req bulkDeleteFilesRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024)).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_json", "Invalid bulk delete payload.")
		return
	}

	seen := make(map[string]struct{}, len(req.FileIDs))
	validIDs := make([]string, 0, len(req.FileIDs))
	for _, rawID := range req.FileIDs {
		id := strings.TrimSpace(rawID)
		if _, err := uuid.Parse(id); err != nil {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		validIDs = append(validIDs, id)
	}

	if len(validIDs) == 0 {
		middleware.WriteError(w, http.StatusBadRequest, "no_file_ids", "Select at least one valid file ID.")
		return
	}
	if len(validIDs) > 200 {
		middleware.WriteError(w, http.StatusBadRequest, "too_many_files", "Cannot delete more than 200 files at once.")
		return
	}

	placeholders := strings.Repeat("?,", len(validIDs))
	placeholders = placeholders[:len(placeholders)-1]

	args := make([]interface{}, 0, len(validIDs)+1)
	args = append(args, room.ID)
	for _, id := range validIDs {
		args = append(args, id)
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to begin bulk delete transaction.")
		return
	}
	defer func() { _ = tx.Rollback() }()

	rows, err := tx.QueryContext(
		r.Context(),
		fmt.Sprintf(`SELECT id, original_name, storage_path FROM files WHERE room_id = ? AND id IN (%s)`, placeholders),
		args...,
	)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to query selected files.")
		return
	}

	type targetFile struct {
		id           string
		originalName string
		storagePath  string
	}
	targets := make([]targetFile, 0, len(validIDs))
	for rows.Next() {
		var tf targetFile
		if err := rows.Scan(&tf.id, &tf.originalName, &tf.storagePath); err == nil {
			targets = append(targets, tf)
		}
	}
	rows.Close()

	if len(targets) == 0 {
		middleware.WriteJSON(w, http.StatusOK, map[string]interface{}{
			"deleted_ids":   []string{},
			"deleted_count": 0,
		})
		return
	}

	if _, err := tx.ExecContext(
		r.Context(),
		fmt.Sprintf(`DELETE FROM files WHERE room_id = ? AND id IN (%s)`, placeholders),
		args...,
	); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to delete selected files.")
		return
	}

	now := time.Now().UTC()
	deletedIDs := make([]string, 0, len(targets))
	for _, tf := range targets {
		deletedIDs = append(deletedIDs, tf.id)
		metaBytes, _ := json.Marshal(map[string]string{
			"file_id":       tf.id,
			"original_name": tf.originalName,
		})
		_, _ = tx.ExecContext(r.Context(), `
			INSERT INTO room_events (id, room_id, event_type, metadata, created_at)
			VALUES (?, ?, ?, ?, ?)
		`, uuid.NewString(), room.ID, realtime.EventFileDeleted, string(metaBytes), now)
	}

	if err := tx.Commit(); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to commit bulk deletion.")
		return
	}

	for _, tf := range targets {
		_ = h.storage.Delete(tf.storagePath)
		h.hub.Publish(r.Context(), realtime.Envelope{
			Type:     realtime.EventFileDeleted,
			RoomID:   room.ID,
			RoomCode: room.RoomCode,
			Payload: map[string]interface{}{
				"id":            tf.id,
				"original_name": tf.originalName,
			},
			Timestamp: now,
		})
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"deleted_ids":   deletedIDs,
		"deleted_count": len(deletedIDs),
	})
}

func (h *FileHandler) resolveAuthorizedFile(w http.ResponseWriter, r *http.Request) (*models.FileRecord, *models.Room, bool) {
	fileID := r.PathValue("id")
	if _, err := uuid.Parse(fileID); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_file_id", "Invalid file ID.")
		return nil, nil, false
	}

	var f models.FileRecord
	var room models.Room
	var pwHash sql.NullString
	err := h.db.QueryRowContext(r.Context(), `
		SELECT f.id, f.room_id, f.original_name, f.stored_name, f.mime_type, f.file_size, f.storage_path, f.download_count, f.created_at,
		       r.id, r.room_code, r.created_at, r.expires_at, r.status, r.password_hash, r.storage_limit
		FROM files f
		JOIN rooms r ON r.id = f.room_id
		WHERE f.id = ?
	`, fileID).Scan(
		&f.ID, &f.RoomID, &f.OriginalName, &f.StoredName, &f.MimeType, &f.FileSize, &f.StoragePath, &f.DownloadCount, &f.CreatedAt,
		&room.ID, &room.RoomCode, &room.CreatedAt, &room.ExpiresAt, &room.Status, &pwHash, &room.StorageLimit,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			middleware.WriteError(w, http.StatusNotFound, "file_not_found", "File not found.")
			return nil, nil, false
		}
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to load file.")
		return nil, nil, false
	}
	if pwHash.Valid {
		room.PasswordHash = &pwHash.String
	}

	if room.Status != models.RoomStatusActive || !time.Now().UTC().Before(room.ExpiresAt) {
		middleware.WriteError(w, http.StatusGone, "room_expired", "This room has expired.")
		return nil, nil, false
	}

	if !middleware.IsRoomAuthorized(r, &room, h.cfg.TokenSecret) {
		middleware.WriteError(w, http.StatusUnauthorized, "password_required", "Room password verification is required.")
		return nil, nil, false
	}

	return &f, &room, true
}
