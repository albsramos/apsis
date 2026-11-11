package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"offcut/internal/analysis"
	"offcut/internal/domain"
	"offcut/internal/llm"
	"offcut/internal/spec"
)

const (
	// MaxRepairs is how many times the model may resubmit a spec that fails
	// validation. After that the spec is kept, with its issues, for the user.
	MaxRepairs = 3
	// maxTurns bounds one analysis run, whatever happens.
	maxTurns = 10
	// analysisTimeout bounds one run's wall-clock time.
	analysisTimeout = 30 * time.Minute
)

type AnalyzeInput struct {
	// Reference gives the photos their scale. Required for the first run.
	Reference *analysis.Reference
	// Notes is free text: anything the user wants the model to know.
	Notes string
	// Answers to the pending questions, in order.
	Answers []string
	// Skip means the user can't provide what was asked: go on with assumptions.
	Skip bool
}

// Analyze starts an analysis in the background: the first run, a reply to
// what the model asked, or a re-run with new photos or notes. It returns once
// the run has started; poll the project for its status.
func (s *Service) Analyze(ctx context.Context, projectID string, in AnalyzeInput) (domain.Project, error) {
	p, err := s.repo.GetProject(ctx, projectID)
	if err != nil {
		return p, err
	}
	photos, err := s.repo.ListPhotos(ctx, projectID)
	if err != nil {
		return p, err
	}
	msg, err := nextUserMessage(&p, photos, in)
	retry := false
	if err != nil {
		// After a failure with nothing new to say, run the same conversation again.
		if !retryable(p) || !IsInvalid(err) {
			return p, err
		}
		retry = true
	}
	if err := s.repo.ClaimForAnalysis(ctx, projectID); err != nil {
		if errors.Is(err, domain.ErrConflict) {
			return p, fmt.Errorf("%w: an analysis is already running", domain.ErrConflict)
		}
		return p, err
	}
	if !retry {
		p.Conversation = append(p.Conversation, msg)
	}
	p.Status, p.Pending, p.Error = domain.StatusAnalyzing, nil, ""
	if err := s.repo.SaveProject(ctx, p); err != nil {
		return p, err
	}
	s.analyses <- struct{}{}
	go func() {
		defer func() { <-s.analyses }()
		s.run(projectID)
	}()
	return p, nil
}

// Wait blocks until no analysis is running. For tests and shutdown.
func (s *Service) Wait(ctx context.Context) error {
	for len(s.analyses) > 0 {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(20 * time.Millisecond):
		}
	}
	return nil
}

// retryable reports whether a failed run can simply be run again: the
// conversation ends with the user's turn, so the model owes a reply.
func retryable(p domain.Project) bool {
	n := len(p.Conversation)
	return p.Status == domain.StatusFailed && n > 0 && p.Conversation[n-1].Role == llm.User
}

// nextUserMessage builds what the user says next, from the project's state.
func nextUserMessage(p *domain.Project, photos []domain.Photo, in AnalyzeInput) (llm.Message, error) {
	if in.Reference != nil {
		if in.Reference.MM <= 0 || strings.TrimSpace(in.Reference.Label) == "" {
			return llm.Message{}, Invalid("The reference measurement needs a label and a length in millimetres.")
		}
		p.Reference = in.Reference
	}
	if strings.TrimSpace(in.Notes) != "" && len(p.Conversation) == 0 {
		p.Notes = strings.TrimSpace(in.Notes)
	}

	sent := sentPhotos(p.Conversation)
	var fresh []domain.Photo
	for _, ph := range photos {
		if !sent[ph.ID] {
			fresh = append(fresh, ph)
		}
	}
	var parts []llm.Part

	// First run: every photo, then the opening text.
	if len(p.Conversation) == 0 {
		if len(photos) == 0 {
			return llm.Message{}, Invalid("Add at least one photo first.")
		}
		if p.Reference == nil {
			return llm.Message{}, Invalid("Add one real measurement, so the photos have a scale.")
		}
		for _, ph := range photos {
			parts = append(parts, llm.Part{Type: llm.Image, PhotoID: ph.ID})
		}
		parts = append(parts, llm.Part{Type: llm.Text, Text: analysis.Opening(p.Reference, p.Notes, refs(photos))})
		return llm.Message{Role: llm.User, Parts: parts}, nil
	}

	// A reply to the model's request: one result per pending tool call, then
	// any new photos.
	if p.Status == domain.StatusNeedsInput && p.Pending != nil {
		answered := 0
		for _, call := range p.Pending.Calls {
			parts = append(parts, llm.Part{Type: llm.ToolResult, ID: call.ID, Text: replyTo(call, p.Pending, fresh, in, &answered)})
		}
	}

	if len(fresh) > 0 {
		for _, ph := range fresh {
			parts = append(parts, llm.Part{Type: llm.Image, PhotoID: ph.ID})
		}
		parts = append(parts, llm.Part{Type: llm.Text, Text: analysis.MorePhotos(refs(fresh))})
	}
	if in.Reference != nil {
		parts = append(parts, llm.Part{Type: llm.Text, Text: fmt.Sprintf("Reference measurement: %s is %g mm.", in.Reference.Label, in.Reference.MM)})
	}
	if note := strings.TrimSpace(in.Notes); note != "" {
		parts = append(parts, llm.Part{Type: llm.Text, Text: note})
	}
	if p.Status != domain.StatusNeedsInput {
		if len(parts) == 0 {
			return llm.Message{}, Invalid("Add a photo or a note to tell the AI what to change.")
		}
		parts = append(parts, llm.Part{Type: llm.Text, Text: "Update the spec to match, and submit it again."})
	}
	if len(parts) == 0 {
		return llm.Message{}, Invalid("Add the photos or answers the AI asked for, or skip them.")
	}
	return llm.Message{Role: llm.User, Parts: parts}, nil
}

