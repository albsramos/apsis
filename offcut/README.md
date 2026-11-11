# Offcut

Photograph a piece of furniture; get the plans to build it yourself. Offcut gives you engineering drawings, a cut list
of every board, and step-by-step assembly instructions in the style of a flat-pack manual. It asks for more photos when
it can't see something that matters.

This is a proof of concept, built for simple box furniture: bedside tables, shelves, small cabinets.

## How it works

```
photos + one tape measurement
        │
        ▼
  the AI (your choice) ──── request_photos / ask_user ───▶ the user adds photos or answers
        │
        │ submit_spec: parts, joints, hardware, steps (JSON, mm)
        ▼
  Go validator ─── exact errors ───▶ back to the AI to repair (up to 3 times)
        │
        ▼ a spec that adds up
  TypeScript geometry ──▶ front / side / top views, exploded view, part sheets, cut list, step drawings
```

The model never draws. It describes the piece as axis-aligned boards with positions and sizes in millimetres. The
validator checks that the parts span the overall size exactly, that nothing occupies the same space, that every joint
joins parts that touch, that everything is connected, and that every part is added in exactly one step. Its errors name
the parts, and go back to the model as tool results. All drawings are computed from the spec, so editing a size redraws
everything and re-runs the checks without another AI call.

Photos can't show scale or hidden joinery. One real measurement gives the scale. The model designs a simple, sound
construction (screws, dowels, a nailed-on back) and says so. Every dimension carries a confidence: *measured*, *read
from the photos* or *assumed*. The assumed ones are flagged to check with a tape before cutting.

The prompt and tools are in `backend/internal/analysis`, and the loop is in `backend/internal/service/analysis.go`.

## Choosing the AI

In Settings:

- **Anthropic.** Claude through the official Go SDK. The default model is `claude-opus-5-5`, with streaming, high
  effort and server-side refusal fallback.
- **OpenAI-compatible.** Any chat-completions API with vision and tool calls: OpenAI, OpenRouter, Ollama, LM Studio,
  or Gemini through Google's OpenAI-compatible endpoint.
- **Demo.** No AI. It asks for a side and a back photo, then returns a sample bedside table. Use it to try the app,
  or to develop the UI, without a key.

Keys are encrypted at rest with `APP_SECRET` and never sent to the browser. The conversation is stored in a
provider-neutral form, so you can switch providers partway through a project.

## Running it

You need Go 1.25+, Node 22+ and Postgres 16.

```bash
docker compose up -d                       # Postgres (or use your own and set DATABASE_URL)
cp backend/.env.example backend/.env       # set APP_SECRET
(cd backend && set -a && . ./.env && set +a && go run ./cmd/server)
(cd frontend && npm install && npm run dev) # http://localhost:5173
```

The app starts in demo mode. Choose a provider and add a key in Settings.

## Stack

- **Backend:** Go, layered handler → service → repository; Postgres via pgx; swag annotations for OpenAPI.
- **Frontend:** Vite, React 19, TypeScript, CSS Modules, React Router, TanStack Query.
- **Contract:** `make api` runs swag over the handlers, then orval writes typed React Query hooks into
  `frontend/src/api/generated`.
- **UI:** a shadcn-style library in `src/components/ui`. It puts Radix behaviour behind our own props, and the app
  imports only from there (lint enforces it), so Radix can be replaced without touching the app.

## Tests

```bash
make test    # validator cases, the analysis loop with a scripted model, drawing geometry
make check   # also regenerates the API and fails if it drifted, plus vet, gofmt, lint and build
```

## Not yet

- Curved, turned or upholstered parts. They are modelled as boards and listed as simplifications.
- Dimensions that follow an edit: changing a side's thickness doesn't shorten the shelf yet. The checks show what no
  longer fits.
- Hole and screw positions on the part sheets, and drawings to a printable scale.
- Accounts. It's single-user and self-hosted for now.
- Live progress over SSE; the UI polls once a second during an analysis.
