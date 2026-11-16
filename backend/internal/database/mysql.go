package database

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"net"
	"sort"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// MySQLParams holds connection fields for MySQL/MariaDB.
type MySQLParams struct {
	Host     string
	Port     string
	User     string
	Password string
	Database string
}

// Connect ensures the target database exists and opens a pooled MySQL/MariaDB connection.
func Connect(ctx context.Context, p MySQLParams) (*sql.DB, error) {
	addr := net.JoinHostPort(p.Host, p.Port)

	// Ensure target database exists before opening DB-scoped pool.
	adminCfg := mysql.NewConfig()
	adminCfg.User = p.User
	adminCfg.Passwd = p.Password
	adminCfg.Net = "tcp"
	adminCfg.Addr = addr
	adminCfg.ParseTime = true
	adminCfg.Loc = time.UTC
	adminCfg.Timeout = 10 * time.Second

	adminDB, err := sql.Open("mysql", adminCfg.FormatDSN())
	if err != nil {
		return nil, fmt.Errorf("open mysql admin: %w", err)
	}
	createCtx, cancelCreate := context.WithTimeout(ctx, 10*time.Second)
	_, createErr := adminDB.ExecContext(
		createCtx,
		fmt.Sprintf("CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", strings.ReplaceAll(p.Database, "`", "")),
	)
	cancelCreate()
	_ = adminDB.Close()
	if createErr != nil {
		return nil, fmt.Errorf("ensure database %s: %w", p.Database, createErr)
	}

	cfg := mysql.NewConfig()
	cfg.User = p.User
	cfg.Passwd = p.Password
	cfg.Net = "tcp"
	cfg.Addr = addr
	cfg.DBName = p.Database
	cfg.ParseTime = true
	cfg.Loc = time.UTC
	cfg.Timeout = 10 * time.Second
	cfg.Params = map[string]string{
		"charset": "utf8mb4",
	}

	db, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		return nil, fmt.Errorf("open mysql pool: %w", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	db.SetConnMaxIdleTime(5 * time.Minute)

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping mysql: %w", err)
	}

	return db, nil
}

// RunMigrations executes embedded SQL migration statements idempotently.
func RunMigrations(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version VARCHAR(128) PRIMARY KEY,
			applied_at DATETIME(6) NOT NULL
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
	`)
	if err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("read embedded migrations: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		version := entry.Name()
		var count int
		if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, version).Scan(&count); err != nil {
			return fmt.Errorf("check migration %s: %w", version, err)
		}
		if count > 0 {
			continue
		}

		sqlBytes, err := migrationsFS.ReadFile("migrations/" + version)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", version, err)
		}

		for _, stmt := range splitSQLStatements(string(sqlBytes)) {
			if _, err := db.ExecContext(ctx, stmt); err != nil {
				return fmt.Errorf("exec migration %s: %w", version, err)
			}
		}

		if _, err := db.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`, version, time.Now().UTC()); err != nil {
			return fmt.Errorf("record migration %s: %w", version, err)
		}
	}

	return nil
}

func splitSQLStatements(raw string) []string {
	lines := strings.Split(raw, "\n")
	var cleaned strings.Builder
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "--") || trimmed == "" {
			continue
		}
		cleaned.WriteString(line)
		cleaned.WriteByte('\n')
	}

	parts := strings.Split(cleaned.String(), ";")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			out = append(out, s)
		}
	}
	return out
}
