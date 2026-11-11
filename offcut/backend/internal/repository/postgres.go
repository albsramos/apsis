// Package repository stores the domain in Postgres. It knows SQL and nothing
// about HTTP or the model.
package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"sort"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"offcut/internal/domain"
	"offcut/migrations"
)

type Postgres struct{ db *pgxpool.Pool }

func Open(ctx context.Context, url string) (*Postgres, error) {
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(ctx); err != nil {
		return nil, fmt.Errorf("connecting to postgres: %w", err)
	}
	return &Postgres{db: db}, nil
}

func (r *Postgres) Close() { r.db.Close() }

// Migrate applies every migration not yet applied, in file-name order.
func (r *Postgres) Migrate(ctx context.Context) error {
	if _, err := r.db.Exec(ctx, `create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`); err != nil {
		return err
	}
	names, err := fs.Glob(migrations.FS, "*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	for _, name := range names {
		var done bool
		if err := r.db.QueryRow(ctx, `select exists(select 1 from schema_migrations where name = $1)`, name).Scan(&done); err != nil {
			return err
		}
		if done {
			continue
		}
		sql, err := fs.ReadFile(migrations.FS, name)
		if err != nil {
			return err
		}
		err = pgx.BeginFunc(ctx, r.db, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(sql)); err != nil {
				return fmt.Errorf("migration %s: %w", name, err)
			}
			_, err := tx.Exec(ctx, `insert into schema_migrations (name) values ($1)`, name)
			return err
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrNotFound
	}
	return err
}

// --- projects ---

const projectColumns = `id, name, status, pending, conversation, reference, notes, error, created_at, updated_at`

func scanProject(row pgx.Row) (domain.Project, error) {
	var p domain.Project
	var pending, conversation, reference []byte
	if err := row.Scan(&p.ID, &p.Name, &p.Status, &pending, &conversation, &reference, &p.Notes, &p.Error, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return p, notFound(err)
	}
	if len(pending) > 0 && string(pending) != "null" {
		if err := json.Unmarshal(pending, &p.Pending); err != nil {
			return p, err
		}
	}
	if err := json.Unmarshal(conversation, &p.Conversation); err != nil {
		return p, err
	}
	if len(reference) > 0 && string(reference) != "null" {
		if err := json.Unmarshal(reference, &p.Reference); err != nil {
			return p, err
		}
	}
	return p, nil
}

func (r *Postgres) CreateProject(ctx context.Context, name string) (domain.Project, error) {
	return scanProject(r.db.QueryRow(ctx, `insert into projects (name) values ($1) returning `+projectColumns, name))
}

func (r *Postgres) GetProject(ctx context.Context, id string) (domain.Project, error) {
	return scanProject(r.db.QueryRow(ctx, `select `+projectColumns+` from projects where id = $1`, id))
}

