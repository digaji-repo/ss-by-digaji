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
	"github.com/droproom/backend/internal/security"
	"github.com/go-sql-driver/mysql"
	"github.com/google/uuid"
)

var (
	allowedMinutes = []int{5, 10, 15, 30, 45}
	allowedHours   = []int{1, 2, 3, 6, 12, 24}
	allowedDays    = []int{1, 2, 3, 5, 7}
)

// RoomHandler handles room creation, detail lookup, password validation, and activity logs.
type RoomHandler struct {
	db    *sql.DB
	cache *cache.Client
	cfg   *config.Config
}

// NewRoomHandler constructs RoomHandler.
func NewRoomHandler(db *sql.DB, cacheClient *cache.Client, cfg *config.Config) *RoomHandler {
	return &RoomHandler{db: db, cache: cacheClient, cfg: cfg}
}

type createRoomRequest struct {
	RoomCode      string `json:"room_code"`
	DurationUnit  string `json:"duration_unit"`
	DurationValue int    `json:"duration_value"`
	Password      string `json:"password"`
	StorageLimit  int64  `json:"storage_limit"`
}

type validateRoomRequest struct {
	Password string `json:"password"`
}

func resolveExpirationDuration(unit string, value int) (time.Duration, bool) {
	switch strings.ToLower(strings.TrimSpace(unit)) {
	case "minutes", "minute":
		if slices.Contains(allowedMinutes, value) {
			return time.Duration(value) * time.Minute, true
		}
	case "hours", "hour":
		if slices.Contains(allowedHours, value) {
			return time.Duration(value) * time.Hour, true
		}
	case "days", "day":
		if slices.Contains(allowedDays, value) {
			return time.Duration(value) * 24 * time.Hour, true
		}
	}
	return 0, false
}

// CreateRoom handles POST /api/rooms.
func (h *RoomHandler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	var req createRoomRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16*1024)).Decode(&req); err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_json", "Invalid request body.")
		return
	}

	dur, ok := resolveExpirationDuration(req.DurationUnit, req.DurationValue)
	if !ok || dur > 7*24*time.Hour {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_duration", "Duration must be a valid preset (minutes: 5,10,15,30,45; hours: 1,2,3,6,12,24; days: 1,2,3,5,7).")
		return
	}

	isCustom := strings.TrimSpace(req.RoomCode) != ""
	var customCode string
	if isCustom {
		norm, err := security.ValidateRoomCode(req.RoomCode)
		if err != nil {
			middleware.WriteError(w, http.StatusBadRequest, "invalid_room_code", err.Error())
			return
		}
		customCode = norm
	}

	var passwordHash *string
	if req.Password != "" {
		if len(req.Password) > 128 {
			middleware.WriteError(w, http.StatusBadRequest, "invalid_password", "Password must be at most 128 characters.")
			return
		}
		hashed, err := security.HashPassword(req.Password)
		if err != nil {
			middleware.WriteError(w, http.StatusInternalServerError, "hash_error", "Failed to process room password.")
			return
		}
		passwordHash = &hashed
	}

	storageLimit := h.cfg.DefaultStorageLimitBytes
	if req.StorageLimit > 0 {
		minLimit := int64(10 * 1024 * 1024)
		if req.StorageLimit < minLimit {
			storageLimit = minLimit
		} else if req.StorageLimit <= h.cfg.DefaultStorageLimitBytes*4 {
			storageLimit = req.StorageLimit
		}
	}

	now := time.Now().UTC()
	expiresAt := now.Add(dur)

	var created models.Room
	maxAttempts := 15
	if isCustom {
		maxAttempts = 1
	}

	var insertErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		code := customCode
		if !isCustom {
			generated, err := security.GenerateRoomCode()
			if err != nil {
				middleware.WriteError(w, http.StatusInternalServerError, "code_gen_error", "Failed to generate room code.")
				return
			}
			code = generated
		}

		created, insertErr = h.insertRoomTx(r.Context(), code, now, expiresAt, passwordHash, storageLimit)
		if insertErr == nil {
			break
		}
		var myErr *mysql.MySQLError
		if errors.As(insertErr, &myErr) && myErr.Number == 1062 {
			if isCustom {
				middleware.WriteError(w, http.StatusConflict, "room_code_taken", "This room code is already in use. Please choose another 3-character code.")
				return
			}
			continue
		}
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to create room.")
		return
	}

	if insertErr != nil {
		middleware.WriteError(w, http.StatusServiceUnavailable, "code_exhausted", "Unable to allocate a unique room code. Please try again.")
		return
	}

	if h.cache != nil {
		h.cache.SetRoomCache(r.Context(), &created, dur)
	}

	var accessToken string
	if created.PasswordHash != nil {
		accessToken = security.IssueRoomToken(h.cfg.TokenSecret, created.ID, created.ExpiresAt)
		h.setRoomCookie(w, accessToken, created.ExpiresAt)
	}

	middleware.WriteJSON(w, http.StatusCreated, models.RoomResponse{
		ID:           created.ID,
		RoomCode:     created.RoomCode,
		CreatedAt:    created.CreatedAt,
		ExpiresAt:    created.ExpiresAt,
		ServerTime:   time.Now().UTC(),
		Status:       created.Status,
		HasPassword:  created.PasswordHash != nil,
		Authorized:   true,
		StorageLimit: created.StorageLimit,
		UsedStorage:  0,
		MaxFileSize:  h.cfg.MaxFileSizeBytes,
		AccessToken:  accessToken,
	})
}

