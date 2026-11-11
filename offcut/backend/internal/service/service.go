// Package service is the application: projects, photos, specs, settings, and
// the analysis that turns photos into a spec. It depends on the repository,
// the photo store and the llm port through interfaces, and knows nothing
// about HTTP.
package service

import (
	"context"
	"errors"
	"fmt"

	"offcut/internal/crypto"
	"offcut/internal/domain"
	"offcut/internal/llm"
	"offcut/internal/llm/anthropic"
	"offcut/internal/llm/demo"
	"offcut/internal/llm/openai"
	"offcut/internal/storage"
)

type Repository interface {
	CreateProject(ctx context.Context, name string) (domain.Project, error)
	GetProject(ctx context.Context, id string) (domain.Project, error)
	ListProjects(ctx context.Context) ([]domain.Project, error)
	SaveProject(ctx context.Context, p domain.Project) error
	ClaimForAnalysis(ctx context.Context, id string) error
	DeleteProject(ctx context.Context, id string) error

	AddPhoto(ctx context.Context, projectID, view, mediaType string) (domain.Photo, error)
	GetPhoto(ctx context.Context, id string) (domain.Photo, error)
	ListPhotos(ctx context.Context, projectID string) ([]domain.Photo, error)
	DeletePhoto(ctx context.Context, id string) error

	AddSpecVersion(ctx context.Context, v domain.SpecVersion) (domain.SpecVersion, error)
	LatestSpec(ctx context.Context, projectID string) (domain.SpecVersion, error)

	GetSettings(ctx context.Context) (domain.Settings, error)
	SaveSettings(ctx context.Context, s domain.Settings) error
}

// ProviderFactory builds a provider from the user's settings.
type ProviderFactory func(cfg llm.Config) (llm.Provider, error)

func DefaultProviders(cfg llm.Config) (llm.Provider, error) {
	switch cfg.Provider {
	case anthropic.Name:
		return anthropic.New(cfg), nil
	case openai.Name:
		if cfg.Model == "" {
			return nil, Invalid("Choose a model for the OpenAI-compatible provider.")
		}
		return openai.New(cfg), nil
	case demo.Name, "":
		return demo.New(), nil
	}
	return nil, Invalid(fmt.Sprintf("Unknown provider %q.", cfg.Provider))
}

type Service struct {
	repo      Repository
	photos    storage.Store
	sealer    *crypto.Sealer
	providers ProviderFactory
	// analyses tracks running analyses so tests and shutdown can wait.
	analyses chan struct{}
}

func New(repo Repository, photos storage.Store, sealer *crypto.Sealer, providers ProviderFactory) *Service {
	if providers == nil {
		providers = DefaultProviders
	}
	return &Service{repo: repo, photos: photos, sealer: sealer, providers: providers, analyses: make(chan struct{}, 64)}
}

// InvalidError is a mistake in the caller's input. Its message is for people.
type InvalidError struct{ Msg string }

func (e InvalidError) Error() string { return e.Msg }

func Invalid(msg string) error { return InvalidError{Msg: msg} }

func IsInvalid(err error) bool {
	var e InvalidError
	return errors.As(err, &e)
}
