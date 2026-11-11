package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"offcut/internal/analysis"
	"offcut/internal/crypto"
	"offcut/internal/domain"
	"offcut/internal/llm"
	"offcut/internal/spec"
)

// memRepo is an in-memory Repository.
type memRepo struct {
	mu       sync.Mutex
	projects map[string]domain.Project
	photos   map[string]domain.Photo
	specs    map[string][]domain.SpecVersion
	settings domain.Settings
	n        int
}

func newMemRepo() *memRepo {
	return &memRepo{
		projects: map[string]domain.Project{}, photos: map[string]domain.Photo{}, specs: map[string][]domain.SpecVersion{},
		settings: domain.Settings{Provider: "scripted", StockThicknesses: spec.DefaultStockThicknesses},
	}
}

func (r *memRepo) id() string { r.n++; return "id-" + string(rune('a'+r.n)) }

func (r *memRepo) CreateProject(_ context.Context, name string) (domain.Project, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	p := domain.Project{ID: r.id(), Name: name, Status: domain.StatusDraft}
	r.projects[p.ID] = p
	return p, nil
}

func (r *memRepo) GetProject(_ context.Context, id string) (domain.Project, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	p, ok := r.projects[id]
	if !ok {
		return p, domain.ErrNotFound
	}
	// Copy the conversation, as a database would.
	p.Conversation = append([]llm.Message(nil), p.Conversation...)
	return p, nil
}

func (r *memRepo) ListProjects(context.Context) ([]domain.Project, error) { return nil, nil }

func (r *memRepo) SaveProject(_ context.Context, p domain.Project) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.projects[p.ID] = p
	return nil
}

func (r *memRepo) ClaimForAnalysis(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	p := r.projects[id]
	if p.Status == domain.StatusAnalyzing {
		return domain.ErrConflict
	}
	p.Status = domain.StatusAnalyzing
	r.projects[id] = p
	return nil
}

func (r *memRepo) DeleteProject(context.Context, string) error { return nil }

func (r *memRepo) AddPhoto(_ context.Context, projectID, view, mediaType string) (domain.Photo, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ph := domain.Photo{ID: r.id(), ProjectID: projectID, View: view, MediaType: mediaType, CreatedAt: time.Now()}
	r.photos[ph.ID] = ph
	return ph, nil
}

func (r *memRepo) GetPhoto(_ context.Context, id string) (domain.Photo, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ph, ok := r.photos[id]
	if !ok {
		return ph, domain.ErrNotFound
	}
	return ph, nil
}

func (r *memRepo) ListPhotos(_ context.Context, projectID string) ([]domain.Photo, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []domain.Photo
	for _, ph := range r.photos {
		if ph.ProjectID == projectID {
			out = append(out, ph)
		}
	}
	return out, nil
}

func (r *memRepo) DeletePhoto(context.Context, string) error { return nil }

func (r *memRepo) AddSpecVersion(_ context.Context, v domain.SpecVersion) (domain.SpecVersion, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	v.Version = len(r.specs[v.ProjectID]) + 1
	r.specs[v.ProjectID] = append(r.specs[v.ProjectID], v)
	return v, nil
}

func (r *memRepo) LatestSpec(_ context.Context, projectID string) (domain.SpecVersion, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	vs := r.specs[projectID]
	if len(vs) == 0 {
		return domain.SpecVersion{}, domain.ErrNotFound
	}
	return vs[len(vs)-1], nil
}

func (r *memRepo) GetSettings(context.Context) (domain.Settings, error) { return r.settings, nil }

func (r *memRepo) SaveSettings(_ context.Context, s domain.Settings) error {
	r.settings = s
	return nil
}

type memStore struct{ m sync.Map }

func (s *memStore) Put(_ context.Context, k string, d []byte) error { s.m.Store(k, d); return nil }
func (s *memStore) Get(_ context.Context, k string) ([]byte, error) {
	v, ok := s.m.Load(k)
	if !ok {
		return nil, errors.New("missing")
	}
	return v.([]byte), nil
}
func (s *memStore) Delete(_ context.Context, k string) error { s.m.Delete(k); return nil }

// scripted replies with the next canned message, and records what it saw.
type scripted struct {
	replies []llm.Message
	seen    [][]llm.Message
}

func (s *scripted) Complete(_ context.Context, req llm.Request) (llm.Message, error) {
	s.seen = append(s.seen, req.Messages)
	if len(s.replies) == 0 {
		return llm.Message{}, errors.New("script ran out")
	}
	r := s.replies[0]
	s.replies = s.replies[1:]
	return r, nil
}

func toolCall(id, name string, input any) llm.Message {
	b, _ := json.Marshal(input)
	return llm.Message{Role: llm.Assistant, Parts: []llm.Part{{Type: llm.ToolCall, ID: id, Name: name, Input: b}}}
}

var pngBytes = []byte("\x89PNG\r\n\x1a\n0000000000000000")

func setup(t *testing.T, replies ...llm.Message) (*Service, *memRepo, *scripted, string) {
	t.Helper()
	repo := newMemRepo()
	sealer, err := crypto.NewSealer("test-secret-0123456789")
	if err != nil {
		t.Fatal(err)
	}
	prov := &scripted{replies: replies}
	svc := New(repo, &memStore{}, sealer, func(llm.Config) (llm.Provider, error) { return prov, nil })
	ctx := context.Background()
	p, _ := svc.CreateProject(ctx, "Bedside table")
	if _, err := svc.AddPhoto(ctx, p.ID, "Front", pngBytes); err != nil {
		t.Fatal(err)
	}
	return svc, repo, prov, p.ID
}

