package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"offcut/internal/domain"
	"offcut/internal/llm"
	"offcut/internal/spec"
)

// MaxPhotoBytes is the largest photo accepted: the providers reject larger
// images. The frontend downscales photos to well under it before upload.
const MaxPhotoBytes = 5 << 20

type ProjectDetail struct {
	Project domain.Project
	Photos  []domain.Photo
	Spec    *domain.SpecVersion
}

type ProjectSummary struct {
	Project    domain.Project
	PhotoCount int
	CoverPhoto string
	Overall    *spec.Overall
	PartCount  int
}

func (s *Service) ListProjects(ctx context.Context) ([]ProjectSummary, error) {
	projects, err := s.repo.ListProjects(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]ProjectSummary, 0, len(projects))
	for _, p := range projects {
		sum := ProjectSummary{Project: p}
		photos, err := s.repo.ListPhotos(ctx, p.ID)
		if err != nil {
			return nil, err
		}
		sum.PhotoCount = len(photos)
		if len(photos) > 0 {
			sum.CoverPhoto = photos[0].ID
		}
		if v, err := s.repo.LatestSpec(ctx, p.ID); err == nil {
			sum.Overall, sum.PartCount = &v.Spec.Overall, len(v.Spec.Parts)
		} else if !errors.Is(err, domain.ErrNotFound) {
			return nil, err
		}
		out = append(out, sum)
	}
	return out, nil
}

func (s *Service) CreateProject(ctx context.Context, name string) (domain.Project, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Untitled piece"
	}
	return s.repo.CreateProject(ctx, name)
}

func (s *Service) GetProject(ctx context.Context, id string) (ProjectDetail, error) {
	p, err := s.repo.GetProject(ctx, id)
	if err != nil {
		return ProjectDetail{}, err
	}
	photos, err := s.repo.ListPhotos(ctx, id)
	if err != nil {
		return ProjectDetail{}, err
	}
	d := ProjectDetail{Project: p, Photos: photos}
	if v, err := s.repo.LatestSpec(ctx, id); err == nil {
		d.Spec = &v
	} else if !errors.Is(err, domain.ErrNotFound) {
		return ProjectDetail{}, err
	}
	return d, nil
}

func (s *Service) RenameProject(ctx context.Context, id, name string) (domain.Project, error) {
	p, err := s.repo.GetProject(ctx, id)
	if err != nil {
		return p, err
	}
	if name = strings.TrimSpace(name); name == "" {
		return p, Invalid("The name can't be empty.")
	}
	p.Name = name
	return p, s.repo.SaveProject(ctx, p)
}

func (s *Service) DeleteProject(ctx context.Context, id string) error {
	photos, err := s.repo.ListPhotos(ctx, id)
	if err != nil {
		return err
	}
	if err := s.repo.DeleteProject(ctx, id); err != nil {
		return err
	}
	for _, ph := range photos {
		_ = s.photos.Delete(ctx, ph.ID)
	}
	return nil
}

var photoTypes = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true, "image/gif": true}

func (s *Service) AddPhoto(ctx context.Context, projectID, view string, data []byte) (domain.Photo, error) {
	if _, err := s.repo.GetProject(ctx, projectID); err != nil {
		return domain.Photo{}, err
	}
	if len(data) == 0 {
		return domain.Photo{}, Invalid("The photo is empty.")
	}
	if len(data) > MaxPhotoBytes {
		return domain.Photo{}, Invalid(fmt.Sprintf("The photo is larger than %d MB.", MaxPhotoBytes>>20))
	}
	// Trust the bytes, not the browser's label.
	mediaType := http.DetectContentType(data)
	if !photoTypes[mediaType] {
		return domain.Photo{}, Invalid("Upload a JPEG, PNG, WebP or GIF photo.")
	}
	ph, err := s.repo.AddPhoto(ctx, projectID, strings.TrimSpace(view), mediaType)
	if err != nil {
		return ph, err
	}
	if err := s.photos.Put(ctx, ph.ID, data); err != nil {
		_ = s.repo.DeletePhoto(ctx, ph.ID)
		return domain.Photo{}, err
	}
	return ph, nil
}

func (s *Service) PhotoData(ctx context.Context, id string) (domain.Photo, []byte, error) {
	ph, err := s.repo.GetPhoto(ctx, id)
	if err != nil {
		return ph, nil, err
	}
	data, err := s.photos.Get(ctx, id)
	return ph, data, err
}

func (s *Service) DeletePhoto(ctx context.Context, id string) error {
	ph, err := s.repo.GetPhoto(ctx, id)
	if err != nil {
		return err
	}
	p, err := s.repo.GetProject(ctx, ph.ProjectID)
	if err != nil {
		return err
	}
	if sentPhotos(p.Conversation)[id] {
		return fmt.Errorf("%w: the AI has already seen this photo", domain.ErrConflict)
	}
	if err := s.repo.DeletePhoto(ctx, id); err != nil {
		return err
	}
	return s.photos.Delete(ctx, id)
}

// UpdateSpec stores the user's edit as a new version. The validator runs
// again; no AI call is made.
func (s *Service) UpdateSpec(ctx context.Context, projectID string, sp spec.Spec) (domain.SpecVersion, error) {
	if _, err := s.repo.GetProject(ctx, projectID); err != nil {
		return domain.SpecVersion{}, err
	}
	settings, err := s.repo.GetSettings(ctx)
	if err != nil {
		return domain.SpecVersion{}, err
	}
	issues := spec.Validate(sp, spec.Options{StockThicknesses: settings.StockThicknesses})
	return s.repo.AddSpecVersion(ctx, domain.SpecVersion{ProjectID: projectID, Source: domain.SourceUser, Spec: sp, Issues: issues})
}

// ValidateSpec checks a spec without storing it, for live feedback while
// the user edits.
func (s *Service) ValidateSpec(ctx context.Context, sp spec.Spec) ([]spec.Issue, error) {
	settings, err := s.repo.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	return spec.Validate(sp, spec.Options{StockThicknesses: settings.StockThicknesses}), nil
}

func sentPhotos(conv []llm.Message) map[string]bool {
	sent := map[string]bool{}
	for _, m := range conv {
		for _, p := range m.Parts {
			if p.Type == llm.Image {
				sent[p.PhotoID] = true
			}
		}
	}
	return sent
}
