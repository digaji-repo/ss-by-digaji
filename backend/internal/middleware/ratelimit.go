package middleware

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/droproom/backend/internal/cache"
)

// ClientIP extracts the caller IP from X-Forwarded-For, X-Real-IP, or RemoteAddr.
func ClientIP(r *http.Request) string {
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 && strings.TrimSpace(parts[0]) != "" {
			return strings.TrimSpace(parts[0])
		}
	}
	if xrip := strings.TrimSpace(r.Header.Get("X-Real-IP")); xrip != "" {
		return xrip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	return r.RemoteAddr
}

// RateLimit enforces per-IP fixed-window request limits backed by Redis.
func RateLimit(cacheClient *cache.Client, requestsPerMinute int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if cacheClient == nil || requestsPerMinute <= 0 {
				next.ServeHTTP(w, r)
				return
			}
			// Skip rate limiting for WebSocket upgrades and chunk parts beyond high burst allowance.
			if strings.HasPrefix(r.URL.Path, "/ws/") {
				next.ServeHTTP(w, r)
				return
			}

			ip := ClientIP(r)
			bucket := time.Now().UTC().Unix() / 60
			key := fmt.Sprintf("rl:%d:%s", bucket, ip)
			allowed, remaining, retryAfter, err := cacheClient.AllowRateLimit(r.Context(), key, requestsPerMinute, time.Minute)
			if err == nil {
				w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
				if !allowed {
					w.Header().Set("Retry-After", fmt.Sprintf("%d", int(retryAfter.Seconds())+1))
					WriteError(w, http.StatusTooManyRequests, "rate_limited", "Too many requests. Please slow down and try again shortly.")
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
