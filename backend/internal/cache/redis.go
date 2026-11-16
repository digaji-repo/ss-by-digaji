package cache

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/droproom/backend/internal/models"
	"github.com/redis/go-redis/v9"
)

// Client wraps go-redis with DropRoom-specific caching, Pub/Sub, rate limiting, and presence helpers.
type Client struct {
	RDB *redis.Client
}

// ChunkSession stores metadata for a resumable chunked upload.
type ChunkSession struct {
	UploadID    string `json:"upload_id"`
	RoomID      string `json:"room_id"`
	RoomCode    string `json:"room_code"`
	FileName    string `json:"file_name"`
	ContentType string `json:"content_type"`
	TotalSize   int64  `json:"total_size"`
	ChunkSize   int64  `json:"chunk_size"`
	TotalChunks int    `json:"total_chunks"`
	CreatedAt   int64  `json:"created_at"`
}

// Connect initializes the Redis/Memurai client and verifies connectivity.
func Connect(ctx context.Context, addr, password string, db int) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
		Protocol: 2,
	})
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := rdb.Ping(pingCtx).Err(); err != nil {
		_ = rdb.Close()
		return nil, fmt.Errorf("ping redis: %w", err)
	}
	return &Client{RDB: rdb}, nil
}

// Close closes the underlying Redis connection pool.
func (c *Client) Close() error {
	if c == nil || c.RDB == nil {
		return nil
	}
	return c.RDB.Close()
}

// AllowRateLimit enforces a fixed-window counter per key using Redis INCR + EXPIRE.
func (c *Client) AllowRateLimit(ctx context.Context, key string, limit int, window time.Duration) (allowed bool, remaining int, retryAfter time.Duration, err error) {
	count, err := c.RDB.Incr(ctx, key).Result()
	if err != nil {
		return true, limit, 0, err
	}
	if count == 1 {
		_ = c.RDB.Expire(ctx, key, window).Err()
	}
	ttl, _ := c.RDB.TTL(ctx, key).Result()
	if ttl < 0 {
		ttl = window
	}
	rem := limit - int(count)
	if rem < 0 {
		rem = 0
	}
	return int(count) <= limit, rem, ttl, nil
}

// CheckPasswordLockout returns whether an IP+room is currently locked out from password attempts.
func (c *Client) CheckPasswordLockout(ctx context.Context, roomCode, ip string, maxAttempts int) (locked bool, retryAfter time.Duration) {
	key := fmt.Sprintf("pwfail:%s:%s", roomCode, ip)
	val, err := c.RDB.Get(ctx, key).Int()
	if err != nil {
		return false, 0
	}
	if val >= maxAttempts {
		ttl, _ := c.RDB.TTL(ctx, key).Result()
		if ttl < 0 {
			ttl = time.Minute
		}
		return true, ttl
	}
	return false, 0
}

// RecordPasswordFailure increments failed password attempts and returns remaining tries.
func (c *Client) RecordPasswordFailure(ctx context.Context, roomCode, ip string, maxAttempts int, lockout time.Duration) int {
	key := fmt.Sprintf("pwfail:%s:%s", roomCode, ip)
	count, err := c.RDB.Incr(ctx, key).Result()
	if err != nil {
		return maxAttempts
	}
	if count == 1 || int(count) == maxAttempts {
		_ = c.RDB.Expire(ctx, key, lockout).Err()
	}
	rem := maxAttempts - int(count)
	if rem < 0 {
		return 0
	}
	return rem
}

// ClearPasswordFailures resets failed password attempts after successful validation.
func (c *Client) ClearPasswordFailures(ctx context.Context, roomCode, ip string) {
	key := fmt.Sprintf("pwfail:%s:%s", roomCode, ip)
	_ = c.RDB.Del(ctx, key).Err()
}

