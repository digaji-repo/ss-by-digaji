package worker

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"time"

	"github.com/droproom/backend/internal/cache"
	"github.com/droproom/backend/internal/realtime"
	"github.com/droproom/backend/internal/storage"
	"github.com/google/uuid"
)

// CleanupWorker handles expiring notifications, room expiration, disk file cleanup, and tombstone purging.
type CleanupWorker struct {
	db                *sql.DB
	cache             *cache.Client
	storage           storage.Backend
	hub               *realtime.Hub
	interval          time.Duration
	expiringWindow    time.Duration
	tombstoneRetain   time.Duration
	chunkUploadMaxAge time.Duration
}

// NewCleanupWorker initializes a background room expiration and storage cleanup worker.
func NewCleanupWorker(
	db *sql.DB,
	cacheClient *cache.Client,
	store storage.Backend,
	hub *realtime.Hub,
	interval time.Duration,
	expiringWindow time.Duration,
	tombstoneRetain time.Duration,
	chunkUploadMaxAge time.Duration,
) *CleanupWorker {
	return &CleanupWorker{
		db:                db,
		cache:             cacheClient,
		storage:           store,
		hub:               hub,
		interval:          interval,
		expiringWindow:    expiringWindow,
		tombstoneRetain:   tombstoneRetain,
		chunkUploadMaxAge: chunkUploadMaxAge,
	}
}

// Start runs the periodic cleanup loop until ctx is cancelled.
func (w *CleanupWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	w.RunOnce(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.RunOnce(ctx)
		}
	}
}

// RunOnce executes one full expiration + cleanup pass.
func (w *CleanupWorker) RunOnce(ctx context.Context) {
	w.notifyExpiringRooms(ctx)
	w.expireDueRooms(ctx)
	w.purgeExpiredTombstones(ctx)
	w.sweepOrphanedRoomDirs(ctx)
	if w.storage != nil && w.chunkUploadMaxAge > 0 {
		_ = w.storage.CleanupStaleChunks(int64(w.chunkUploadMaxAge.Seconds()))
	}
}

