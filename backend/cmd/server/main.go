package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/droproom/backend/internal/cache"
	"github.com/droproom/backend/internal/config"
	"github.com/droproom/backend/internal/database"
	"github.com/droproom/backend/internal/realtime"
	"github.com/droproom/backend/internal/server"
	"github.com/droproom/backend/internal/storage"
	"github.com/droproom/backend/internal/worker"
)

func main() {
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db, err := database.Connect(ctx, database.MySQLParams{
		Host:     cfg.MySQLHost,
		Port:     cfg.MySQLPort,
		User:     cfg.MySQLUser,
		Password: cfg.MySQLPassword,
		Database: cfg.MySQLDatabase,
	})
	if err != nil {
		log.Fatalf("database connect failed: %v", err)
	}
	defer db.Close()

	if err := database.RunMigrations(ctx, db); err != nil {
		log.Fatalf("database migrations failed: %v", err)
	}

	cacheClient, err := cache.Connect(ctx, cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
	if err != nil {
		log.Fatalf("redis connect failed: %v", err)
	}
	defer cacheClient.Close()

	store, err := storage.NewLocalStorage(cfg.StorageRoot)
	if err != nil {
		log.Fatalf("storage init failed: %v", err)
	}

	hub := realtime.NewHub(cacheClient)

	cleanupWorker := worker.NewCleanupWorker(
		db,
		cacheClient,
		store,
		hub,
		cfg.CleanupInterval,
		cfg.ExpiringWarningWindow,
		cfg.ExpiredTombstoneRetention,
		cfg.ChunkUploadTTL,
	)
	go cleanupWorker.Start(ctx)

	router := server.NewRouter(db, cacheClient, store, hub, cfg)

	srv := &http.Server{
		Addr:              cfg.ServerAddr,
		Handler:           router,
		ReadHeaderTimeout: 15 * time.Second,
		WriteTimeout:      0,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		log.Printf("DropRoom backend listening on %s (%s, mysql=%s:%s/%s)", cfg.ServerAddr, cfg.AppEnv, cfg.MySQLHost, cfg.MySQLPort, cfg.MySQLDatabase)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server failed: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("Shutting down DropRoom backend...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