// SetRoomCache caches non-sensitive room state briefly to speed up validation.
func (c *Client) SetRoomCache(ctx context.Context, room *models.Room, ttl time.Duration) {
	if ttl <= 0 {
		return
	}
	if ttl > 2*time.Minute {
		ttl = 2 * time.Minute
	}
	type cachedRoom struct {
		ID           string    `json:"id"`
		RoomCode     string    `json:"room_code"`
		CreatedAt    time.Time `json:"created_at"`
		ExpiresAt    time.Time `json:"expires_at"`
		Status       string    `json:"status"`
		PasswordHash *string   `json:"password_hash,omitempty"`
		StorageLimit int64     `json:"storage_limit"`
	}
	raw, err := json.Marshal(cachedRoom{
		ID:           room.ID,
		RoomCode:     room.RoomCode,
		CreatedAt:    room.CreatedAt,
		ExpiresAt:    room.ExpiresAt,
		Status:       room.Status,
		PasswordHash: room.PasswordHash,
		StorageLimit: room.StorageLimit,
	})
	if err != nil {
		return
	}
	_ = c.RDB.Set(ctx, "room:meta:"+room.RoomCode, raw, ttl).Err()
}

// GetRoomCache retrieves cached room metadata if present.
func (c *Client) GetRoomCache(ctx context.Context, roomCode string) (*models.Room, bool) {
	raw, err := c.RDB.Get(ctx, "room:meta:"+roomCode).Bytes()
	if err != nil {
		return nil, false
	}
	var cached struct {
		ID           string    `json:"id"`
		RoomCode     string    `json:"room_code"`
		CreatedAt    time.Time `json:"created_at"`
		ExpiresAt    time.Time `json:"expires_at"`
		Status       string    `json:"status"`
		PasswordHash *string   `json:"password_hash,omitempty"`
		StorageLimit int64     `json:"storage_limit"`
	}
	if err := json.Unmarshal(raw, &cached); err != nil {
		return nil, false
	}
	return &models.Room{
		ID:           cached.ID,
		RoomCode:     cached.RoomCode,
		CreatedAt:    cached.CreatedAt,
		ExpiresAt:    cached.ExpiresAt,
		Status:       cached.Status,
		PasswordHash: cached.PasswordHash,
		StorageLimit: cached.StorageLimit,
	}, true
}

// InvalidateRoomCache deletes cached room metadata.
func (c *Client) InvalidateRoomCache(ctx context.Context, roomCode string) {
	_ = c.RDB.Del(ctx, "room:meta:"+roomCode).Err()
}

// SetPeerOnline adds or refreshes an online peer in the room presence hash.
func (c *Client) SetPeerOnline(ctx context.Context, roomID string, peer models.PeerPresence) error {
	raw, err := json.Marshal(peer)
	if err != nil {
		return err
	}
	key := "room:presence:" + roomID
	if err := c.RDB.HSet(ctx, key, peer.PeerID, raw).Err(); err != nil {
		return err
	}
	_ = c.RDB.Expire(ctx, key, 12*time.Hour).Err()
	return nil
}

// RemovePeerOnline removes a disconnected peer from the room presence hash.
func (c *Client) RemovePeerOnline(ctx context.Context, roomID, peerID string) error {
	return c.RDB.HDel(ctx, "room:presence:"+roomID, peerID).Err()
}

// ClearRoomPresence removes all presence state for an expired room.
func (c *Client) ClearRoomPresence(ctx context.Context, roomID string) {
	_ = c.RDB.Del(ctx, "room:presence:"+roomID).Err()
}

// ListOnlinePeers returns all currently registered peers in the room.
func (c *Client) ListOnlinePeers(ctx context.Context, roomID string) ([]models.PeerPresence, error) {
	entries, err := c.RDB.HGetAll(ctx, "room:presence:"+roomID).Result()
	if err != nil {
		return nil, err
	}
	peers := make([]models.PeerPresence, 0, len(entries))
	for _, v := range entries {
		var p models.PeerPresence
		if err := json.Unmarshal([]byte(v), &p); err == nil {
			peers = append(peers, p)
		}
	}
	return peers, nil
}