func analyze(t *testing.T, svc *Service, id string, in AnalyzeInput) domain.Project {
	t.Helper()
	ctx := context.Background()
	if _, err := svc.Analyze(ctx, id, in); err != nil {
		t.Fatal(err)
	}
	if err := svc.Wait(ctx); err != nil {
		t.Fatal(err)
	}
	d, err := svc.GetProject(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	return d.Project
}

var ref = &analysis.Reference{Label: "Top width", MM: 450}

func TestRepairLoop(t *testing.T) {
	broken := spec.Example()
	for i := range broken.Parts {
		if broken.Parts[i].ID == "shelf" {
			broken.Parts[i].Position.X, broken.Parts[i].Size.X = 0, 450 // overlaps both sides
		}
	}
	svc, repo, prov, id := setup(t,
		toolCall("c1", analysis.ToolSubmitSpec, broken),
		toolCall("c2", analysis.ToolSubmitSpec, spec.Example()),
	)
	p := analyze(t, svc, id, AnalyzeInput{Reference: ref})

	if p.Status != domain.StatusReady {
		t.Fatalf("status %s (%s)", p.Status, p.Error)
	}
	// The second request carried the validator's errors back as a tool result.
	last := prov.seen[1][len(prov.seen[1])-1]
	res := last.Parts[0]
	if res.Type != llm.ToolResult || !res.IsError || !strings.Contains(res.Text, "[overlap]") || !strings.Contains(res.Text, `"shelf"`) {
		t.Fatalf("repair message: %+v", res)
	}
	v, _ := repo.LatestSpec(context.Background(), id)
	if v.Version != 1 || spec.HasErrors(v.Issues) {
		t.Fatalf("stored version %d with issues %v", v.Version, v.Issues)
	}
}

func TestGivesUpRepairingAndKeepsTheSpec(t *testing.T) {
	broken := spec.Example()
	broken.Steps = broken.Steps[1:] // the bottom and sides are never added
	var replies []llm.Message
	for i := 0; i <= MaxRepairs; i++ {
		replies = append(replies, toolCall("c"+string(rune('0'+i)), analysis.ToolSubmitSpec, broken))
	}
	svc, repo, prov, id := setup(t, replies...)
	p := analyze(t, svc, id, AnalyzeInput{Reference: ref})

	if p.Status != domain.StatusReady || len(prov.seen) != MaxRepairs+1 {
		t.Fatalf("status %s after %d calls", p.Status, len(prov.seen))
	}
	v, _ := repo.LatestSpec(context.Background(), id)
	if !spec.HasErrors(v.Issues) {
		t.Fatal("the kept spec should carry its errors for the user")
	}
}

func TestAsksForPhotosThenContinues(t *testing.T) {
	svc, _, prov, id := setup(t,
		toolCall("ask", analysis.ToolRequestPhotos, analysis.RequestPhotosInput{Shots: []analysis.Shot{{View: "The back", Reason: "Is there a panel?"}}}),
		toolCall("done", analysis.ToolSubmitSpec, spec.Example()),
	)
	p := analyze(t, svc, id, AnalyzeInput{Reference: ref})
	if p.Status != domain.StatusNeedsInput || p.Pending == nil || p.Pending.Shots[0].View != "The back" {
		t.Fatalf("status %s, pending %+v", p.Status, p.Pending)
	}

	if _, err := svc.AddPhoto(context.Background(), id, "The back", pngBytes); err != nil {
		t.Fatal(err)
	}
	p = analyze(t, svc, id, AnalyzeInput{})
	if p.Status != domain.StatusReady {
		t.Fatalf("status %s (%s)", p.Status, p.Error)
	}
	// The reply answered the tool call first, then sent the new photo.
	reply := prov.seen[1][len(prov.seen[1])-1]
	if reply.Parts[0].Type != llm.ToolResult || reply.Parts[0].ID != "ask" || reply.Parts[1].Type != llm.Image {
		t.Fatalf("reply parts: %+v", reply.Parts)
	}
}

func TestNeedsAReferenceMeasurement(t *testing.T) {
	svc, _, _, id := setup(t)
	if _, err := svc.Analyze(context.Background(), id, AnalyzeInput{}); !IsInvalid(err) {
		t.Fatalf("want an invalid-input error, got %v", err)
	}
}

func TestRetryAfterFailure(t *testing.T) {
	svc, _, prov, id := setup(t) // no replies: the first call fails
	p := analyze(t, svc, id, AnalyzeInput{Reference: ref})
	if p.Status != domain.StatusFailed {
		t.Fatalf("status %s", p.Status)
	}
	prov.replies = []llm.Message{toolCall("ok", analysis.ToolSubmitSpec, spec.Example())}
	p = analyze(t, svc, id, AnalyzeInput{})
	if p.Status != domain.StatusReady {
		t.Fatalf("retry: status %s (%s)", p.Status, p.Error)
	}
	if n := len(prov.seen[1]); n != 1 {
		t.Fatalf("the retry should resend the same single message, sent %d", n)
	}
}
