package middleware

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/droproom/backend/internal/cache"
	"github.com/droproom/backend/internal/models"
	"github.com/droproom/backend/internal/security"
)

const RoomCookieName = "droproom_access"

type ctxKey string

const roomContextKey ctxKey = "resolved_room"

// RoomFromContext retrieves the validated active room injected by RoomAuth middleware.
func RoomFromContext(ctx context.Context) (*models.Room, bool) {
	r, ok := ctx.Value(roomContextKey).(*models.Room)
	return r, ok
}

// WithRoom attaches a resolved room to ctx.
func WithRoom(ctx context.Context, room *models.Room) context.Context {
	return context.WithValue(ctx, roomContextKey, room)
}

// ExtractRoomToken reads the signed access token from X-Room-Token, query token, or cookie.
func ExtractRoomToken(r *http.Request) string {
	if header := strings.TrimSpace(r.Header.Get("X-Room-Token")); header != "" {
		return header
	}
	if auth := strings.TrimSpace(r.Header.Get("Authorization")); strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
	}
	if query := strings.TrimSpace(r.URL.Query().Get("token")); query != "" {
		return query
	}
	if c, err := r.Cookie(RoomCookieName); err == nil && c.Value != "" {
		return c.Value
	}
	return ""
}

// LoadRoomByCode resolves a room by 3-char code from cache or MySQL/MariaDB.
func LoadRoomByCode(ctx context.Context, db *sql.DB, cacheClient *cache.Client, rawCode string) (*models.Room, error) {
	code, err := security.ValidateRoomCode(rawCode)
	if err != nil {
		return nil, security.ErrInvalidRoomCode
	}

	if cacheClient != nil {
		if cached, ok := cacheClient.GetRoomCache(ctx, code); ok {
			return cached, nil
		}
	}

	var room models.Room
	var pwHash sql.NullString
	err = db.QueryRowContext(ctx, `
		SELECT id, room_code, created_at, expires_at, status, password_hash, storage_limit
		FROM rooms
		WHERE room_code = ?
	`, code).Scan(
		&room.ID,
		&room.RoomCode,
		&room.CreatedAt,
		&room.ExpiresAt,
		&room.Status,
		&pwHash,
		&room.StorageLimit,
	)
	if err != nil {
		return nil, err
	}
	if pwHash.Valid {
		room.PasswordHash = &pwHash.String
	}

	if cacheClient != nil {
		cacheClient.SetRoomCache(ctx, &room, time.Until(room.ExpiresAt))
	}
	return &room, nil
}

// IsRoomAuthorized checks whether the caller holds a valid token when the room has a password.
func IsRoomAuthorized(r *http.Request, room *models.Room, tokenSecret string) bool {
	if room.PasswordHash == nil || *room.PasswordHash == "" {
		return true
	}
	token := ExtractRoomToken(r)
	if token == "" {
		return false
	}
	return security.VerifyRoomToken(tokenSecret, token, room.ID)
}

// RequireActiveRoom verifies room existence, non-expiration, and optional password token.
func RequireActiveRoom(db *sql.DB, cacheClient *cache.Client, tokenSecret string, codeExtractor func(*http.Request) string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rawCode := codeExtractor(r)
			room, err := LoadRoomByCode(r.Context(), db, cacheClient, rawCode)
			if err != nil {
				if errors.Is(err, security.ErrInvalidRoomCode) {
					WriteError(w, http.StatusBadRequest, "invalid_room_code", err.Error())
					return
				}
				if errors.Is(err, sql.ErrNoRows) {
					WriteError(w, http.StatusNotFound, "room_not_found", "Room not found.")
					return
				}
				WriteError(w, http.StatusInternalServerError, "db_error", "Unable to look up room.")
				return
			}

			if room.Status != models.RoomStatusActive || !time.Now().UTC().Before(room.ExpiresAt) {
				WriteError(w, http.StatusGone, "room_expired", "This room has expired.")
				return
			}

			if !IsRoomAuthorized(r, room, tokenSecret) {
				WriteError(w, http.StatusUnauthorized, "password_required", "Room password verification is required.")
				return
			}

			next.ServeHTTP(w, r.WithContext(WithRoom(r.Context(), room)))
		})
	}
}
