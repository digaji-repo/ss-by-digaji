package handlers

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"github.com/droproom/backend/internal/cache"
	"github.com/droproom/backend/internal/middleware"
)

// HealthHandler checks MySQL/MariaDB and Redis readiness.
type HealthHandler struct {
	db    *sql.DB
	cache *cache.Client
}

// NewHealthHandler constructs HealthHandler.
func NewHealthHandler(db *sql.DB, cacheClient *cache.Client) *HealthHandler {
	return &HealthHandler{db: db, cache: cacheClient}
}

// Check handles GET /api/health.
func (h *HealthHandler) Check(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	dbStatus := "ok"
	if err := h.db.PingContext(ctx); err != nil {
		dbStatus = "error"
	}

	redisStatus := "ok"
	if h.cache == nil || h.cache.RDB.Ping(ctx).Err() != nil {
		redisStatus = "error"
	}

	statusCode := http.StatusOK
	overall := "healthy"
	if dbStatus != "ok" || redisStatus != "ok" {
		statusCode = http.StatusServiceUnavailable
		overall = "degraded"
	}

	middleware.WriteJSON(w, statusCode, map[string]interface{}{
		"status":    overall,
		"database":  dbStatus,
		"mysql":     dbStatus,
		"redis":     redisStatus,
		"timestamp": time.Now().UTC(),
	})
}
