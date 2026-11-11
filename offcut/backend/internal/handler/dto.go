package handler

import (
	"time"

	"offcut/internal/analysis"
	"offcut/internal/domain"
	"offcut/internal/llm"
	"offcut/internal/service"
	"offcut/internal/spec"
)

// The API's shapes. They are what swag documents and orval generates the
// frontend types from, so they are named for the frontend: @name sets the
// type name in the OpenAPI document.

type ErrorResponse struct {
	Error string `json:"error"`
} //@name ErrorResponse

type Reference struct {
	Label string  `json:"label" example:"Top width"`
	MM    float64 `json:"mm" example:"450"`
} //@name Reference

type ProjectStatus string //@name ProjectStatus

const (
	StatusDraft      ProjectStatus = "draft"
	StatusAnalyzing  ProjectStatus = "analyzing"
	StatusNeedsInput ProjectStatus = "needs_input"
	StatusReady      ProjectStatus = "ready"
	StatusFailed     ProjectStatus = "failed"
)

type ProjectSummary struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	Status       ProjectStatus `json:"status"`
	PhotoCount   int           `json:"photoCount"`
	CoverPhotoID string        `json:"coverPhotoId,omitempty"`
	Overall      *spec.Overall `json:"overall,omitempty"`
	PartCount    int           `json:"partCount"`
	PendingCount int           `json:"pendingCount"`
	UpdatedAt    time.Time     `json:"updatedAt"`
} //@name ProjectSummary

type Pending struct {
	Message   string              `json:"message"`
	Shots     []analysis.Shot     `json:"shots"`
	Questions []analysis.Question `json:"questions"`
} //@name Pending

type Photo struct {
	ID        string    `json:"id"`
	View      string    `json:"view"`
	URL       string    `json:"url"`
	Sent      bool      `json:"sent"`
	CreatedAt time.Time `json:"createdAt"`
} //@name Photo

type SpecVersion struct {
	Version int          `json:"version"`
	Source  string       `json:"source" enums:"ai,user"`
	Spec    spec.Spec    `json:"spec"`
	Issues  []spec.Issue `json:"issues"`
	// Fixings are worked out from the spec: where every screw, nail and dowel goes, and its holes.
	Fixings   []spec.Fixing `json:"fixings"`
	CreatedAt time.Time     `json:"createdAt"`
} //@name SpecVersion

// ConversationEntry is a readable line of what was said to and by the AI.
type ConversationEntry struct {
	Role string `json:"role" enums:"user,assistant"`
	Text string `json:"text"`
} //@name ConversationEntry

type Project struct {
	ID           string              `json:"id"`
	Name         string              `json:"name"`
	Status       ProjectStatus       `json:"status"`
	Error        string              `json:"error"`
	Reference    *Reference          `json:"reference,omitempty"`
	Notes        string              `json:"notes"`
	Pending      *Pending            `json:"pending,omitempty"`
	Photos       []Photo             `json:"photos"`
	Spec         *SpecVersion        `json:"spec,omitempty"`
	Conversation []ConversationEntry `json:"conversation"`
	CreatedAt    time.Time           `json:"createdAt"`
	UpdatedAt    time.Time           `json:"updatedAt"`
} //@name Project

type CreateProjectRequest struct {
	Name string `json:"name" example:"Bedside table"`
} //@name CreateProjectRequest

type RenameProjectRequest struct {
	Name string `json:"name"`
} //@name RenameProjectRequest

type AnalyzeRequest struct {
	Reference *Reference `json:"reference,omitempty"`
	Notes     string     `json:"notes,omitempty"`
	Answers   []string   `json:"answers,omitempty"`
	Skip      bool       `json:"skip,omitempty"`
} //@name AnalyzeRequest

type UpdateSpecRequest struct {
	Spec spec.Spec `json:"spec"`
} //@name UpdateSpecRequest

type ValidateResponse struct {
	Issues  []spec.Issue  `json:"issues"`
	Fixings []spec.Fixing `json:"fixings"`
} //@name ValidateResponse

type Settings struct {
	Provider         string    `json:"provider" enums:"anthropic,openai,demo"`
	Model            string    `json:"model"`
	BaseURL          string    `json:"baseUrl"`
	HasKey           bool      `json:"hasKey"`
	StockThicknesses []float64 `json:"stockThicknesses"`
	DefaultModel     string    `json:"defaultModel"`
} //@name Settings

type UpdateSettingsRequest struct {
	Provider string `json:"provider" enums:"anthropic,openai,demo"`
	Model    string `json:"model"`
	BaseURL  string `json:"baseUrl"`
	// Leave out to keep the stored key; send "" to remove it.
	APIKey           *string   `json:"apiKey,omitempty"`
	StockThicknesses []float64 `json:"stockThicknesses"`
} //@name UpdateSettingsRequest

type TestResult struct {
	OK        bool   `json:"ok"`
	Message   string `json:"message"`
	LatencyMS int64  `json:"latencyMs"`
} //@name TestResult

func toSummary(s service.ProjectSummary) ProjectSummary {
	out := ProjectSummary{
		ID: s.Project.ID, Name: s.Project.Name, Status: ProjectStatus(s.Project.Status),
		PhotoCount: s.PhotoCount, CoverPhotoID: s.CoverPhoto, Overall: s.Overall,
		PartCount: s.PartCount, UpdatedAt: s.Project.UpdatedAt,
	}
	if p := s.Project.Pending; p != nil {
		out.PendingCount = len(p.Shots) + len(p.Questions)
	}
	return out
}

func toProject(d service.ProjectDetail) Project {
	p := d.Project
	out := Project{
		ID: p.ID, Name: p.Name, Status: ProjectStatus(p.Status), Error: p.Error, Notes: p.Notes,
		Photos: []Photo{}, Conversation: []ConversationEntry{}, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}
	if p.Reference != nil {
		out.Reference = &Reference{Label: p.Reference.Label, MM: p.Reference.MM}
	}
	if p.Pending != nil {
		out.Pending = &Pending{Message: p.Pending.Message, Shots: nonNil(p.Pending.Shots), Questions: nonNil(p.Pending.Questions)}
	}
	sent := map[string]bool{}
	for _, m := range p.Conversation {
		var text string
		for _, part := range m.Parts {
			switch part.Type {
			case llm.Image:
				sent[part.PhotoID] = true
			case llm.Text:
				if text != "" {
					text += "\n\n"
				}
				text += part.Text
			}
		}
		if text != "" {
			out.Conversation = append(out.Conversation, ConversationEntry{Role: string(m.Role), Text: text})
		}
	}
	for _, ph := range d.Photos {
		out.Photos = append(out.Photos, Photo{ID: ph.ID, View: ph.View, URL: "/api/photos/" + ph.ID, Sent: sent[ph.ID], CreatedAt: ph.CreatedAt})
	}
	if d.Spec != nil {
		v := toSpecVersion(*d.Spec)
		out.Spec = &v
	}
	return out
}

func toSpecVersion(v domain.SpecVersion) SpecVersion {
	return SpecVersion{Version: v.Version, Source: string(v.Source), Spec: v.Spec, Issues: nonNil(v.Issues), Fixings: nonNil(spec.Fixings(v.Spec)), CreatedAt: v.CreatedAt}
}

func toSettings(s service.SettingsView, defaultModel string) Settings {
	return Settings{Provider: s.Provider, Model: s.Model, BaseURL: s.BaseURL, HasKey: s.HasKey, StockThicknesses: nonNil(s.StockThicknesses), DefaultModel: defaultModel}
}

func nonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}
