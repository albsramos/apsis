// Package demo is a provider that needs no AI. It plays the part of a careful
// model: with fewer than three photos it asks for a side and a back shot, then
// it submits a known-good bedside table. It lets the whole app run, and be
// tested, without a key.
package demo

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"time"

	"offcut/internal/analysis"
	"offcut/internal/llm"
	"offcut/internal/spec"
)

const Name = "demo"

type Provider struct{ Delay time.Duration }

func New() *Provider { return &Provider{Delay: 1500 * time.Millisecond} }

func (p *Provider) Complete(ctx context.Context, req llm.Request) (llm.Message, error) {
	select {
	case <-time.After(p.Delay):
	case <-ctx.Done():
		return llm.Message{}, ctx.Err()
	}
	photos, asked := 0, false
	for _, m := range req.Messages {
		for _, part := range m.Parts {
			if part.Type == llm.Image {
				photos++
			}
			if part.Type == llm.ToolCall && part.Name == analysis.ToolRequestPhotos {
				asked = true
			}
		}
	}
	if photos < 3 && !asked {
		in, _ := json.Marshal(analysis.RequestPhotosInput{Shots: []analysis.Shot{
			{View: "Side, straight on", Reason: "To get the depth and see whether the shelf sits in a groove."},
			{View: "The back", Reason: "To see whether there's a back panel and how it's fixed."},
		}})
		return call(analysis.ToolRequestPhotos, in, "I can see the front, a drawer and a shelf. Two things that change the parts list are hidden."), nil
	}
	in, _ := json.Marshal(spec.Example())
	return call(analysis.ToolSubmitSpec, in, "Here is the spec. I've designed the joinery, since it isn't visible."), nil
}

func call(name string, input []byte, text string) llm.Message {
	id := make([]byte, 8)
	_, _ = rand.Read(id)
	return llm.Message{Role: llm.Assistant, Parts: []llm.Part{
		{Type: llm.Text, Text: text},
		{Type: llm.ToolCall, ID: "demo_" + hex.EncodeToString(id), Name: name, Input: input},
	}}
}
