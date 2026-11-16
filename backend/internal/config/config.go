package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Config holds runtime configuration loaded from environment variables and optional .env files.
type Config struct {
	AppEnv                     string
	ServerAddr                 string
	CORSAllowedOrigins         []string
	MySQLHost                  string
	MySQLPort                  string
	MySQLUser                  string
	MySQLPassword              string
	MySQLDatabase              string
	RedisAddr                  string
	RedisPassword              string
	RedisDB                    int
	TokenSecret                string
	CookieSecure               bool
	StorageRoot                string
	MaxFileSizeBytes           int64
	DefaultStorageLimitBytes   int64
	MaxPasteSizeBytes          int64
	CleanupInterval            time.Duration
	ExpiringWarningWindow      time.Duration
	ExpiredTombstoneRetention  time.Duration
	ChunkUploadTTL             time.Duration
	RateLimitRequestsPerMinute int
	RLCreateRoomPerMin          int
	RLJoinRoomPerMin            int
	RLRoomProbe404PerMin        int
	RLValidatePWPerMinRoom      int
	RLWSHandshakePerMin        int
	MaxConcurrentUploadsPerIP  int
	MaxConcurrentDownloadsPerIP int
	DownloadBandwidthKBps      int64
	MaxWSPerIP                 int
	MaxWSPerRoom               int
	PasswordMaxAttempts        int
	PasswordLockoutDuration    time.Duration
	ClamAVEnabled              bool
	ClamAVAddr                 string
	ClamAVTimeout              time.Duration
	ClamAVFailOpen             bool
	MaxPreviewBytes            int64
	MaxDocxUncompressedBytes   int64
}

// Load reads configuration from optional .env files and environment variables.
func Load() *Config {
	loadDotEnv(".env", "../.env", "../../.env", "../../../.env", "../../../../.env")

	return &Config{
		AppEnv:                     getEnv("APP_ENV", "development"),
		ServerAddr:                 getEnv("SERVER_ADDR", "127.0.0.1:8080"),
		CORSAllowedOrigins:         splitCSV(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")),
		MySQLHost:                  getEnv("MYSQL_HOST", "127.0.0.1"),
		MySQLPort:                  getEnv("MYSQL_PORT", "3306"),
		MySQLUser:                  getEnv("MYSQL_USER", "root"),
		MySQLPassword:              getEnv("MYSQL_PASSWORD", ""),
		MySQLDatabase:              getEnv("MYSQL_DATABASE", "droproom"),
		RedisAddr:                  getEnv("REDIS_ADDR", "127.0.0.1:6379"),
		RedisPassword:              getEnv("REDIS_PASSWORD", ""),
		RedisDB:                    getEnvInt("REDIS_DB", 0),
		TokenSecret:                getEnv("TOKEN_SECRET", "droproom-dev-secret-change-in-production-32bytes"),
		CookieSecure:               getEnvBool("COOKIE_SECURE", false),
		StorageRoot:                getEnv("STORAGE_ROOT", "./storage"),
		MaxFileSizeBytes:           getEnvInt64("MAX_FILE_SIZE_BYTES", 104857600),
		DefaultStorageLimitBytes:   getEnvInt64("DEFAULT_STORAGE_LIMIT_BYTES", 524288000),
		MaxPasteSizeBytes:          getEnvInt64("MAX_PASTE_SIZE_BYTES", 2097152),
		CleanupInterval:            time.Duration(getEnvInt("CLEANUP_INTERVAL_SECONDS", 10)) * time.Second,
		ExpiringWarningWindow:      time.Duration(getEnvInt("EXPIRING_WARNING_MINUTES", 5)) * time.Minute,
		ExpiredTombstoneRetention:  time.Duration(getEnvInt("EXPIRED_TOMBSTONE_RETENTION_HOURS", 24)) * time.Hour,
		ChunkUploadTTL:             time.Duration(getEnvInt("CHUNK_UPLOAD_TTL_HOURS", 2)) * time.Hour,
		RateLimitRequestsPerMinute:  getEnvInt("RATE_LIMIT_REQUESTS_PER_MIN", 120),
		RLCreateRoomPerMin:          getEnvInt("RL_CREATE_ROOM_PER_MIN", 5),
		RLJoinRoomPerMin:            getEnvInt("RL_JOIN_ROOM_PER_MIN", 60),
		RLRoomProbe404PerMin:        getEnvInt("RL_ROOM_PROBE_404_PER_MIN", 15),
		RLValidatePWPerMinRoom:      getEnvInt("RL_VALIDATE_PW_PER_MIN_ROOM", 30),
		RLWSHandshakePerMin:         getEnvInt("RL_WS_HANDSHAKE_PER_MIN", 15),
		MaxConcurrentUploadsPerIP:   getEnvInt("MAX_CONCURRENT_UPLOADS_PER_IP", 5),
		MaxConcurrentDownloadsPerIP: getEnvInt("MAX_CONCURRENT_DOWNLOADS_PER_IP", 4),
		DownloadBandwidthKBps:       getEnvInt64("DOWNLOAD_BANDWIDTH_KBPS", 0),
		MaxWSPerIP:                  getEnvInt("MAX_WS_PER_IP", 5),
		MaxWSPerRoom:                getEnvInt("MAX_WS_PER_ROOM", 50),
		PasswordMaxAttempts:         getEnvInt("PASSWORD_MAX_ATTEMPTS", 5),
		PasswordLockoutDuration:     time.Duration(getEnvInt("PASSWORD_LOCKOUT_SECONDS", 300)) * time.Second,
		ClamAVEnabled:               getEnvBool("CLAMAV_ENABLED", false),
		ClamAVAddr:                  getEnv("CLAMAV_ADDR", "127.0.0.1:3310"),
		ClamAVTimeout:               time.Duration(getEnvInt("CLAMAV_TIMEOUT_SECONDS", 30)) * time.Second,
		ClamAVFailOpen:              getEnvBool("CLAMAV_FAIL_OPEN", false),
		MaxPreviewBytes:             getEnvInt64("MAX_PREVIEW_BYTES", 25*1024*1024),
		MaxDocxUncompressedBytes:    getEnvInt64("MAX_DOCX_UNCOMPRESSED_BYTES", 30*1024*1024),
	}
}

func loadDotEnv(candidates ...string) {
	for _, rel := range candidates {
		abs, err := filepath.Abs(rel)
		if err != nil {
			continue
		}
		f, err := os.Open(abs)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			idx := strings.IndexByte(line, '=')
			if idx <= 0 {
				continue
			}
			key := strings.TrimSpace(line[:idx])
			val := strings.TrimSpace(line[idx+1:])
			val = strings.Trim(val, `"'`)
			if _, exists := os.LookupEnv(key); !exists {
				_ = os.Setenv(key, val)
			}
		}
		_ = f.Close()
		break
	}
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func getEnvInt64(key string, fallback int64) int64 {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return fallback
	}
	return n
}

func getEnvBool(key string, fallback bool) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}

func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