func replyTo(call domain.PendingCall, pending *domain.Pending, fresh []domain.Photo, in AnalyzeInput, answered *int) string {
	if in.Skip {
		return "The user can't provide this. Continue with sensible assumptions and record them."
	}
	switch call.Name {
	case analysis.ToolRequestPhotos:
		if len(fresh) == 0 {
			return "The user didn't add photos. Continue with sensible assumptions and record them."
		}
		return fmt.Sprintf("The user added %d photo(s); they follow this message.", len(fresh))
	case analysis.ToolAskUser:
		var b strings.Builder
		for i, q := range pending.Questions {
			answer := "(no answer)"
			if i < len(in.Answers) && strings.TrimSpace(in.Answers[i]) != "" {
				answer = strings.TrimSpace(in.Answers[i])
				*answered++
			}
			fmt.Fprintf(&b, "Q: %s\nA: %s\n", q.Question, answer)
		}
		return strings.TrimSpace(b.String())
	}
	return "Not run."
}

func refs(photos []domain.Photo) []analysis.PhotoRef {
	out := make([]analysis.PhotoRef, len(photos))
	for i, ph := range photos {
		out[i] = analysis.PhotoRef{ID: ph.ID, View: ph.View}
	}
	return out
}

// run is one analysis: it calls the model until the model asks the user
// something or submits a spec that passes validation.
func (s *Service) run(projectID string) {
	ctx, cancel := context.WithTimeout(context.Background(), analysisTimeout)
	defer cancel()
	log := slog.With("project", projectID)

	p, err := s.repo.GetProject(ctx, projectID)
	if err != nil {
		log.Error("analysis: loading project", "err", err)
		return
	}
	fail := func(msg string, err error) {
		log.Error("analysis failed", "msg", msg, "err", err)
		// Every tool call needs a result before the conversation can go on.
		if n := len(p.Conversation); n > 0 && p.Conversation[n-1].Role == llm.Assistant {
			var results []llm.Part
			for _, c := range p.Conversation[n-1].ToolCalls() {
				results = append(results, llm.Part{Type: llm.ToolResult, ID: c.ID, Text: "Not run: the analysis stopped.", IsError: true})
			}
			if len(results) > 0 {
				p.Conversation = append(p.Conversation, llm.Message{Role: llm.User, Parts: results})
			}
		}
		p.Status, p.Error, p.Pending = domain.StatusFailed, msg, nil
		if err := s.repo.SaveProject(context.Background(), p); err != nil {
			log.Error("analysis: saving failure", "err", err)
		}
	}

	provider, stock, err := s.activeProvider(ctx)
	if err != nil {
		fail(err.Error(), err)
		return
	}

	repairs, nudged := 0, false
	for turn := 0; turn < maxTurns; turn++ {
		start := time.Now()
		reply, err := provider.Complete(ctx, llm.Request{
			System: analysis.SystemPrompt, Tools: analysis.Tools, Messages: p.Conversation, Images: s.loadImage,
		})
		if err != nil {
			if errors.Is(err, llm.ErrRefused) {
				fail("The AI declined to analyse these photos.", err)
			} else {
				fail("The AI request failed: "+err.Error(), err)
			}
			return
		}
		log.Info("analysis turn", "turn", turn, "took", time.Since(start).Round(time.Millisecond), "calls", len(reply.ToolCalls()))
		p.Conversation = append(p.Conversation, reply)

		calls := reply.ToolCalls()
		if len(calls) == 0 {
			if nudged {
				fail("The AI stopped without producing a spec.", nil)
				return
			}
			nudged = true
			p.Conversation = append(p.Conversation, llm.Message{Role: llm.User, Parts: []llm.Part{{
				Type: llm.Text, Text: "Finish by calling request_photos, ask_user or submit_spec.",
			}}})
			if err := s.repo.SaveProject(ctx, p); err != nil {
				fail("Saving the conversation failed.", err)
				return
			}
			continue
		}

		var submit *llm.Part
		var asks []llm.Part
		for i := range calls {
			switch calls[i].Name {
			case analysis.ToolSubmitSpec:
				if submit == nil {
					submit = &calls[i]
				}
			case analysis.ToolRequestPhotos, analysis.ToolAskUser:
				asks = append(asks, calls[i])
			}
		}

		// A submitted spec wins over questions asked in the same turn.
		if submit != nil {
			sp, issues, decodeErr := decodeSpec(submit.Input, stock)
			var results []llm.Part
			for _, c := range calls {
				if c.ID != submit.ID {
					results = append(results, llm.Part{Type: llm.ToolResult, ID: c.ID, Text: "Not run: a spec was submitted in the same turn.", IsError: true})
				}
			}
			if decodeErr != nil || spec.HasErrors(issues) {
				if repairs < MaxRepairs {
					repairs++
					text := "The spec isn't valid JSON for the schema: " + errString(decodeErr)
					if decodeErr == nil {
						text = repairMessage(issues)
					}
					results = append(results, llm.Part{Type: llm.ToolResult, ID: submit.ID, Text: text, IsError: true})
					p.Conversation = append(p.Conversation, llm.Message{Role: llm.User, Parts: results})
					if err := s.repo.SaveProject(ctx, p); err != nil {
						fail("Saving the conversation failed.", err)
						return
					}
					log.Info("analysis: spec rejected", "repair", repairs, "errors", countErrors(issues))
					continue
				}
				if decodeErr != nil {
					fail("The AI couldn't produce a spec in the expected format.", decodeErr)
					return
				}
				// Out of repairs: keep the spec and show the user what's wrong.
			}
			v, err := s.repo.AddSpecVersion(ctx, domain.SpecVersion{ProjectID: projectID, Source: domain.SourceAI, Spec: sp, Issues: issues})
			if err != nil {
				fail("Saving the spec failed.", err)
				return
			}
			accepted := fmt.Sprintf("Accepted as version %d.", v.Version)
			if spec.HasErrors(issues) {
				accepted += " Some errors remain; the user will fix them by hand."
			}
			results = append(results, llm.Part{Type: llm.ToolResult, ID: submit.ID, Text: accepted})
			p.Conversation = append(p.Conversation, llm.Message{Role: llm.User, Parts: results})
			p.Status, p.Pending, p.Error = domain.StatusReady, nil, ""
			if err := s.repo.SaveProject(ctx, p); err != nil {
				log.Error("analysis: saving", "err", err)
			}
			return
		}

		if len(asks) > 0 {
			pending := &domain.Pending{Message: strings.TrimSpace(reply.Text())}
			var results []llm.Part
			for _, c := range calls {
				switch c.Name {
				case analysis.ToolRequestPhotos:
					var in analysis.RequestPhotosInput
					_ = json.Unmarshal(c.Input, &in)
					pending.Shots = append(pending.Shots, in.Shots...)
					pending.Calls = append(pending.Calls, domain.PendingCall{ID: c.ID, Name: c.Name})
				case analysis.ToolAskUser:
					var in analysis.AskUserInput
					_ = json.Unmarshal(c.Input, &in)
					pending.Questions = append(pending.Questions, in.Questions...)
					pending.Calls = append(pending.Calls, domain.PendingCall{ID: c.ID, Name: c.Name})
				default:
					results = append(results, llm.Part{Type: llm.ToolResult, ID: c.ID, Text: "Unknown tool.", IsError: true})
				}
			}
			// Unknown calls can't wait for the user; there are none in practice,
			// but if there are, the user's reply carries their results too.
			for _, r := range results {
				pending.Calls = append(pending.Calls, domain.PendingCall{ID: r.ID, Name: "unknown"})
			}
			p.Status, p.Pending = domain.StatusNeedsInput, pending
			if err := s.repo.SaveProject(ctx, p); err != nil {
				fail("Saving the request failed.", err)
			}
			return
		}

		// Only unknown tools were called: say so and let the model try again.
		var results []llm.Part
		for _, c := range calls {
			results = append(results, llm.Part{Type: llm.ToolResult, ID: c.ID, Text: "Unknown tool. Use request_photos, ask_user or submit_spec.", IsError: true})
		}
		p.Conversation = append(p.Conversation, llm.Message{Role: llm.User, Parts: results})
	}
	fail(fmt.Sprintf("The AI didn't finish within %d turns.", maxTurns), nil)
}

func decodeSpec(input json.RawMessage, stock []float64) (spec.Spec, []spec.Issue, error) {
	var sp spec.Spec
	if err := json.Unmarshal(input, &sp); err != nil {
		return sp, nil, err
	}
	return sp, spec.Validate(sp, spec.Options{StockThicknesses: stock}), nil
}

func repairMessage(issues []spec.Issue) string {
	var b strings.Builder
	b.WriteString("The spec was rejected. Fix these errors and submit the whole spec again:\n")
	for _, i := range issues {
		if i.Severity == spec.Error {
			fmt.Fprintf(&b, "- [%s] %s\n", i.Code, i.Message)
		}
	}
	return strings.TrimSpace(b.String())
}

func countErrors(issues []spec.Issue) int {
	n := 0
	for _, i := range issues {
		if i.Severity == spec.Error {
			n++
		}
	}
	return n
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func (s *Service) loadImage(ctx context.Context, photoID string) (string, []byte, error) {
	ph, data, err := s.PhotoData(ctx, photoID)
	if err != nil {
		return "", nil, fmt.Errorf("loading photo %s: %w", photoID, err)
	}
	return ph.MediaType, data, nil
}
