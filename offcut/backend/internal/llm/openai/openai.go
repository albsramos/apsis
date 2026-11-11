// Package openai adapts the llm port to any OpenAI-compatible chat completions
// API: OpenAI itself, OpenRouter, Ollama, LM Studio, vLLM, and Gemini through
// Google's OpenAI-compatible endpoint. The model must read images and call
// tools.
package openai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"offcut/internal/llm"
)

const (
	Name           = "openai"
	DefaultBaseURL = "https://api.openai.com/v1"
)

type Provider struct {
	baseURL, apiKey, model string
	http                   *http.Client
}

func New(cfg llm.Config) *Provider {
	base := strings.TrimRight(cfg.BaseURL, "/")
	if base == "" {
		base = DefaultBaseURL
	}
	return &Provider{baseURL: base, apiKey: cfg.APIKey, model: cfg.Model, http: &http.Client{Timeout: 15 * time.Minute}}
}

type chatMessage struct {
	Role       string     `json:"role"`
	Content    any        `json:"content,omitempty"`
	ToolCalls  []toolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

type contentPart struct {
	Type     string    `json:"type"`
	Text     string    `json:"text,omitempty"`
	ImageURL *imageURL `json:"image_url,omitempty"`
}

type imageURL struct {
	URL string `json:"url"`
}

type toolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type chatRequest struct {
	Model      string        `json:"model"`
	Messages   []chatMessage `json:"messages"`
	Tools      []any         `json:"tools,omitempty"`
	ToolChoice string        `json:"tool_choice,omitempty"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content   string     `json:"content"`
			Refusal   string     `json:"refusal"`
			ToolCalls []toolCall `json:"tool_calls"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (p *Provider) Complete(ctx context.Context, req llm.Request) (llm.Message, error) {
	msgs := []chatMessage{{Role: "system", Content: req.System}}
	for _, m := range req.Messages {
		converted, err := toChat(ctx, req.Images, m)
		if err != nil {
			return llm.Message{}, err
		}
		msgs = append(msgs, converted...)
	}
	body := chatRequest{Model: p.model, Messages: msgs}
	if len(req.Tools) > 0 {
		body.ToolChoice = "required"
	}
	for _, t := range req.Tools {
		body.Tools = append(body.Tools, map[string]any{
			"type":     "function",
			"function": map[string]any{"name": t.Name, "description": t.Description, "parameters": t.Schema},
		})
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return llm.Message{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/chat/completions", bytes.NewReader(buf))
	if err != nil {
		return llm.Message{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if p.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	}
	resp, err := p.http.Do(httpReq)
	if err != nil {
		return llm.Message{}, fmt.Errorf("openai: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out chatResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return llm.Message{}, fmt.Errorf("openai: %d: %s", resp.StatusCode, truncate(string(raw), 300))
	}
	if out.Error != nil || resp.StatusCode >= 400 {
		msg := truncate(string(raw), 300)
		if out.Error != nil {
			msg = out.Error.Message
		}
		return llm.Message{}, fmt.Errorf("openai: %d: %s", resp.StatusCode, msg)
	}
	if len(out.Choices) == 0 {
		return llm.Message{}, fmt.Errorf("openai: the response had no choices")
	}
	c := out.Choices[0]
	if c.Message.Refusal != "" {
		return llm.Message{}, llm.ErrRefused
	}
	if c.FinishReason == "length" {
		return llm.Message{}, fmt.Errorf("openai: the response hit the output limit before the spec was finished")
	}
	m := llm.Message{Role: llm.Assistant}
	if c.Message.Content != "" {
		m.Parts = append(m.Parts, llm.Part{Type: llm.Text, Text: c.Message.Content})
	}
	for _, tc := range c.Message.ToolCalls {
		args := json.RawMessage(tc.Function.Arguments)
		if !json.Valid(args) {
			args = json.RawMessage("{}")
		}
		m.Parts = append(m.Parts, llm.Part{Type: llm.ToolCall, ID: tc.ID, Name: tc.Function.Name, Input: args})
	}
	return m, nil
}

// toChat converts one neutral message. A user message holding tool results
// becomes one "tool" message per result, followed by a user message with the
// rest (new photos, answers).
func toChat(ctx context.Context, images llm.ImageLoader, m llm.Message) ([]chatMessage, error) {
	if m.Role == llm.Assistant {
		cm := chatMessage{Role: "assistant", Content: m.Text()}
		for _, p := range m.ToolCalls() {
			tc := toolCall{ID: p.ID, Type: "function"}
			tc.Function.Name, tc.Function.Arguments = p.Name, string(p.Input)
			cm.ToolCalls = append(cm.ToolCalls, tc)
		}
		return []chatMessage{cm}, nil
	}
	var out []chatMessage
	var parts []contentPart
	for _, p := range m.Parts {
		switch p.Type {
		case llm.ToolResult:
			text := p.Text
			if p.IsError {
				text = "ERROR: " + text
			}
			out = append(out, chatMessage{Role: "tool", ToolCallID: p.ID, Content: text})
		case llm.Text:
			parts = append(parts, contentPart{Type: "text", Text: p.Text})
		case llm.Image:
			mediaType, data, err := images(ctx, p.PhotoID)
			if err != nil {
				return nil, err
			}
			url := "data:" + mediaType + ";base64," + base64.StdEncoding.EncodeToString(data)
			parts = append(parts, contentPart{Type: "image_url", ImageURL: &imageURL{URL: url}})
		}
	}
	if len(parts) > 0 {
		out = append(out, chatMessage{Role: "user", Content: parts})
	}
	return out, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
