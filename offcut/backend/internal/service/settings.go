package service

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"slices"
	"strings"
	"time"

	"offcut/internal/llm"
	"offcut/internal/llm/anthropic"
	"offcut/internal/llm/demo"
	"offcut/internal/llm/openai"
	"offcut/internal/spec"
)

type SettingsView struct {
	Provider         string
	Model            string
	BaseURL          string
	HasKey           bool
	StockThicknesses []float64
}

type SettingsInput struct {
	Provider string
	Model    string
	BaseURL  string
	// APIKey: nil keeps the stored key, "" removes it, anything else replaces it.
	APIKey           *string
	StockThicknesses []float64
}

var Providers = []string{anthropic.Name, openai.Name, demo.Name}

func (s *Service) GetSettings(ctx context.Context) (SettingsView, error) {
	st, err := s.repo.GetSettings(ctx)
	if err != nil {
		return SettingsView{}, err
	}
	return SettingsView{
		Provider: st.Provider, Model: st.Model, BaseURL: st.BaseURL,
		HasKey: len(st.APIKeyEnc) > 0, StockThicknesses: st.StockThicknesses,
	}, nil
}

func (s *Service) UpdateSettings(ctx context.Context, in SettingsInput) (SettingsView, error) {
	st, err := s.repo.GetSettings(ctx)
	if err != nil {
		return SettingsView{}, err
	}
	if !slices.Contains(Providers, in.Provider) {
		return SettingsView{}, Invalid("Choose anthropic, openai or demo.")
	}
	if in.Provider == openai.Name && strings.TrimSpace(in.Model) == "" {
		return SettingsView{}, Invalid("Name the model to use with an OpenAI-compatible provider.")
	}
	st.Provider, st.Model, st.BaseURL = in.Provider, strings.TrimSpace(in.Model), strings.TrimSpace(in.BaseURL)
	if in.APIKey != nil {
		if key := strings.TrimSpace(*in.APIKey); key == "" {
			st.APIKeyEnc = nil
		} else {
			if st.APIKeyEnc, err = s.sealer.Seal(key); err != nil {
				return SettingsView{}, err
			}
		}
	}
	if len(in.StockThicknesses) > 0 {
		for _, t := range in.StockThicknesses {
			if t <= 0 || t > 200 {
				return SettingsView{}, Invalid("Stock thicknesses must be between 0 and 200 mm.")
			}
		}
		st.StockThicknesses = slices.Sorted(slices.Values(in.StockThicknesses))
	}
	if err := s.repo.SaveSettings(ctx, st); err != nil {
		return SettingsView{}, err
	}
	return s.GetSettings(ctx)
}

func (s *Service) activeProvider(ctx context.Context) (llm.Provider, []float64, error) {
	st, err := s.repo.GetSettings(ctx)
	if err != nil {
		return nil, nil, err
	}
	cfg := llm.Config{Provider: st.Provider, Model: st.Model, BaseURL: st.BaseURL}
	if len(st.APIKeyEnc) > 0 {
		if cfg.APIKey, err = s.sealer.Open(st.APIKeyEnc); err != nil {
			return nil, nil, err
		}
	}
	p, err := s.providers(cfg)
	stock := st.StockThicknesses
	if len(stock) == 0 {
		stock = spec.DefaultStockThicknesses
	}
	return p, stock, err
}

type TestResult struct {
	OK        bool
	Message   string
	LatencyMS int64
}

// TestConnection sends one small image and asks for its colour, which checks
// the key, the model, and that the model can read images.
func (s *Service) TestConnection(ctx context.Context) TestResult {
	provider, _, err := s.activeProvider(ctx)
	if err != nil {
		return TestResult{Message: err.Error()}
	}
	img := image.NewRGBA(image.Rect(0, 0, 64, 64))
	for i := range img.Pix {
		img.Pix[i] = 255
	}
	for y := 0; y < 64; y++ {
		for x := 0; x < 64; x++ {
			img.Set(x, y, color.RGBA{R: 200, G: 30, B: 30, A: 255})
		}
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	start := time.Now()
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	reply, err := provider.Complete(ctx, llm.Request{
		System: "You are checking a connection. Answer in one word.",
		Messages: []llm.Message{{Role: llm.User, Parts: []llm.Part{
			{Type: llm.Image, PhotoID: "test"},
			{Type: llm.Text, Text: "What colour is this image?"},
		}}},
		Images: func(context.Context, string) (string, []byte, error) { return "image/png", buf.Bytes(), nil },
	})
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return TestResult{Message: err.Error(), LatencyMS: latency}
	}
	answer := strings.ToLower(reply.Text())
	if _, isDemo := provider.(*demo.Provider); isDemo {
		return TestResult{OK: true, Message: "Demo mode: no AI is called. It asks for two photos, then returns a sample bedside table.", LatencyMS: latency}
	}
	if !strings.Contains(answer, "red") {
		return TestResult{Message: "Connected, but the model didn't read the test image correctly. It needs to accept images.", LatencyMS: latency}
	}
	return TestResult{OK: true, Message: "Connected. The model reads images.", LatencyMS: latency}
}