// MarkExpiringNotified marks a room as having emitted its expiring warning. Returns true if newly marked.
func (c *Client) MarkExpiringNotified(ctx context.Context, roomID string, ttl time.Duration) bool {
	if ttl <= 0 {
		ttl = time.Hour
	}
	ok, err := c.RDB.SetNX(ctx, "room:expiring_sent:"+roomID, "1", ttl).Result()
	if err != nil {
		return false
	}
	return ok
}

// SaveChunkSession persists chunked upload metadata in Redis and associates it with the room.
func (c *Client) SaveChunkSession(ctx context.Context, s *ChunkSession, ttl time.Duration) error {
	raw, err := json.Marshal(s)
	if err != nil {
		return err
	}
	if err := c.RDB.Set(ctx, "upload:chunk:"+s.UploadID, raw, ttl).Err(); err != nil {
		return err
	}
	roomChunksKey := "room:chunks:" + s.RoomID
	_ = c.RDB.SAdd(ctx, roomChunksKey, s.UploadID).Err()
	_ = c.RDB.Expire(ctx, roomChunksKey, ttl).Err()
	return nil
}

// GetChunkSession retrieves chunked upload metadata.
func (c *Client) GetChunkSession(ctx context.Context, uploadID string) (*ChunkSession, error) {
	raw, err := c.RDB.Get(ctx, "upload:chunk:"+uploadID).Bytes()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, nil
		}
		return nil, err
	}
	var s ChunkSession
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// MarkChunkUploaded records an uploaded chunk index for resume status checks.
func (c *Client) MarkChunkUploaded(ctx context.Context, uploadID string, index int, ttl time.Duration) error {
	key := "upload:chunks_done:" + uploadID
	if err := c.RDB.SAdd(ctx, key, index).Err(); err != nil {
		return err
	}
	return c.RDB.Expire(ctx, key, ttl).Err()
}

// ListUploadedChunks returns chunk indices already received for uploadID.
func (c *Client) ListUploadedChunks(ctx context.Context, uploadID string) ([]int, error) {
	vals, err := c.RDB.SMembers(ctx, "upload:chunks_done:"+uploadID).Result()
	if err != nil {
		return nil, err
	}
	out := make([]int, 0, len(vals))
	for _, v := range vals {
		var idx int
		if _, err := fmt.Sscanf(v, "%d", &idx); err == nil {
			out = append(out, idx)
		}
	}
	return out, nil
}

// DeleteChunkSession removes Redis keys for a completed or aborted chunk upload.
func (c *Client) DeleteChunkSession(ctx context.Context, uploadID string, roomID ...string) {
	_ = c.RDB.Del(ctx, "upload:chunk:"+uploadID, "upload:chunks_done:"+uploadID).Err()
	if len(roomID) > 0 && roomID[0] != "" {
		_ = c.RDB.SRem(ctx, "room:chunks:"+roomID[0], uploadID).Err()
	}
}

// PopRoomChunkUploads returns and clears all active chunk upload IDs associated with a room.
func (c *Client) PopRoomChunkUploads(ctx context.Context, roomID string) []string {
	key := "room:chunks:" + roomID
	ids, err := c.RDB.SMembers(ctx, key).Result()
	if err != nil || len(ids) == 0 {
		return nil
	}
	_ = c.RDB.Del(ctx, key).Err()
	return ids
}

// PublishRoomEvent publishes a JSON-serialized event to the room's Redis Pub/Sub channel.
func (c *Client) PublishRoomEvent(ctx context.Context, roomID string, payload []byte) error {
	return c.RDB.Publish(ctx, RoomChannel(roomID), payload).Err()
}

// RoomChannel returns the Redis Pub/Sub channel name for a given roomID.
func RoomChannel(roomID string) string {
	return "room:events:" + roomID
}
