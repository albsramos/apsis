// Package config reads the server's settings from the environment.
package config

import (
	"errors"
	"os"
)

type Config struct {
	Port        string
	DatabaseURL string
	DataDir     string
	// AppSecret seals stored API keys. Changing it makes stored keys unreadable.
	AppSecret string
	// StaticDir, if set, is the built frontend to serve.
	StaticDir string
}

func Load() (Config, error) {
	c := Config{
		Port:        env("PORT", "8080"),
		DatabaseURL: env("DATABASE_URL", "postgres://offcut:offcut@localhost:5432/offcut?sslmode=disable"),
		DataDir:     env("DATA_DIR", "./data"),
		AppSecret:   os.Getenv("APP_SECRET"),
		StaticDir:   os.Getenv("STATIC_DIR"),
	}
	if c.AppSecret == "" {
		return c, errors.New("set APP_SECRET (16+ random characters); it encrypts stored API keys")
	}
	return c, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
