package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/droproom/backend/internal/cache"
	"github.com/droproom/backend/internal/config"
	"github.com/droproom/backend/internal/middleware"
	"github.com/droproom/backend/internal/models"
	"github.com/droproom/backend/internal/realtime"
	"github.com/google/uuid"
)

// PasteHandler manages paste CRUD and realtime synchronization.
type PasteHandler struct {
	db    *sql.DB
	cache *cache.Client
	hub   *realtime.Hub
	cfg   *config.Config
}

// NewPasteHandler constructs PasteHandler.
func NewPasteHandler(db *sql.DB, cacheClient *cache.Client, hub *realtime.Hub, cfg *config.Config) *PasteHandler {
	return &PasteHandler{db: db, cache: cacheClient, hub: hub, cfg: cfg}
}

type pastePayload struct {
	Title          string `json:"title"`
	Content        string `json:"content"`
	SyntaxLanguage string `json:"syntax_language"`
}

func sanitizePasteInput(req pastePayload, maxBytes int64) (string, string, string, bool) {
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = "Untitled Paste"
	}
	if len(title) > 255 {
		title = title[:255]
	}
	lang := strings.ToLower(strings.TrimSpace(req.SyntaxLanguage))
	if lang == "" {
		lang = "plaintext"
	}
	if len(lang) > 64 {
		lang = lang[:64]
	}
	if int64(len(req.Content)) > maxBytes {
		return "", "", "", false
	}
	return title, req.Content, lang, true
}

// CreatePaste handles POST /api/rooms/{code}/pastes.
func (h *PasteHandler) CreatePaste(w http.ResponseWriter, r *http.Request) {
	room, ok := middleware.RoomFromContext(r.Context())
	if !ok {
		middleware.WriteError(w, http.StatusUnauthorized, "unauthorized", "Room context missing.")
		return
	}

	var req pastePayload
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, h.cfg.MaxPasteSizeBytes+8192)).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_json", "Invalid paste payload.")
		return
	}

	title, content, lang, valid := sanitizePasteInput(req, h.cfg.MaxPasteSizeBytes)
	if !valid {
		middleware.WriteError(w, http.StatusRequestEntityTooLarge, "paste_too_large", "Paste content exceeds maximum allowed size.")
		return
	}

	now := time.Now().UTC()
	paste := models.Paste{
		ID:             uuid.NewString(),
		RoomID:         room.ID,
		Title:          title,
		Content:        content,
		SyntaxLanguage: lang,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to begin transaction.")
		return
	}
	defer func() { _ = tx.Rollback() }()

	_, err = tx.ExecContext(r.Context(), `
		INSERT INTO pastes (id, room_id, title, content, syntax_language, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, paste.ID, paste.RoomID, paste.Title, paste.Content, paste.SyntaxLanguage, paste.CreatedAt, paste.UpdatedAt)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to create paste.")
		return
	}

	metaBytes, _ := json.Marshal(map[string]string{
		"paste_id":        paste.ID,
		"title":           paste.Title,
		"syntax_language": paste.SyntaxLanguage,
	})
	_, _ = tx.ExecContext(r.Context(), `
		INSERT INTO room_events (id, room_id, event_type, metadata, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, uuid.NewString(), room.ID, realtime.EventPasteCreated, string(metaBytes), now)

	if err := tx.Commit(); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to commit paste.")
		return
	}

	h.hub.Publish(r.Context(), realtime.Envelope{
		Type:      realtime.EventPasteCreated,
		RoomID:    room.ID,
		RoomCode:  room.RoomCode,
		Payload:   paste,
		Timestamp: now,
	})

	middleware.WriteJSON(w, http.StatusCreated, paste)
}