func (w *CleanupWorker) notifyExpiringRooms(ctx context.Context) {
	now := time.Now().UTC()
	cutoff := now.Add(w.expiringWindow)

	rows, err := w.db.QueryContext(ctx, `
		SELECT id, room_code, expires_at
		FROM rooms
		WHERE status = 'active'
		  AND expires_at > ?
		  AND expires_at <= ?
	`, now, cutoff)
	if err != nil {
		log.Printf("worker notifyExpiringRooms query err=%v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var roomID, roomCode string
		var expiresAt time.Time
		if err := rows.Scan(&roomID, &roomCode, &expiresAt); err != nil {
			continue
		}

		shouldSend := false
		if w.cache != nil {
			shouldSend = w.cache.MarkExpiringNotified(ctx, roomID, w.expiringWindow+time.Minute)
		} else {
			var count int
			_ = w.db.QueryRowContext(ctx, `
				SELECT COUNT(*) FROM room_events WHERE room_id = ? AND event_type = ?
			`, roomID, realtime.EventRoomExpiring).Scan(&count)
			shouldSend = count == 0
		}

		if !shouldSend {
			continue
		}

		metaBytes, _ := json.Marshal(map[string]string{
			"expires_at": expiresAt.UTC().Format(time.RFC3339),
		})
		_, _ = w.db.ExecContext(ctx, `
			INSERT INTO room_events (id, room_id, event_type, metadata, created_at)
			VALUES (?, ?, ?, ?, ?)
		`, uuid.NewString(), roomID, realtime.EventRoomExpiring, string(metaBytes), now)

		w.hub.Publish(ctx, realtime.Envelope{
			Type:     realtime.EventRoomExpiring,
			RoomID:   roomID,
			RoomCode: roomCode,
			Payload: map[string]interface{}{
				"expires_at":        expiresAt.UTC(),
				"seconds_remaining": int64(time.Until(expiresAt).Seconds()),
			},
			Timestamp: now,
		})
	}
}

func (w *CleanupWorker) expireDueRooms(ctx context.Context) {
	now := time.Now().UTC()
	rows, err := w.db.QueryContext(ctx, `
		SELECT id, room_code
		FROM rooms
		WHERE status = 'active' AND expires_at <= ?
	`, now)
	if err != nil {
		log.Printf("worker expireDueRooms query err=%v", err)
		return
	}

	type dueRoom struct {
		id   string
		code string
	}
	var due []dueRoom
	for rows.Next() {
		var r dueRoom
		if err := rows.Scan(&r.id, &r.code); err == nil {
			due = append(due, r)
		}
	}
	rows.Close()

	for _, r := range due {
		tx, err := w.db.BeginTx(ctx, nil)
		if err != nil {
			continue
		}

		res, err := tx.ExecContext(ctx, `
			UPDATE rooms
			SET status = 'expired'
			WHERE id = ? AND status = 'active'
		`, r.id)
		if err != nil {
			_ = tx.Rollback()
			continue
		}
		if affected, _ := res.RowsAffected(); affected == 0 {
			_ = tx.Rollback()
			continue
		}

		_, _ = tx.ExecContext(ctx, `DELETE FROM download_logs WHERE room_id = ?`, r.id)
		_, _ = tx.ExecContext(ctx, `DELETE FROM files WHERE room_id = ?`, r.id)
		_, _ = tx.ExecContext(ctx, `DELETE FROM pastes WHERE room_id = ?`, r.id)
		_, _ = tx.ExecContext(ctx, `
			INSERT INTO room_events (id, room_id, event_type, metadata, created_at)
			VALUES (?, ?, ?, '{"reason":"expired"}', ?)
		`, uuid.NewString(), r.id, realtime.EventRoomExpired, now)

		if err := tx.Commit(); err != nil {
			continue
		}

		if w.storage != nil {
			if err := w.storage.DeleteRoomDir(r.id); err != nil {
				log.Printf("worker delete room dir room=%s err=%v", r.id, err)
			}
		}
		if w.cache != nil {
			for _, uploadID := range w.cache.PopRoomChunkUploads(ctx, r.id) {
				if w.storage != nil {
					_ = w.storage.DeleteUploadTemp(uploadID)
				}
				w.cache.DeleteChunkSession(ctx, uploadID, r.id)
			}
			w.cache.InvalidateRoomCache(ctx, r.code)
			w.cache.ClearRoomPresence(ctx, r.id)
		}

		w.hub.Publish(ctx, realtime.Envelope{
			Type:     realtime.EventRoomExpired,
			RoomID:   r.id,
			RoomCode: r.code,
			Payload: map[string]interface{}{
				"room_code": r.code,
				"reason":    "expired",
			},
			Timestamp: now,
		})
		w.hub.CloseRoom(r.id)
	}
}

func (w *CleanupWorker) purgeExpiredTombstones(ctx context.Context) {
	if w.tombstoneRetain <= 0 {
		return
	}
	cutoff := time.Now().UTC().Add(-w.tombstoneRetain)
	_, err := w.db.ExecContext(ctx, `
		DELETE FROM rooms
		WHERE status = 'expired' AND expires_at < ?
	`, cutoff)
	if err != nil {
		log.Printf("worker purgeExpiredTombstones err=%v", err)
	}
}

// sweepOrphanedRoomDirs removes any leftover storage directories whose rooms no longer exist or are expired.
func (w *CleanupWorker) sweepOrphanedRoomDirs(ctx context.Context) {
	if w.storage == nil {
		return
	}
	dirs, err := w.storage.ListRoomDirs()
	if err != nil {
		return
	}
	now := time.Now().UTC()
	for _, roomID := range dirs {
		var status string
		var expiresAt time.Time
		err := w.db.QueryRowContext(ctx, `SELECT status, expires_at FROM rooms WHERE id = ?`, roomID).Scan(&status, &expiresAt)
		if err == sql.ErrNoRows || (err == nil && (status != "active" || !now.Before(expiresAt))) {
			_ = w.storage.DeleteRoomDir(roomID)
		}
	}
}
