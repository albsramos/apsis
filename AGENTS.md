# Apsis: rules for working in this repo

Apsis is mission control for Kestrel Orbital (fictional), which runs data centers in orbit. One 3D scene on the
right, one information sheet on the left, one selection at a time. These rules apply to every change, whoever
makes it. They follow Whetstone's conventions, plus a few for the 3D scene.

## Stack

React 19 · TypeScript (strict) · Vite · CSS Modules · React Router · three.js via @react-three/fiber + drei ·
@react-three/postprocessing · zustand · Radix primitives + cmdk. No Tailwind: the UI is shadcn-style (Radix behaviour,
source we own) styled with CSS Modules on Whetstone's tokens.

## File layout

```
src/
  app/             Router (/ and /cluster/:id; the URL is the selection)
  components/
    ui/            Design-system primitives (Button, Badge, ToggleGroup, Slider, StatTile, Sparkline…)
    layout/        App chrome (AppShell, TopBar, Timeline, SidePanel, CommandPalette)
    sheet/         Left-sheet content (FleetSheet, ClusterSheet and their sections)
    scene/         Everything inside the <Canvas> (Earth, OrbitRing, ClusterMarker, ClusterModel, CameraRig…)
  sim/             The simulation: orbits, thermal model, faults. Pure TS, no React, no three.js. Runs in a worker.
  store/           zustand store, the sim clock, the worker bridge
  lib/             Hooks and helpers with no UI (format, heat ramp, palette, textures, hotkeys)
  styles/          tokens.css and global.css only
public/textures/   Earth maps, bundled (nothing is fetched from another origin)
scripts/           sim-check.ts (npm run sim:check)
```

## Always

1. **One folder per component**, named after it in PascalCase, with the component, its `*.module.css` and an
   `index.ts` barrel. Helpers used only by that component (shaders, layout maths) live in the same folder.
2. **Import through the folder**, never the file: `import { Badge } from '@/components/ui/Badge'`.
3. **Use the `@/` alias** for anything outside the current folder. No `../../`.
4. **Use named exports.**
5. **Only design tokens** for colour, spacing, radius and type; no raw hex in CSS, no inline styles unless dynamic.
   The scene reads the same tokens through `lib/palette.ts`; add a token rather than a hex in a component.
6. **Every layout must work at 390px wide.** The sheet becomes a bottom drawer below 760px.
7. **Nothing fetched from another origin at runtime.** Textures, fonts and icons are bundled.

## Scene rules

1. **No per-frame React state.** Read `clock.view()` and `useApsis.getState()` inside `useFrame`; React state changes
   only on input or the 4 Hz telemetry tick.
2. **Every selection goes through the URL** (`actions.select(id)`), and the camera only moves in `CameraRig`.
3. **Lenses are material parameters**, lerped per frame, never separate meshes.
4. **Physics first.** A new fault comes from the model in `sim/cluster.ts` and is described in `sim/faults.ts`; the UI
   never invents state. Keep `npm run sim:check` green, and add a check for any new story the UI relies on.

## Before committing

```bash
npm run build      # typecheck and production build
npm run sim:check  # the simulation still tells the stories the UI relies on
npm run dev        # then select a cluster and switch lenses: dev runs StrictMode
```