// ListPastes handles GET /api/rooms/{code}/pastes.
func (h *PasteHandler) ListPastes(w http.ResponseWriter, r *http.Request) {
	room, ok := middleware.RoomFromContext(r.Context())
	if !ok {
		middleware.WriteError(w, http.StatusUnauthorized, "unauthorized", "Room context missing.")
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, room_id, title, content, syntax_language, created_at, updated_at
		FROM pastes
		WHERE room_id = ?
		ORDER BY updated_at DESC
	`, room.ID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to list pastes.")
		return
	}
	defer rows.Close()

	pastes := make([]models.Paste, 0)
	for rows.Next() {
		var p models.Paste
		if err := rows.Scan(&p.ID, &p.RoomID, &p.Title, &p.Content, &p.SyntaxLanguage, &p.CreatedAt, &p.UpdatedAt); err == nil {
			pastes = append(pastes, p)
		}
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"pastes": pastes,
	})
}

// UpdatePaste handles PUT /api/pastes/{id}.
func (h *PasteHandler) UpdatePaste(w http.ResponseWriter, r *http.Request) {
	pasteID := r.PathValue("id")
	if _, err := uuid.Parse(pasteID); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_paste_id", "Invalid paste ID.")
		return
	}

	room, existingCreatedAt, ok := h.resolveAuthorizedRoomForPaste(w, r, pasteID)
	if !ok {
		return
	}

	var req pastePayload
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, h.cfg.MaxPasteSizeBytes+8192)).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_json", "Invalid paste payload.")
		return
	}

	title, content, lang, valid := sanitizePasteInput(req, h.cfg.MaxPasteSizeBytes)
	if !valid {
		middleware.WriteError(w, http.StatusRequestEntityTooLarge, "paste_too_large", "Paste content exceeds maximum allowed size.")
		return
	}

	now := time.Now().UTC()
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to begin transaction.")
		return
	}
	defer func() { _ = tx.Rollback() }()

	res, err := tx.ExecContext(r.Context(), `
		UPDATE pastes
		SET title = ?, content = ?, syntax_language = ?, updated_at = ?
		WHERE id = ?
	`, title, content, lang, now, pasteID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to update paste.")
		return
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		middleware.WriteError(w, http.StatusNotFound, "paste_not_found", "Paste not found.")
		return
	}

	updated := models.Paste{
		ID:             pasteID,
		RoomID:         room.ID,
		Title:          title,
		Content:        content,
		SyntaxLanguage: lang,
		CreatedAt:      existingCreatedAt,
		UpdatedAt:      now,
	}

	metaBytes, _ := json.Marshal(map[string]string{
		"paste_id":        updated.ID,
		"title":           updated.Title,
		"syntax_language": updated.SyntaxLanguage,
	})
	_, _ = tx.ExecContext(r.Context(), `
		INSERT INTO room_events (id, room_id, event_type, metadata, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, uuid.NewString(), room.ID, realtime.EventPasteUpdated, string(metaBytes), now)

	if err := tx.Commit(); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to commit paste update.")
		return
	}

	h.hub.Publish(r.Context(), realtime.Envelope{
		Type:      realtime.EventPasteUpdated,
		RoomID:    room.ID,
		RoomCode:  room.RoomCode,
		Payload:   updated,
		Timestamp: now,
	})

	middleware.WriteJSON(w, http.StatusOK, updated)
}

// DeletePaste handles DELETE /api/pastes/{id}.
func (h *PasteHandler) DeletePaste(w http.ResponseWriter, r *http.Request) {
	pasteID := r.PathValue("id")
	if _, err := uuid.Parse(pasteID); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_paste_id", "Invalid paste ID.")
		return
	}

	room, _, ok := h.resolveAuthorizedRoomForPaste(w, r, pasteID)
	if !ok {
		return
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to begin transaction.")
		return
	}
	defer func() { _ = tx.Rollback() }()

	var deletedTitle string
	err = tx.QueryRowContext(r.Context(), `SELECT title FROM pastes WHERE id = ?`, pasteID).Scan(&deletedTitle)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			middleware.WriteError(w, http.StatusNotFound, "paste_not_found", "Paste not found.")
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to look up paste.")
		return
	}

	if _, err := tx.ExecContext(r.Context(), `DELETE FROM pastes WHERE id = ?`, pasteID); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to delete paste.")
		return
	}

	now := time.Now().UTC()
	metaBytes, _ := json.Marshal(map[string]string{
		"paste_id": pasteID,
		"title":    deletedTitle,
	})
	_, _ = tx.ExecContext(r.Context(), `
		INSERT INTO room_events (id, room_id, event_type, metadata, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, uuid.NewString(), room.ID, realtime.EventPasteDeleted, string(metaBytes), now)

	if err := tx.Commit(); err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to commit paste deletion.")
		return
	}

	h.hub.Publish(r.Context(), realtime.Envelope{
		Type:     realtime.EventPasteDeleted,
		RoomID:   room.ID,
		RoomCode: room.RoomCode,
		Payload: map[string]interface{}{
			"id":    pasteID,
			"title": deletedTitle,
		},
		Timestamp: now,
	})

	middleware.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"deleted": true,
		"id":      pasteID,
	})
}

func (h *PasteHandler) resolveAuthorizedRoomForPaste(w http.ResponseWriter, r *http.Request, pasteID string) (*models.Room, time.Time, bool) {
	var room models.Room
	var pwHash sql.NullString
	var pasteCreatedAt time.Time
	err := h.db.QueryRowContext(r.Context(), `
		SELECT p.created_at, r.id, r.room_code, r.created_at, r.expires_at, r.status, r.password_hash, r.storage_limit
		FROM pastes p
		JOIN rooms r ON r.id = p.room_id
		WHERE p.id = ?
	`, pasteID).Scan(
		&pasteCreatedAt,
		&room.ID,
		&room.RoomCode,
		&room.CreatedAt,
		&room.ExpiresAt,
		&room.Status,
		&pwHash,
		&room.StorageLimit,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			middleware.WriteError(w, http.StatusNotFound, "paste_not_found", "Paste not found.")
			return nil, time.Time{}, false
		}
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to resolve paste room.")
		return nil, time.Time{}, false
	}
	if pwHash.Valid {
		room.PasswordHash = &pwHash.String
	}

	if room.Status != models.RoomStatusActive || !time.Now().UTC().Before(room.ExpiresAt) {
		middleware.WriteError(w, http.StatusGone, "room_expired", "This room has expired.")
		return nil, time.Time{}, false
	}

	if !middleware.IsRoomAuthorized(r, &room, h.cfg.TokenSecret) {
		middleware.WriteError(w, http.StatusUnauthorized, "password_required", "Room password verification is required.")
		return nil, time.Time{}, false
	}

	return &room, pasteCreatedAt, true
}
