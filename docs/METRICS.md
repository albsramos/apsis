# What Apsis measures

A presenter's reference: every section, number and chart on screen, what it measures, where it comes from and how
to read it. The in-app version (the **Explain** button, `?`, and every ⓘ) is generated from `src/lib/glossary.ts`;
keep the two in step when the model changes.

## First: the data is simulated

Nothing in Apsis is real telemetry. Seven fictional clusters run through a deterministic physics model in a web
worker (`src/sim/`). It steps each cluster every 10 sim-seconds and keeps a sample every 30 s, 8 hours deep; the UI
reads it 4 times a second. Because it is deterministic, the same moment always shows the same values, and every
fault has a physical cause in the model rather than a script.

Sim time runs **×60** by default, so a 95-minute low orbit passes in about 95 seconds. Everything on screen follows
the time on the timeline; drag it back up to 4 hours to replay.

## The model in one picture

```
compute modules ──heat, via coolant flow──▶ coolant loop ──radiated──▶ space
      ▲                                       ▲      ▲
   IT load (the work)                     heaters   sunlight + Earth IR on the radiators

solar wings ──▶ power ──▶ IT load + 7% avionics/comms + heaters        battery covers the gap
```

- **Eclipse** (Earth's shadow): no solar power, so the battery carries the cluster; no sunlight on the radiators, so
  the coolant cools; the scheduler defers 15% of its batch work.
- **South Atlantic Anomaly (SAA)**: the region over South America and the South Atlantic where Earth's radiation
  belt dips closest. Radiation upsets jump ~40×; output drops 3% and batch work pauses 6%.
- **Thermal throttle**: if the hottest module gets within 1.2°C of its 45°C limit, the scheduler cuts work until it is
  4°C under again.

## The three lenses

The lens (top bar, keys `1 2 3`) changes the colours in the 3D scene and the right-hand column of the cluster list.
A legend in the top-right corner of the scene says what the colours mean.

| Lens | Fleet view (rings and markers) | Cluster view (the 3D model) | Cluster list, right column |
|---|---|---|---|
| **Output** | Brightness = utilisation | Modules glow with their load, wings with power generated, beam = data downlink | Output (PF), bar = utilisation |
| **Thermal** | Heat colour of the hottest module | Each module and radiator segment in its own heat colour; coolant flows along the pipes | Hottest module °C, bar from 10°C to the 45°C limit |
| **Faults** | Red critical, yellow degraded, grey nominal | Faulted parts drawn solid and pulsing | The worst fault |

**Heat colours.** Compute modules: dark blue 8°C → blue 24°C → pale 38°C → yellow 39.5°C → red 42.5°C. Radiators use
their own scale, −60°C → 80°C, because "normal" is very different for them.

## Fleet sheet (nothing selected)

| On screen | What it measures | How it's computed | How to read it |
|---|---|---|---|
| **Status dots** (top right) | Clusters critical / degraded / nominal | Critical if any critical fault, degraded if any warning; notices don't count | |
| **Fleet output** | Total compute throughput now, FP8 petaflops (1 EF = 1,000 PF) | Sum of each cluster's output | Sparkline = last hour of the sum, auto-scaled; the range is under it |
| **Power draw** | Electricity the fleet is using now; hint = solar generation | IT load + 7% of capacity (avionics, comms) + heaters, summed | Generation above draw: batteries charging overall |
| **Active faults** | Warnings + critical faults across the fleet | Notices are not counted | Hint = the most urgent fault |
| **In shadow** | Clusters in Earth's shadow now | | Those are on battery |
| **Clusters list** | Every cluster, attention first | Sorted by status, then worst fault, then hottest module | The right column depends on the lens (table above) |

## Cluster sheet (a cluster selected)

### Header

- **Status badge**: the worst fault this cluster has now (nominal / degraded / critical).
- **Role, orbit**: what it's for (training, inference, rendering, cold storage) and its orbit class and altitude.
- **Sunlit / In shadow**: whether it's in Earth's shadow now (cylindrical-shadow model).

### Vitals: the four numbers that answer "is it OK?"

Each has a **sparkline of the last hour**, oldest left, now right. Sparklines auto-scale to their own min and max,
printed between "−1h" and "now", so a flat-looking line can still be a big change. Read the range before you read the
shape.

| Tile | What it measures | How it's computed | Thresholds |
|---|---|---|---|
| **Output** | Compute throughput, FP8 petaflops | IT power (kW) × efficiency (PF per kW: 2.6 training, 2.4 inference, 2.2 rendering, 0.6 storage); −3% in the SAA | Red while thermally throttled (throttle < 97%); hint shows by how much |
| **Utilisation** | Share of IT capacity in use | IT power ÷ capacity. Scheduler target: base load + 5.3-hour swell + 37-minute job cycle; −15% in shadow, −6% in SAA, −20% if battery < 25%; throttle on top | Hint: same in kW |
| **Power margin** | Generated − drawn, now | Generated = wing capacity × how squarely the wings face the Sun (0 in shadow). Drawn = IT + 7% of capacity + heaters | Positive charges the battery, negative drains it. Yellow when battery < 30%. Eclipses show as deep dips |
| **Thermal margin** | °C between the hottest module and the 45°C limit | 45 − max of the six module temperatures | Yellow < 6°C, red < 2.5°C; throttling starts at 1.2°C |

### Faults

Everything wrong now, worst first, each with a recommended action. Click one to fly the camera to the part. Derived
from the physics every step; the age is how long it has been continuously active.

| Severity | Meaning |
|---|---|
| **Critical** (red) | Act now: costing output or risking hardware |
| **Warning** (yellow) | Degrading: plan a fix |
| **Notice** (blue) | Expected behaviour worth knowing about; never changes status |

| Fault | Raised when |
|---|---|
| Coolant pump degrading | Flow < 88% (warning), < 66% (critical) |
| Thermal throttling | Throttle < 97% (critical) |
| Module running hot | Module within 6°C of the limit (warning), 2.5°C (critical) |
| Radiator segment has no flow | Segment punctured (warning) |
| Solar wing drive stalled | Wing > 12° off the Sun (notice), > 60° (warning) |
| Radiation upsets | In the SAA and > 1.2 upsets a minute (notice) |
| Heaters holding the loop | Heaters > 20% of maximum (notice) |
| Battery low | Charge < 30% (warning) |

### Thermal regulation

**The chart** shows the last three orbits (at most 6 hours; the slow MEO cluster KO-7 is cut at 6 h), oldest left,
now right, in °C.

| Line | What it is |
|---|---|
| Solid blue | The **hottest module** at each moment; thermal margin is 45 minus this |
| Dashed blue | The **coolant loop**: the liquid carrying heat from the modules to the radiators |
| Dashed red | The **45°C module limit** |
| Grey bands | Time in **Earth's shadow** |

How to read it: the loop dips in every eclipse and recovers in sunlight. The gap between the two lines is the
module-to-loop temperature difference; at full flow it is about 17°C at full load. **A widening gap means the pump is
weakening** (that's KO-5's story).

**The stats under it**

| Stat | What it measures | Notes |
|---|---|---|
| Coolant loop | Coolant temperature now | Heaters switch on below 4°C |
| Pump flow | Coolant flow, share of design | Yellow < 88% |
| Heaters | Heater power and share of maximum | Ramp up below 4°C, full power at −1°C; normal for light clusters in shadow |
| Beta angle | Angle between the orbit plane and the Sun | Near 0°: longest eclipses. Near ±90° (dawn-dusk): never in shadow |
| Radiation | Single-event upsets a minute (bit flips, all corrected by ECC), smoothed over ~90 s | ~0.2/min normally, ~7.5/min in the SAA; "SAA" shows while crossing |
| Battery | State of charge | Yellow < 30%; under 25% the scheduler sheds 20% |

### Parts

Each compute module (M1–M6, the racks of processors) and radiator segment (two radiators of four: R1·S1 … R2·S4, in
coolant order, hot inlet first) with its own temperature in °C and heat colour. **"dry"** means a segment has no
coolant (punctured and isolated): it cools towards the cold of space and sheds no heat. A dashed yellow outline marks a
part with a warning or critical fault (a hot module, a dead radiator segment). Click to look at it.

### Orbit

| Row | Meaning |
|---|---|
| Inclination | Orbit tilt vs the equator: 0° equatorial, 90° polar, > 90° sun-synchronous |
| Period | One full orbit |
| Velocity | Orbital speed |
| Beta angle | See above; "always sunlit" past ±66° |
| Sub-point | Latitude and longitude directly below |
| Enters / leaves shadow | Time to the next shadow change; "not this orbit" = stays sunlit |
| Next SAA transit / leaves SAA | Time to the next radiation-zone crossing |
| Ground contact | Station in contact now (cluster ≥ 10° above its horizon), or the next one within 6 hours |

### Timeline

Play/pause, speed (×1, ×60, ×600), and a 4-hour scrub track. With a cluster selected, grey stretches on the track
are its eclipses and blue stretches its SAA crossings.

## The fleet

| Cluster | Role | Orbit | IT capacity | PF per kW | Story |
|---|---|---|---|---|---|
| KO-1 Halyard | Training | SSO dawn-dusk, 550 km | 420 kW | 2.6 | Calm control group: never in shadow |
| KO-2 Bowline | Training | SSO dawn-dusk, 610 km | 420 kW | 2.6 | Micrometeoroid punctured radiator R2·S2 2.6 h before "now" |
| KO-3 Sheave | Inference | LEO 53°, 520 km | 360 kW | 2.4 | Cycles through shadow every orbit |
| KO-4 Capstan | Inference | LEO 53°, 580 km | 360 kW | 2.4 | Cycles through shadow every orbit |
| KO-5 Windlass | Inference | LEO 53°, 550 km | 380 kW | 2.4 | Coolant pump wearing out (−3.5% flow an hour) → throttling |
| KO-6 Gimbal | Rendering | Polar, 700 km | 300 kW | 2.2 | Solar wing B stuck at 38° since 4.2 h before "now" |
| KO-7 Deepwell | Cold storage | MEO 30°, 2,000 km | 140 kW | 0.6 | Lightly loaded; runs on heaters in shadow |

## Likely questions

- **Is FP8 petaflops measured?** No. It's IT power × a fixed efficiency per role. It tracks how much of the cluster
  is working, not a benchmark.
- **Why does a sparkline look dramatic when the number barely moved?** Each one scales to its own hour's min and max.
  The range under it is the honest scale.
- **Why is a cluster "degraded" but its numbers look fine?** Status is the worst fault, and faults can be about parts
  (a dead radiator segment, a stalled wing) before they show in the headline numbers.
- **Why does output drop in shadow?** The scheduler deliberately defers batch work to save battery, not because
  anything failed.
