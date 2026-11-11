// Package domain holds the entities the service works with and the
// repository stores.
package domain

import (
	"errors"
	"time"

	"offcut/internal/analysis"
	"offcut/internal/llm"
	"offcut/internal/spec"
)

type Status string

const (
	StatusDraft      Status = "draft"       // photos being added; not analysed yet
	StatusAnalyzing  Status = "analyzing"   // the model is working
	StatusNeedsInput Status = "needs_input" // the model asked for photos or answers
	StatusReady      Status = "ready"       // a spec exists
	StatusFailed     Status = "failed"      // the last analysis failed; see Error
)

// PendingCall is a tool call the model made that waits on the user.
type PendingCall struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Pending is what the model asked for and is waiting on.
type Pending struct {
	Calls     []PendingCall       `json:"calls"`
	Message   string              `json:"message"`
	Shots     []analysis.Shot     `json:"shots"`
	Questions []analysis.Question `json:"questions"`
}

type Project struct {
	ID           string
	Name         string
	Status       Status
	Pending      *Pending
	Conversation []llm.Message
	Reference    *analysis.Reference
	Notes        string
	Error        string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type Photo struct {
	ID        string
	ProjectID string
	View      string
	MediaType string
	CreatedAt time.Time
}

type SpecSource string

const (
	SourceAI   SpecSource = "ai"
	SourceUser SpecSource = "user"
)

type SpecVersion struct {
	ProjectID string
	Version   int
	Source    SpecSource
	Spec      spec.Spec
	Issues    []spec.Issue
	CreatedAt time.Time
}

type Settings struct {
	Provider         string
	Model            string
	BaseURL          string
	APIKeyEnc        []byte
	StockThicknesses []float64
	UpdatedAt        time.Time
}

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
)
