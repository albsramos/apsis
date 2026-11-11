// Package anthropic adapts the llm port to Claude, through the official SDK.
package anthropic

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"

	sdk "github.com/anthropics/anthropic-sdk-go/v2"
	"github.com/anthropics/anthropic-sdk-go/v2/option"

	"offcut/internal/llm"
)

const (
	Name         = "anthropic"
	DefaultModel = "claude-opus-5-5"
)

type Provider struct {
	client sdk.Client
	model  string
}

func New(cfg llm.Config) *Provider {
	var opts []option.RequestOption
	if cfg.APIKey != "" {
		opts = append(opts, option.WithAPIKey(cfg.APIKey))
	}
	if cfg.BaseURL != "" {
		opts = append(opts, option.WithBaseURL(cfg.BaseURL))
	}
	model := cfg.Model
	if model == "" {
		model = DefaultModel
	}
	return &Provider{client: sdk.NewClient(opts...), model: model}
}

func (p *Provider) Complete(ctx context.Context, req llm.Request) (llm.Message, error) {
	messages, err := toMessages(ctx, req)
	if err != nil {
		return llm.Message{}, err
	}
	params := sdk.BetaMessageNewParams{
		Model:     p.model,
		MaxTokens: 64000,
		System:    []sdk.BetaTextBlockParam{{Text: req.System}},
		Messages:  messages,
		Tools:     toTools(req.Tools),
		// Thinking is always on for current Claude models; effort sets its depth.
		// Reading proportions off photos and making the parts add up is worth it.
		OutputConfig: sdk.BetaOutputConfigParam{Effort: sdk.BetaOutputConfigEffortHigh},
		// The photos are resent every turn: cache the prefix.
		CacheControl: sdk.NewBetaCacheControlEphemeralParam(),
		// If a request is declined, the API reruns it on a fallback model.
		Betas:     []sdk.AnthropicBeta{sdk.AnthropicBetaServerSideFallback2026_07_01},
		Fallbacks: sdk.BetaFallbacksParamOfDefault(),
	}

	// A full spec is a long tool input: stream, so the request can't time out.
	stream := p.client.Beta.Messages.NewStreaming(ctx, params)
	var msg sdk.BetaMessage
	for stream.Next() {
		if err := msg.Accumulate(stream.Current()); err != nil {
			return llm.Message{}, fmt.Errorf("anthropic: reading stream: %w", err)
		}
	}
	if err := stream.Err(); err != nil {
		var apiErr *sdk.Error
		if errors.As(err, &apiErr) {
			return llm.Message{}, fmt.Errorf("anthropic: %d: %s", apiErr.StatusCode, apiErr.Error())
		}
		return llm.Message{}, fmt.Errorf("anthropic: %w", err)
	}

	switch msg.StopReason {
	case sdk.BetaStopReasonRefusal:
		return llm.Message{}, llm.ErrRefused
	case sdk.BetaStopReasonMaxTokens:
		return llm.Message{}, errors.New("anthropic: the response hit the output limit before the spec was finished")
	}
	return fromContent(msg.Content), nil
}

func toTools(tools []llm.Tool) []sdk.BetaToolUnionParam {
	out := make([]sdk.BetaToolUnionParam, 0, len(tools))
	for _, t := range tools {
		extra := map[string]any{}
		for k, v := range t.Schema {
			if k != "type" && k != "properties" && k != "required" {
				extra[k] = v
			}
		}
		required, _ := t.Schema["required"].([]string)
		tool := sdk.BetaToolParam{
			Name:        t.Name,
			Description: sdk.String(t.Description),
			InputSchema: sdk.BetaToolInputSchemaParam{
				Properties:  t.Schema["properties"],
				Required:    required,
				ExtraFields: extra,
			},
		}
		out = append(out, sdk.BetaToolUnionParam{OfTool: &tool})
	}
	return out
}

func toMessages(ctx context.Context, req llm.Request) ([]sdk.BetaMessageParam, error) {
	out := make([]sdk.BetaMessageParam, 0, len(req.Messages))
	for _, m := range req.Messages {
		var blocks []sdk.BetaContentBlockParamUnion
		for _, p := range m.Parts {
			switch p.Type {
			case llm.Text:
				blocks = append(blocks, sdk.NewBetaTextBlock(p.Text))
			case llm.Image:
				mediaType, data, err := req.Images(ctx, p.PhotoID)
				if err != nil {
					return nil, err
				}
				blocks = append(blocks, sdk.NewBetaImageBlock(sdk.BetaBase64ImageSourceParam{
					Data:      base64.StdEncoding.EncodeToString(data),
					MediaType: sdk.BetaBase64ImageSourceMediaType(mediaType),
				}))
			case llm.ToolCall:
				blocks = append(blocks, sdk.NewBetaToolUseBlock(p.ID, p.Input, p.Name))
			case llm.ToolResult:
				blocks = append(blocks, sdk.NewBetaToolResultBlock(p.ID, p.Text, p.IsError))
			case llm.Thinking:
				// Pass Claude's own thinking back unchanged; skip anyone else's.
				if p.Provider == Name {
					blocks = append(blocks, sdk.NewBetaThinkingBlock(p.Signature, p.Text))
				}
			}
		}
		if len(blocks) == 0 {
			continue
		}
		if m.Role == llm.User {
			out = append(out, sdk.NewBetaUserMessage(blocks...))
		} else {
			out = append(out, sdk.BetaMessageParam{OfAssistant: &sdk.BetaAssistantMessageParam{Content: blocks}})
		}
	}
	return out, nil
}

func fromContent(content []sdk.BetaContentBlockUnion) llm.Message {
	m := llm.Message{Role: llm.Assistant}
	for _, block := range content {
		switch b := block.AsAny().(type) {
		case sdk.BetaTextBlock:
			m.Parts = append(m.Parts, llm.Part{Type: llm.Text, Text: b.Text})
		case sdk.BetaThinkingBlock:
			m.Parts = append(m.Parts, llm.Part{Type: llm.Thinking, Text: b.Thinking, Signature: b.Signature, Provider: Name})
		case sdk.BetaToolUseBlock:
			m.Parts = append(m.Parts, llm.Part{Type: llm.ToolCall, ID: b.ID, Name: b.Name, Input: json.RawMessage(b.JSON.Input.Raw())})
		}
	}
	return m
}
