# Apsis

Mission control for **Kestrel Orbital**, a (fictional) company that runs data centers in orbit.

Seven compute clusters circle the Earth. Apsis answers the four questions a maintainer has about each one, at a glance:

| Question | Where you see it |
|---|---|
| Is it producing? | **Output** lens · output, utilisation, power margin |
| Is anything breaking? | **Faults** lens · severity-sorted faults, each linked to the part |
| Is it holding temperature? | **Thermal** lens · module and radiator heat, coolant flow, the chart of the last three orbits |
| Where is it? | Orbit rings, ground track, next eclipse, next SAA transit, next ground contact |

Click a cluster (or press ⌘K) and the camera flies in. The cluster's model unfolds, its wings tracking the Sun and its
radiators held edge-on to it. The left sheet then switches to that cluster's details.

## The fleet tells a story

The simulation is deterministic and physics-driven, so what you see has a cause:

- **KO-5 Windlass**: a coolant pump is wearing out. Flow drops, the module-to-loop ΔT widens, the thermal margin
  shrinks, and eventually the scheduler throttles output to stay under the limit. Watch it at ×600.
- **KO-2 Bowline**: a micrometeoroid punctured a radiator segment. In the Thermal lens it is the one cold panel.
- **KO-6 Gimbal**: a solar-wing drive stalled. One wing stops tracking, and power dips once per orbit.
- **KO-1 / KO-2** fly dawn-dusk sun-synchronous orbits and never see eclipse: the calm control group.
- **KO-3, KO-4, KO-5** at 53° cross Earth's shadow every orbit. The loop cools in each eclipse and heaters hold it.
- **KO-7 Deepwell**, lightly loaded cold storage, runs on heaters in shadow.
- Everyone collects radiation upsets over the **South Atlantic Anomaly** (shown on the globe in the Faults lens).

## Keys

`⌘K` search · `1 2 3` lenses · `J / K` next / previous cluster · `F` follow · `Space` play / pause · `Esc` back

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run sim:check  # assert the simulation's stories hold
```

Built with React 19, TypeScript, Vite, CSS Modules, three.js (@react-three/fiber, drei, postprocessing), zustand,
Radix and cmdk. The UI uses Whetstone's design tokens. The globe is drawn as dots from a small land mask
(`public/textures/land_mask_1024.png`, derived from the three.js example Earth maps); altitudes are drawn ×3 so the
orbits read at a glance. Colour is reserved for meaning: red danger, yellow warning, green all good, blue neutral data.
