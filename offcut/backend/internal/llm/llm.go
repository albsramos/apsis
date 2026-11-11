// Package llm is the port to whichever AI the user chooses. The conversation
// is kept in a provider-neutral form (Message, Part) and stored that way, so a
// user can switch providers in the middle of a project. Each adapter
// translates it to its own wire format.
package llm

import (
	"context"
	"encoding/json"
	"errors"
)

type Role string

const (
	User      Role = "user"
	Assistant Role = "assistant"
)

type PartType string

const (
	Text       PartType = "text"
	Image      PartType = "image"
	ToolCall   PartType = "tool_call"
	ToolResult PartType = "tool_result"
	// Thinking is a provider's reasoning block. Only the provider that wrote it
	// can read it back; the others skip it.
	Thinking PartType = "thinking"
)

type Part struct {
	Type PartType `json:"type"`

	Text string `json:"text,omitempty"`

	// Image
	PhotoID string `json:"photoId,omitempty"`

	// ToolCall: ID, Name, Input. ToolResult: ID (of the call), Text, IsError.
	ID      string          `json:"id,omitempty"`
	Name    string          `json:"name,omitempty"`
	Input   json.RawMessage `json:"input,omitempty"`
	IsError bool            `json:"isError,omitempty"`

	// Thinking: the provider that wrote it, and its opaque signature.
	Provider  string `json:"provider,omitempty"`
	Signature string `json:"signature,omitempty"`
}

type Message struct {
	Role  Role   `json:"role"`
	Parts []Part `json:"parts"`
}

func (m Message) ToolCalls() []Part {
	var out []Part
	for _, p := range m.Parts {
		if p.Type == ToolCall {
			out = append(out, p)
		}
	}
	return out
}

func (m Message) Text() string {
	var s string
	for _, p := range m.Parts {
		if p.Type == Text {
			s += p.Text
		}
	}
	return s
}

type Tool struct {
	Name        string
	Description string
	Schema      map[string]any
}

// ImageLoader returns a stored photo's bytes. Messages only refer to photos by
// id; the adapter loads them when it builds a request.
type ImageLoader func(ctx context.Context, photoID string) (mediaType string, data []byte, err error)

type Request struct {
	System   string
	Tools    []Tool
	Messages []Message
	Images   ImageLoader
}

type Provider interface {
	// Complete sends the conversation and returns the assistant's next message.
	Complete(ctx context.Context, req Request) (Message, error)
}

// Config is what the user picks in Settings.
type Config struct {
	Provider string `json:"provider"` // anthropic | openai | demo
	Model    string `json:"model"`
	BaseURL  string `json:"baseUrl"`
	APIKey   string `json:"-"`
}

// ErrRefused means the model declined the request. It is not retried.
var ErrRefused = errors.New("the model declined this request")