func (h *RoomHandler) insertRoomTx(ctx context.Context, code string, createdAt, expiresAt time.Time, passwordHash *string, storageLimit int64) (models.Room, error) {
	room := models.Room{
		ID:           uuid.NewString(),
		RoomCode:     code,
		CreatedAt:    createdAt,
		ExpiresAt:    expiresAt,
		Status:       models.RoomStatusActive,
		PasswordHash: passwordHash,
		StorageLimit: storageLimit,
	}

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return room, err
	}
	defer func() { _ = tx.Rollback() }()

	// Free an already-expired room tombstone if its 3-char code is requested again.
	_, _ = tx.ExecContext(ctx, `
		DELETE FROM rooms
		WHERE room_code = ? AND (status = 'expired' OR expires_at <= ?)
	`, code, createdAt)

	var pwVal interface{}
	if passwordHash != nil {
		pwVal = *passwordHash
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO rooms (id, room_code, created_at, expires_at, status, password_hash, storage_limit)
		VALUES (?, ?, ?, ?, 'active', ?, ?)
	`, room.ID, room.RoomCode, room.CreatedAt, room.ExpiresAt, pwVal, room.StorageLimit)
	if err != nil {
		return room, err
	}

	metaBytes, _ := json.Marshal(map[string]string{"room_code": room.RoomCode})
	_, err = tx.ExecContext(ctx, `
		INSERT INTO room_events (id, room_id, event_type, metadata, created_at)
		VALUES (?, ?, 'room.created', ?, ?)
	`, uuid.NewString(), room.ID, string(metaBytes), createdAt)
	if err != nil {
		return room, err
	}

	if err := tx.Commit(); err != nil {
		return room, err
	}
	return room, nil
}

// GetRoom handles GET /api/rooms/{code}.
func (h *RoomHandler) GetRoom(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")
	room, err := middleware.LoadRoomByCode(r.Context(), h.db, h.cache, code)
	if err != nil {
		if errors.Is(err, security.ErrInvalidRoomCode) {
			middleware.WriteError(w, http.StatusBadRequest, "invalid_room_code", err.Error())
			return
		}
		if errors.Is(err, sql.ErrNoRows) {
			middleware.WriteError(w, http.StatusNotFound, "room_not_found", "Room not found.")
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Unable to look up room.")
		return
	}

	now := time.Now().UTC()
	if room.Status != models.RoomStatusActive || !now.Before(room.ExpiresAt) {
		middleware.WriteError(w, http.StatusGone, "room_expired", "This room has expired.")
		return
	}

	var usedStorage int64
	_ = h.db.QueryRowContext(r.Context(), `SELECT COALESCE(SUM(file_size), 0) FROM files WHERE room_id = ?`, room.ID).Scan(&usedStorage)

	authorized := middleware.IsRoomAuthorized(r, room, h.cfg.TokenSecret)
	middleware.WriteJSON(w, http.StatusOK, models.RoomResponse{
		ID:           room.ID,
		RoomCode:     room.RoomCode,
		CreatedAt:    room.CreatedAt,
		ExpiresAt:    room.ExpiresAt,
		ServerTime:   now,
		Status:       room.Status,
		HasPassword:  room.PasswordHash != nil && *room.PasswordHash != "",
		Authorized:   authorized,
		StorageLimit: room.StorageLimit,
		UsedStorage:  usedStorage,
		MaxFileSize:  h.cfg.MaxFileSizeBytes,
	})
}

// ValidateRoom handles POST /api/rooms/{code}/validate.
func (h *RoomHandler) ValidateRoom(w http.ResponseWriter, r *http.Request) {
	rawCode := r.PathValue("code")
	normCode, err := security.ValidateRoomCode(rawCode)
	if err != nil {
		middleware.WriteError(w, http.StatusBadRequest, "invalid_room_code", err.Error())
		return
	}

	ip := middleware.ClientIP(r)
	if h.cache != nil {
		if locked, retryAfter := h.cache.CheckPasswordLockout(r.Context(), normCode, ip, h.cfg.PasswordMaxAttempts); locked {
			w.Header().Set("Retry-After", time.Duration(retryAfter.Seconds()).String())
			middleware.WriteError(w, http.StatusTooManyRequests, "password_locked", "Too many failed password attempts. Please try again later.")
			return
		}
	}

	room, err := middleware.LoadRoomByCode(r.Context(), h.db, h.cache, normCode)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			middleware.WriteError(w, http.StatusNotFound, "room_not_found", "Room not found.")
			return
		}
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Unable to validate room.")
		return
	}

	now := time.Now().UTC()
	if room.Status != models.RoomStatusActive || !now.Before(room.ExpiresAt) {
		middleware.WriteError(w, http.StatusGone, "room_expired", "This room has expired.")
		return
	}

	var req validateRoomRequest
	if r.Body != nil && r.ContentLength != 0 {
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 8*1024)).Decode(&req)
	}

	var accessToken string
	if room.PasswordHash != nil && *room.PasswordHash != "" {
		if req.Password == "" {
			if middleware.IsRoomAuthorized(r, room, h.cfg.TokenSecret) {
				accessToken = middleware.ExtractRoomToken(r)
			} else {
				middleware.WriteError(w, http.StatusUnauthorized, "password_required", "This room is protected by a password.")
				return
			}
		} else if !security.VerifyPassword(*room.PasswordHash, req.Password) {
			remaining := h.cfg.PasswordMaxAttempts
			if h.cache != nil {
				remaining = h.cache.RecordPasswordFailure(r.Context(), normCode, ip, h.cfg.PasswordMaxAttempts, h.cfg.PasswordLockoutDuration)
			}
			middleware.WriteJSON(w, http.StatusUnauthorized, map[string]interface{}{
				"error":              "Unauthorized",
				"code":               "invalid_password",
				"message":            "Incorrect room password.",
				"remaining_attempts": remaining,
			})
			return
		} else {
			if h.cache != nil {
				h.cache.ClearPasswordFailures(r.Context(), normCode, ip)
			}
			accessToken = security.IssueRoomToken(h.cfg.TokenSecret, room.ID, room.ExpiresAt)
			h.setRoomCookie(w, accessToken, room.ExpiresAt)
		}
	}

	var usedStorage int64
	_ = h.db.QueryRowContext(r.Context(), `SELECT COALESCE(SUM(file_size), 0) FROM files WHERE room_id = ?`, room.ID).Scan(&usedStorage)

	middleware.WriteJSON(w, http.StatusOK, models.RoomResponse{
		ID:           room.ID,
		RoomCode:     room.RoomCode,
		CreatedAt:    room.CreatedAt,
		ExpiresAt:    room.ExpiresAt,
		ServerTime:   now,
		Status:       room.Status,
		HasPassword:  room.PasswordHash != nil && *room.PasswordHash != "",
		Authorized:   true,
		StorageLimit: room.StorageLimit,
		UsedStorage:  usedStorage,
		MaxFileSize:  h.cfg.MaxFileSizeBytes,
		AccessToken:  accessToken,
	})
}

// ListEvents handles GET /api/rooms/{code}/events.
func (h *RoomHandler) ListEvents(w http.ResponseWriter, r *http.Request) {
	room, ok := middleware.RoomFromContext(r.Context())
	if !ok {
		middleware.WriteError(w, http.StatusUnauthorized, "unauthorized", "Room context missing.")
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, room_id, event_type, metadata, created_at
		FROM (
			SELECT id, room_id, event_type, metadata, created_at
			FROM room_events
			WHERE room_id = ?
			ORDER BY created_at DESC
			LIMIT 50
		) recent
		ORDER BY created_at ASC
	`, room.ID)
	if err != nil {
		middleware.WriteError(w, http.StatusInternalServerError, "db_error", "Failed to load room events.")
		return
	}
	defer rows.Close()

	events := make([]models.RoomEvent, 0)
	for rows.Next() {
		var ev models.RoomEvent
		var metaStr string
		if err := rows.Scan(&ev.ID, &ev.RoomID, &ev.EventType, &metaStr, &ev.CreatedAt); err == nil {
			ev.Metadata = json.RawMessage(metaStr)
			events = append(events, ev)
		}
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"events": events,
	})
}

func (h *RoomHandler) setRoomCookie(w http.ResponseWriter, token string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     middleware.RoomCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   h.cfg.CookieSecure,
	})
}
