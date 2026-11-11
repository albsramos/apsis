// Command server runs the Offcut API.
//
//	@title			Offcut API
//	@version		0.1
//	@description	Photos of a piece of furniture in; parts, joints and assembly steps out.
//	@BasePath		/api
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"offcut/internal/config"
	"offcut/internal/crypto"
	"offcut/internal/handler"
	"offcut/internal/repository"
	"offcut/internal/service"
	"offcut/internal/storage"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	repo, err := repository.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer repo.Close()
	if err := repo.Migrate(ctx); err != nil {
		return err
	}
	if err := repo.FailInterrupted(ctx); err != nil {
		return err
	}
	photos, err := storage.NewLocal(filepath.Join(cfg.DataDir, "photos"))
	if err != nil {
		return err
	}
	sealer, err := crypto.NewSealer(cfg.AppSecret)
	if err != nil {
		return err
	}
	svc := service.New(repo, photos, sealer, nil)

	mux := http.NewServeMux()
	handler.New(svc).Register(mux)
	if cfg.StaticDir != "" {
		mux.Handle("/", spa(cfg.StaticDir))
	}
	srv := &http.Server{Addr: ":" + cfg.Port, Handler: logRequests(mux), ReadHeaderTimeout: 10 * time.Second}

	errc := make(chan error, 1)
	go func() {
		slog.Info("listening", "addr", srv.Addr)
		errc <- srv.ListenAndServe()
	}()
	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdown)
	return svc.Wait(shutdown)
}

// spa serves the built frontend, sending index.html for client-side routes.
func spa(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := os.Stat(filepath.Join(dir, filepath.Clean(r.URL.Path))); err != nil {
			http.ServeFile(w, r, filepath.Join(dir, "index.html"))
			return
		}
		files.ServeHTTP(w, r)
	})
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if r.URL.Path != "/api/photos" {
			slog.Debug("request", "method", r.Method, "path", r.URL.Path, "took", time.Since(start))
		}
	})
}
