package middleware

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
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

// EndpointRateLimit enforces a per-minute Redis rate limit keyed by prefix and custom key extractor.
func EndpointRateLimit(
	cacheClient *cache.Client,
	prefix string,
	limitPerMinute int,
	keyFn func(*http.Request) string,
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if cacheClient == nil || limitPerMinute <= 0 {
				next.ServeHTTP(w, r)
				return
			}
			keyPart := keyFn(r)
			if keyPart == "" {
				keyPart = ClientIP(r)
			}
			bucket := time.Now().UTC().Unix() / 60
			key := fmt.Sprintf("rl:%s:%d:%s", prefix, bucket, keyPart)
			allowed, remaining, retryAfter, err := cacheClient.AllowRateLimit(r.Context(), key, limitPerMinute, time.Minute)
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

// RateLimit enforces baseline global per-IP fixed-window request limits backed by Redis.
func RateLimit(cacheClient *cache.Client, requestsPerMinute int) func(http.Handler) http.Handler {
	base := EndpointRateLimit(cacheClient, "global", requestsPerMinute, ClientIP)
	return func(next http.Handler) http.Handler {
		wrapped := base(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/ws/") {
				next.ServeHTTP(w, r)
				return
			}
			wrapped.ServeHTTP(w, r)
		})
	}
}

// ConcurrencyLimiter caps simultaneous in-flight requests per key (e.g., per client IP).
type ConcurrencyLimiter struct {
	mu     sync.Mutex
	active map[string]int
}

// NewConcurrencyLimiter creates a concurrency tracker.
func NewConcurrencyLimiter() *ConcurrencyLimiter {
	return &ConcurrencyLimiter{
		active: make(map[string]int),
	}
}

// Limit wraps an HTTP handler and rejects requests exceeding maxConcurrent active streams for the caller key.
func (c *ConcurrencyLimiter) Limit(maxConcurrent int, keyFn func(*http.Request) string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if maxConcurrent <= 0 {
				next.ServeHTTP(w, r)
				return
			}
			key := keyFn(r)
			c.mu.Lock()
			cur := c.active[key]
			if cur >= maxConcurrent {
				c.mu.Unlock()
				WriteError(w, http.StatusTooManyRequests, "concurrent_limit_exceeded", "Too many simultaneous transfers from your address. Please wait for current transfers to finish.")
				return
			}
			c.active[key] = cur + 1
			c.mu.Unlock()

			defer func() {
				c.mu.Lock()
				if n := c.active[key] - 1; n <= 0 {
					delete(c.active, key)
				} else {
					c.active[key] = n
				}
				c.mu.Unlock()
			}()

			next.ServeHTTP(w, r)
		})
	}
}
