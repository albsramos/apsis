// Package storage keeps photo files. Postgres holds their metadata; the
// bytes live here, on disk, behind an interface an S3 store can implement.
package storage

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

type Store interface {
	Put(ctx context.Context, key string, data []byte) error
	Get(ctx context.Context, key string) ([]byte, error)
	Delete(ctx context.Context, key string) error
}

type Local struct{ dir string }

func NewLocal(dir string) (*Local, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &Local{dir: dir}, nil
}

var safeKey = regexp.MustCompile(`^[a-zA-Z0-9-]+$`)

func (l *Local) path(key string) (string, error) {
	if !safeKey.MatchString(key) {
		return "", fmt.Errorf("storage: bad key %q", key)
	}
	return filepath.Join(l.dir, key), nil
}

func (l *Local) Put(_ context.Context, key string, data []byte) error {
	p, err := l.path(key)
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o644)
}

func (l *Local) Get(_ context.Context, key string) ([]byte, error) {
	p, err := l.path(key)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(p)
}

func (l *Local) Delete(_ context.Context, key string) error {
	p, err := l.path(key)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
