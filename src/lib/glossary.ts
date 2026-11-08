import { SIM } from '@/sim/fleet'
import { LIMITS } from '@/sim/faults'
import { DESIGN_DT, HEATER_SET, OVERHEAD, THROTTLE_AT, THROTTLE_RELEASE } from '@/sim/cluster'
import { MODULE_SCALE } from '@/lib/heat'

/**
 * What every number, chart and section on screen measures. One entry per thing, written from the
 * simulation itself (thresholds are imported, not retyped), so the explanation and the model agree.
 *
 * - `what`: one sentence, shown inline in Explain mode and first in the popover.
 * - `how`: where the number comes from in the model.
 * - `read`: how to read it, and the thresholds that turn it yellow or red.
 */
export interface GlossaryEntry {
  title: string
  what: string
  how?: string
  read?: string
}

const L = SIM.moduleLimitC
const pct = (x: number) => `${Math.round(x * 100)}%`

export const GLOSSARY = {
  // ── The data ──────────────────────────────────────────────────────────
  data: {
    title: 'Where the data comes from',
    what: 'Every number is simulated. Seven fictional clusters run through a deterministic physics model in the browser; nothing is real telemetry.',
    how: 'A worker steps each cluster every 10 sim-seconds (orbit, eclipse, workload, heat flow, power, radiation) and keeps a sample every 30 s, 8 hours deep. The UI reads those samples 4 times a second.',
    read: 'Because it is deterministic, the same moment always shows the same values, and every fault has a physical cause.',
  },

  // ── Fleet sheet ───────────────────────────────────────────────────────
  statusCounts: {
    title: 'Cluster status',
    what: 'How many clusters are critical (red), degraded (yellow) and nominal (green) right now.',
    how: 'A cluster is critical if it has any critical fault, degraded if it has any warning, nominal otherwise. Notices never change status.',
  },
  fleetOutput: {
    title: 'Fleet output',
    what: 'Total compute throughput of all seven clusters right now, in FP8 petaflops (PF; 1 EF = 1,000 PF).',
    how: 'The sum of each cluster’s output. A cluster’s output is its IT power (kW) × its efficiency (PF per kW, set by role).',
    read: 'The sparkline is the last hour of that sum. It auto-scales to the hour’s own minimum and maximum, so small wiggles look large; read the range under it.',
  },
  fleetPower: {
    title: 'Power draw',
    what: 'Electrical power all clusters are consuming right now; the line below is what their solar wings are generating.',
    how: `Draw = IT load + avionics and comms (${pct(OVERHEAD)} of capacity) + heaters, summed over the fleet. Generation is zero for any cluster in Earth’s shadow.`,
    read: 'Generation above draw means batteries are charging overall; below, the fleet is running down its batteries.',
  },
  activeFaults: {
    title: 'Active faults',
    what: 'Number of warnings and critical faults across the fleet. Notices (blue, informational) are not counted.',
    read: 'The line below is the most urgent one: the worst fault on the cluster at the top of the list.',
  },
  inShadow: {
    title: 'In shadow',
    what: 'How many clusters are in Earth’s shadow (eclipse) at this moment.',
    read: 'In shadow a cluster generates no solar power, runs on battery, defers 15% of its batch work, and its coolant cools; heaters stop it freezing.',
  },
  clusterList: {
    title: 'Clusters',
    what: 'Every cluster, the ones that need attention first. The number on the right changes with the lens.',
    how: 'Sorted by status, then by worst fault, then by hottest module.',
    read: 'Output lens: current output, bar = utilisation (0–100%). Thermal lens: hottest module, bar from 10°C to the 45°C limit. Faults lens: the worst fault.',
  },

  // ── Cluster header ────────────────────────────────────────────────────
  clusterStatus: {
    title: 'Status',
    what: 'Nominal, degraded or critical: the worst fault this cluster has right now.',
    how: 'Critical if any fault is critical, degraded if any is a warning, nominal otherwise.',
  },
  sunlit: {
    title: 'Sunlit / In shadow',
    what: 'Whether the cluster is in sunlight or in Earth’s shadow at this moment.',
    how: 'Computed from the cluster’s position and the Sun direction, treating Earth’s shadow as a cylinder.',
  },

  // ── Vitals ────────────────────────────────────────────────────────────
  output: {
    title: 'Output',
    what: 'Compute throughput right now, in FP8 petaflops (PF): how much useful work the cluster is doing.',
    how: 'IT power (kW) × efficiency (PF per kW: 2.6 training, 2.4 inference, 2.2 rendering, 0.6 storage). 3% lower inside the South Atlantic Anomaly, where error correction costs work.',
    read: `Turns red when the scheduler is thermally throttling (throttle under ${pct(LIMITS.throttled)}); the hint shows by how much. Sparkline: last hour.`,
  },
  utilisation: {
    title: 'Utilisation',
    what: 'Share of the cluster’s IT capacity in use right now: IT power ÷ capacity.',
    how: 'The scheduler aims for a base load per cluster, swelling over a 5.3-hour cycle and a 37-minute job cycle. It sheds 15% in shadow, 6% in the SAA, 20% if the battery is under 25%, and the thermal throttle cuts on top of that.',
    read: 'The hint is the same thing in kW. Sparkline: last hour.',
  },
  powerMargin: {
    title: 'Power margin',
    what: 'Solar power generated minus power drawn, right now. Positive charges the battery; negative drains it.',
    how: `Generated = wing capacity × how squarely the wings face the Sun (0 in shadow). Drawn = IT load + avionics and comms (${pct(OVERHEAD)} of capacity) + heaters.`,
    read: `The hint is the battery’s state of charge. Yellow when the battery is under ${pct(LIMITS.batteryWarn)}. Sparkline: last hour, so eclipses show as deep dips.`,
  },
  thermalMargin: {
    title: 'Thermal margin',
    what: `Headroom: how many °C the hottest compute module is below its ${L}°C limit.`,
    how: `${L}°C − the hottest of the six module temperatures.`,
    read: `Yellow under ${LIMITS.marginWarn}°C, red under ${LIMITS.marginCritical}°C. At ${THROTTLE_AT}°C the scheduler starts throttling output to protect the hardware, and releases at ${THROTTLE_RELEASE}°C. Sparkline: last hour; a falling line is a shrinking margin.`,
  },
  sparkline: {
    title: 'Sparklines',
    what: 'The last hour of the number above it, oldest on the left, now on the right.',
    read: 'Each sparkline is scaled to its own minimum and maximum over that hour, shown in the middle underneath. A flat-looking line can still be a big change, and a wild one a tiny change.',
  },

  // ── Faults ────────────────────────────────────────────────────────────
  faults: {
    title: 'Faults',
    what: 'Everything wrong with this cluster now, worst first, with the recommended action. Click one to fly the camera to the part.',
    how: 'Faults are derived from the physics at every step, never scripted: the same state always gives the same list. The age is how long the fault has been continuously active.',
    read: 'Critical (red): act now; it is costing output or risking hardware. Warning (yellow): degrading, plan a fix. Notice (blue): expected behaviour worth knowing about.',
  },

  // ── Thermal regulation ────────────────────────────────────────────────
  thermal: {
    title: 'Thermal regulation',
    what: 'Whether the cluster is getting rid of its heat. In space, radiators are the only way out.',
    how: 'Compute modules heat the coolant loop; the loop carries heat to the radiators, which radiate it to space. Sunlight and Earth’s infrared add heat; heaters add heat when the loop runs cold.',
  },
  thermalChart: {
    title: 'Temperature chart',
    what: 'Temperatures over the last three orbits (at most 6 hours), oldest on the left, now on the right.',
    read: `Solid line: the hottest compute module. Dashed blue: the coolant loop. Dashed red: the ${L}°C module limit. Grey bands: time in Earth’s shadow. The loop dips in every eclipse; a gap growing between the two lines means the pump is weakening.`,
  },
  hottestModule: {
    title: 'Hottest module',
    what: 'The temperature of whichever of the six compute modules is hottest at each moment.',
    read: `This is the line that matters for the limit: thermal margin is ${L}°C minus this.`,
  },
  loopTemp: {
    title: 'Coolant loop',
    what: 'The temperature of the liquid coolant that carries heat from the modules to the radiators.',
    how: `At full flow the modules sit about ${DESIGN_DT}°C above the loop at full load. Heaters switch on below ${HEATER_SET}°C.`,
    read: 'It falls in Earth’s shadow (no sunlight on the radiators, less work) and rises in sunlight.',
  },
  moduleLimit: {
    title: 'Module limit',
    what: `The ${L}°C temperature compute modules are designed to stay under.`,
    read: `The scheduler throttles work when the hottest module comes within ${THROTTLE_AT}°C of it.`,
  },
  eclipseBand: {
    title: 'Eclipse',
    what: 'Time the cluster spent in Earth’s shadow: no solar power, battery only, radiators see no sunlight.',
  },
  pumpFlow: {
    title: 'Pump flow',
    what: 'Coolant flow as a share of its design value.',
    how: 'Lower flow carries heat away from the modules more slowly, so they run hotter above the loop.',
    read: `Warning under ${pct(LIMITS.pumpWarn)}, critical under ${pct(LIMITS.pumpCritical)}.`,
  },
  heaters: {
    title: 'Heaters',
    what: 'Electric heater power keeping the coolant from getting too cold, and its share of the heaters’ maximum.',
    how: `Heaters ramp up as the loop falls below ${HEATER_SET}°C and reach full power 5°C below that.`,
    read: `A notice above ${pct(LIMITS.heaterNotice)} of maximum. Normal for lightly loaded clusters in shadow.`,
  },
  betaAngle: {
    title: 'Beta angle',
    what: 'The angle between the orbit’s plane and the direction of the Sun.',
    read: 'Near 0° the orbit passes straight behind Earth and spends the most time in shadow. Near ±90° (dawn-dusk orbits) it rides the day–night line and never enters shadow.',
  },
  radiation: {
    title: 'Radiation',
    what: 'Single-event upsets (SEU) a minute: bits in memory or logic flipped by charged particles, all corrected by ECC.',
    how: 'About 0.2 a minute normally, about 7.5 a minute inside the South Atlantic Anomaly (SAA). Smoothed over roughly 90 seconds.',
    read: '“SAA” appears while the cluster is crossing it. Upsets there are expected; they cost 3% of output and pause batch jobs.',
  },
  battery: {
    title: 'Battery',
    what: 'Battery state of charge.',
    how: 'Charges with any positive power margin and drains with a negative one; it carries the cluster through each eclipse.',
    read: `Warning under ${pct(LIMITS.batteryWarn)}. Under 25% the scheduler sheds 20% of its work.`,
  },

  // ── Parts ─────────────────────────────────────────────────────────────
  parts: {
    title: 'Parts',
    what: 'Every compute module and radiator segment with its own temperature, coloured on the same scale as the 3D model. Click one to look at it.',
    read: 'A dashed yellow outline marks a part with a warning or critical fault: a hot module, a dead radiator segment.',
  },
  modules: {
    title: 'Compute modules',
    what: 'The six racks of processors (M1–M6) that do the work, each with its current temperature.',
    read: `Colour: blue is healthy (under ${MODULE_SCALE[2]}°C), yellow ${LIMITS.marginWarn}°C under the ${L}°C limit, red ${LIMITS.marginCritical}°C under it.`,
  },
  segments: {
    title: 'Radiator segments',
    what: 'Two radiators of four segments each (R1·S1 … R2·S4), in coolant order: hot inlet first, cold outlet last.',
    how: 'Each live segment sits at the loop temperature plus a gradient; the gradient steepens when flow is weak.',
    read: '“dry” means the segment has no coolant (punctured and isolated), so it cools towards the cold of space and sheds no heat.',
  },

  // ── Orbit ─────────────────────────────────────────────────────────────
  orbit: {
    title: 'Orbit',
    what: 'Where the cluster is and what happens next: shadow, the radiation zone, the next ground station.',
    how: 'Circular orbits propagated from altitude, inclination and the orbit’s orientation. Upcoming events are found by stepping the orbit forward.',
  },
  inclination: {
    title: 'Inclination',
    what: 'The tilt of the orbit against the equator. 0° circles the equator, 90° passes over the poles, above 90° goes slightly backwards (sun-synchronous).',
  },
  period: { title: 'Period', what: 'Time for one full orbit of the Earth.' },
  velocity: { title: 'Velocity', what: 'Orbital speed relative to Earth’s centre.' },
  subPoint: { title: 'Sub-point', what: 'The point on Earth’s surface directly below the cluster, as latitude and longitude.' },
  shadowNext: {
    title: 'Shadow',
    what: 'Time until the cluster enters (or leaves) Earth’s shadow. “Not this orbit” means it stays in sunlight.',
  },
  saaNext: {
    title: 'South Atlantic Anomaly',
    what: 'Time until the next crossing of the SAA (or until it leaves it), the region over South America and the South Atlantic where Earth’s radiation belt dips closest.',
  },
  groundContact: {
    title: 'Ground contact',
    what: 'The ground station the cluster can talk to now, or the next one it will pass over, within the next 6 hours.',
    how: 'A station is in contact when the cluster is at least 10° above its horizon.',
  },

  // ── Timeline and scene ────────────────────────────────────────────────
  timeline: {
    title: 'Timeline',
    what: 'Sim time. Live by default and sped up (×60: an orbit takes about 95 seconds); drag back up to 4 hours to replay.',
    read: 'With a cluster selected, grey stretches on the track are its time in Earth’s shadow and blue ones its SAA crossings. Every number on screen follows the time shown here.',
  },
} satisfies Record<string, GlossaryEntry>

export type GlossaryKey = keyof typeof GLOSSARY
