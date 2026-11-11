# Offcut: rules for working in this repo

Offcut turns photos of a piece of furniture into a build plan: engineering drawings, a cut list and flat-pack-style
assembly steps. These rules apply to every change, whoever makes it.

## The one rule

**The model never draws.** It writes a spec (`backend/internal/spec`): every part an axis-aligned board with a position
and size in millimetres, plus joints, hardware and steps. Go validates it; TypeScript draws it. If a drawing is wrong,
fix the geometry or the spec. Never ask the model for pictures or screen coordinates.

## Layout

```
backend/                  Go: handler → service → repository
  cmd/server/             entry point, swag @title annotations
  internal/spec/          the spec types, the validator, the example bedside table
  internal/analysis/      the system prompt and the three tools the model may call
  internal/llm/           the provider port; adapters: anthropic (official SDK), openai (compatible APIs), demo
  internal/service/       the application: projects, photos, specs, settings, the analysis loop
  internal/repository/    Postgres (pgx); migrations in backend/migrations
  internal/handler/       HTTP + swag annotations; DTOs named with //@name for the generated TypeScript
  docs/                   generated swagger.json (committed)
frontend/                 Vite + React + TypeScript + CSS Modules
  src/api/                orval output (generated/, committed) and the fetcher; import from '@/api'
  src/components/ui/      the component library: Radix behind our own props. The only place Radix is imported.
  src/components/drawing/ SVG renderers (orthographic, isometric, part)
  src/lib/drawing/        pure geometry: labels, cut list, projections, paint order, step scenes. No React.
  src/pages/              one folder per route
```

## Always

1. **Change the API in Go, then `make api`.** Swag reads the handler annotations, orval writes the hooks. Never edit
   `frontend/src/api/generated` or `backend/docs` by hand.
2. **Every new way the model can get a spec wrong gets a validator check and a test** in `spec/validate_test.go`. Its
   message names the parts exactly, because the model reads it to repair the spec.
3. **The app imports UI from `@/components/ui` only** (lint enforces it), so the library behind it can change.
4. **One folder per component**, with its `*.module.css` and an `index.ts` barrel. Import through the folder, use the
   `@/` alias outside it, and use named exports.
5. **Only design tokens** (`src/styles/tokens.css`) for colour, space, radius and type. Drawings use them through CSS
   classes.
6. **Every screen works at 390 px wide.** Side panels become bottom sheets below 760 px.
7. **Fixings are worked out, never drawn by hand or asked of the model.** `spec/fixings.go` places every screw, nail
   and dowel and its holes; the API returns them with each spec, and the drawings only draw them. A physical rule about
   fixings goes in the validator with a test. `frontend/src/standalone` copies the validator and fixings for the
   serverless build: change both together.
8. **The conversation is provider-neutral and append-only.** The service stores `llm.Message`s; adapters translate. A
   provider's thinking blocks go back unchanged to that provider and are dropped for the others.

## Before committing

```bash
make check     # swagger and hooks regenerate cleanly, tests, vet, gofmt, lint, build
```