func (r *Postgres) ListProjects(ctx context.Context) ([]domain.Project, error) {
	rows, err := r.db.Query(ctx, `select `+projectColumns+` from projects order by updated_at desc`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Project
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SaveProject writes every mutable field.
func (r *Postgres) SaveProject(ctx context.Context, p domain.Project) error {
	pending, err := json.Marshal(p.Pending)
	if err != nil {
		return err
	}
	conversation, err := json.Marshal(p.Conversation)
	if err != nil {
		return err
	}
	reference, err := json.Marshal(p.Reference)
	if err != nil {
		return err
	}
	tag, err := r.db.Exec(ctx, `
		update projects set name = $2, status = $3, pending = $4, conversation = $5, reference = $6, notes = $7, error = $8, updated_at = now()
		where id = $1`,
		p.ID, p.Name, p.Status, pending, conversation, reference, p.Notes, p.Error)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// ClaimForAnalysis moves a project to "analyzing" only if it isn't already,
// so two clicks can't start two analyses.
func (r *Postgres) ClaimForAnalysis(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `update projects set status = 'analyzing', error = '', updated_at = now() where id = $1 and status <> 'analyzing'`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		if _, err := r.GetProject(ctx, id); err != nil {
			return err
		}
		return domain.ErrConflict
	}
	return nil
}

// FailInterrupted marks analyses that were running when the server stopped.
func (r *Postgres) FailInterrupted(ctx context.Context) error {
	_, err := r.db.Exec(ctx, `update projects set status = 'failed', error = 'The server restarted during the analysis. Start it again.' where status = 'analyzing'`)
	return err
}

func (r *Postgres) DeleteProject(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `delete from projects where id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// --- photos ---

func (r *Postgres) AddPhoto(ctx context.Context, projectID, view, mediaType string) (domain.Photo, error) {
	var ph domain.Photo
	err := r.db.QueryRow(ctx, `insert into photos (project_id, view, media_type) values ($1, $2, $3)
		returning id, project_id, view, media_type, created_at`, projectID, view, mediaType).
		Scan(&ph.ID, &ph.ProjectID, &ph.View, &ph.MediaType, &ph.CreatedAt)
	return ph, err
}

func (r *Postgres) GetPhoto(ctx context.Context, id string) (domain.Photo, error) {
	var ph domain.Photo
	err := r.db.QueryRow(ctx, `select id, project_id, view, media_type, created_at from photos where id = $1`, id).
		Scan(&ph.ID, &ph.ProjectID, &ph.View, &ph.MediaType, &ph.CreatedAt)
	return ph, notFound(err)
}

func (r *Postgres) ListPhotos(ctx context.Context, projectID string) ([]domain.Photo, error) {
	rows, err := r.db.Query(ctx, `select id, project_id, view, media_type, created_at from photos where project_id = $1 order by created_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Photo
	for rows.Next() {
		var ph domain.Photo
		if err := rows.Scan(&ph.ID, &ph.ProjectID, &ph.View, &ph.MediaType, &ph.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, ph)
	}
	return out, rows.Err()
}

func (r *Postgres) DeletePhoto(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `delete from photos where id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

// --- specs ---

// AddSpecVersion stores a spec as the project's next version.
func (r *Postgres) AddSpecVersion(ctx context.Context, v domain.SpecVersion) (domain.SpecVersion, error) {
	specJSON, err := json.Marshal(v.Spec)
	if err != nil {
		return v, err
	}
	issues, err := json.Marshal(v.Issues)
	if err != nil {
		return v, err
	}
	err = r.db.QueryRow(ctx, `
		insert into spec_versions (project_id, version, source, spec, issues)
		values ($1, coalesce((select max(version) from spec_versions where project_id = $1), 0) + 1, $2, $3, $4)
		returning version, created_at`,
		v.ProjectID, v.Source, specJSON, issues).Scan(&v.Version, &v.CreatedAt)
	return v, err
}

func (r *Postgres) LatestSpec(ctx context.Context, projectID string) (domain.SpecVersion, error) {
	var v domain.SpecVersion
	var specJSON, issues []byte
	err := r.db.QueryRow(ctx, `select project_id, version, source, spec, issues, created_at from spec_versions
		where project_id = $1 order by version desc limit 1`, projectID).
		Scan(&v.ProjectID, &v.Version, &v.Source, &specJSON, &issues, &v.CreatedAt)
	if err != nil {
		return v, notFound(err)
	}
	if err := json.Unmarshal(specJSON, &v.Spec); err != nil {
		return v, err
	}
	return v, json.Unmarshal(issues, &v.Issues)
}

// --- settings ---

func (r *Postgres) GetSettings(ctx context.Context) (domain.Settings, error) {
	var s domain.Settings
	var stock []byte
	err := r.db.QueryRow(ctx, `select provider, model, base_url, api_key_enc, stock_thicknesses, updated_at from settings where id = 1`).
		Scan(&s.Provider, &s.Model, &s.BaseURL, &s.APIKeyEnc, &stock, &s.UpdatedAt)
	if err != nil {
		return s, notFound(err)
	}
	return s, json.Unmarshal(stock, &s.StockThicknesses)
}

func (r *Postgres) SaveSettings(ctx context.Context, s domain.Settings) error {
	stock, err := json.Marshal(s.StockThicknesses)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(ctx, `update settings set provider = $1, model = $2, base_url = $3, api_key_enc = $4, stock_thicknesses = $5, updated_at = now() where id = 1`,
		s.Provider, s.Model, s.BaseURL, s.APIKeyEnc, stock)
	return err
}
