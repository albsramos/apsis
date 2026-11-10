# Linewatch

A front-end proof of concept: see every carrier on a factory line from your desk. One map of the line, one
sheet beside it, one selection at a time. It runs entirely on mock data; there is no backend yet.

It lives in the Apsis repository as a self-contained app and follows the same conventions (see `../AGENTS.md`):
React 19, TypeScript (strict), Vite, CSS Modules on design tokens, and shadcn-style components (Radix behaviour,
source we own in `src/components/ui`).

```bash
cd linewatch
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck and production build
npm run api:sync   # regenerate the API hooks from the contract
```

## What is in it

- **Two factories with different layouts** (Austin: a serpentine with a bypass and a feeder; Shanghai: a ring with a
  cross). Nothing in the UI knows either shape: the map is drawn from the layout the API returns.
- **Three lenses** on the same map: Status, Payload, Dwell (time on a stretch against normal).
- **A sheet** that shows the factory (headline numbers, issues ranked by impact, slow stretches) or the selected
  carrier (where it is, its faults, its payload, its trail).
- **The URL is the selection**: `/us-austin/carrier/C-0178?lens=dwell` opens exactly that view.
- **Search** (`⌘K` / `Ctrl K`) by carrier ID, payload serial or issue.
- Light and dark themes; the sheet moves under the map below 760px.

## How the API layer is set up (Orval)

```
api/openapi.yaml        The contract. For now, written by hand in this repo.
orval.config.ts         Turns the contract into typed React Query hooks.
src/api/generated/      Generated. Never edit; run `npm run api:sync`.
src/api/http.ts         The one function every hook calls (Orval's "mutator").
src/mocks/              The stand-in backend: two layouts and a line simulation.
```

Components only ever call generated hooks (`useListCarriers`, `useGetLayout`, …) and use generated types.
`http.ts` decides where a request goes: while `VITE_API_MOCK` is not `false`, it is answered in the browser by
`src/mocks`, whose return values are typed by the same generated models, so the mock cannot drift from the contract.

### When the backend exists

1. Point Orval at its Swagger document: `LINEWATCH_SWAGGER=https://…/swagger.json npm run api:sync`
   (or change `input.target` in `orval.config.ts`).
2. Fix whatever the compiler flags: a renamed field shows up as a type error where it is used.
3. Run with `VITE_API_MOCK=false` and uncomment the `/api` proxy in `vite.config.ts`.
4. Delete `src/mocks` once nothing needs it, or keep it for demos and tests.

Positions are polled once a second (`src/lib/live.ts`) and carriers glide between reports. If the backend offers a
push channel (SSE or WebSocket), write its messages into the same React Query cache keys and drop the intervals;
Orval does not generate that part.

## Layouts are data

A factory's layout is a document (`Layout` in the contract): nodes (stations, buffers, junctions, entries, exits)
and the segments joining them, each with its polyline. A carrier's position is a segment and a fraction along it.
Adding a factory to the mock is one file in `src/mocks/layouts/` and one line in `src/mocks/server.ts`.

## Not in this POC

A layout editor, the shift timeline with replay, map pan and zoom, and anything that writes (holding a payload,
acknowledging a fault).
