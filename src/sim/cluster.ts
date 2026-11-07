import { MODULE_COUNT, SEGMENT_COUNT, SIM } from './fleet'
import { isEclipsed, inSaa, subSatellite, sunAngleDeg } from './orbit'
import { deriveFaults, statusOf } from './faults'
import { mulberry32, poisson } from './rng'
import type { ClusterConfig, ClusterSample, Fault } from './types'

/**
 * One cluster's physics, as a lumped thermal model stepped every SIM.dt seconds.
 *
 *   modules ──G·flow──▶ coolant loop ──εσT⁴·A──▶ space
 *      ▲                     ▲   ▲
 *   IT load              heaters  sunlight + Earth IR absorbed by the radiators
 *
 * Eclipse removes the sunlight and makes the scheduler shed batch work, so the loop cools; heaters
 * hold it above freezing. A weak pump widens the module-to-loop ΔT; a punctured radiator segment
 * stops carrying fluid and drifts towards the cold of space.
 */

const SIGMA = 5.670374e-8
const EPS = 0.88
const K = 273.15
const Q_SUN = 120 // W/m² absorbed by radiators in sunlight (edge-on, mostly albedo)
const Q_IR = 70 // W/m² Earth IR, always
const DESIGN_DT = 17 // K, module above loop at full flow
const HEATER_SET = 4 // °C
const OVERHEAD = 0.07 // avionics and comms, share of capacity

interface State {
  util: number
  noise: number
  throttle: number
  loopC: number
  modulesC: number[]
  deadC: number[]
  soc: number
  seuPerMin: number
  seuTotal: number
  since: Map<string, number>
}

export class ClusterSim {
  readonly cfg: ClusterConfig
  private s: State
  private rng: () => number
  private latest: ClusterSample | null = null

  constructor(cfg: ClusterConfig, seed: number) {
    this.cfg = cfg
    this.rng = mulberry32(seed)
    this.s = {
      util: cfg.baseUtil,
      noise: 0,
      throttle: 1,
      loopC: 14,
      modulesC: Array.from({ length: MODULE_COUNT }, () => 30),
      deadC: Array.from({ length: SEGMENT_COUNT }, () => -40),
      soc: 0.85,
      seuPerMin: 0.2,
      seuTotal: 0,
      since: new Map(),
    }
  }

  pumpHealth(t: number) {
    const p = this.cfg.scenario.pump
    if (!p) return 1
    const hours = (t + SIM.historySeconds) / 3600
    return Math.max(0.42, p.start - p.perHour * hours)
  }

  segmentAlive(t: number) {
    const m = this.cfg.scenario.mmod
    return Array.from({ length: SEGMENT_COUNT }, (_, k) => !(m && m.segment === k && t >= m.at))
  }

  wingAngles(t: number) {
    const sun = sunAngleDeg(this.cfg.orbit, t)
    const st = this.cfg.scenario.wingStall
    return [0, 1].map((w) => (st && st.wing === w && t >= st.at ? st.angleDeg : sun))
  }

  step(t: number, dt: number) {
    const { cfg, s } = this
    const eclipse = isEclipsed(cfg.orbit, t)
    const ll = subSatellite(cfg.orbit, t)
    const saa = inSaa(ll.lat, ll.lon)

    // Workload: a slow daily swell, a faster job cycle, low-pass noise.
    s.noise += (this.rng() - 0.5) * 0.02 - s.noise * 0.05
    let target =
      cfg.baseUtil +
      0.07 * Math.sin((2 * Math.PI * t) / (5.3 * 3600) + cfg.orbit.raanDeg) +
      0.035 * Math.sin((2 * Math.PI * t) / (37 * 60) + cfg.orbit.phaseDeg) +
      s.noise
    if (eclipse) target *= 0.85 // power-aware scheduler defers batch work in shadow
    if (saa) target *= 0.94 // batch jobs paused for the transit
    if (s.soc < 0.25) target *= 0.8
    s.util += (Math.min(0.99, Math.max(0.05, target)) - s.util) * Math.min(1, dt / 120)

    // Thermal throttle: hold the hottest module just under the limit.
    const hottest = Math.max(...s.modulesC)
    if (hottest > SIM.moduleLimitC - 1.2) s.throttle = Math.max(0.45, s.throttle - 0.015 * (dt / 10))
    else if (hottest < SIM.moduleLimitC - 4) s.throttle = Math.min(1, s.throttle + 0.006 * (dt / 10))

    const util = s.util * s.throttle
    const itKw = cfg.capacityKw * util
    const pump = this.pumpHealth(t)
    const flow = pump
    const alive = this.segmentAlive(t)
    const aliveShare = alive.filter(Boolean).length / SEGMENT_COUNT

    // Modules → loop
    let toLoop = 0
    for (let i = 0; i < MODULE_COUNT; i++) {
      const share = cfg.moduleShares[i]
      const g0 = (cfg.capacityKw * 1000 * share) / DESIGN_DT // W/K at full flow
      const g = g0 * flow
      const q = g * (s.modulesC[i] - s.loopC)
      const heat = itKw * 1000 * share
      const c = g0 * 300
      s.modulesC[i] += ((heat - q) / c) * dt
      toLoop += q
    }

    // Heaters
    const heaterKw = Math.min(cfg.maxHeaterKw, Math.max(0, (HEATER_SET - s.loopC) * (cfg.maxHeaterKw / 5)))

    // Loop → space
    const absorbed = (eclipse ? 0 : Q_SUN) + Q_IR
    const T = s.loopC + K
    const area = cfg.radiatorAreaM2 * aliveShare
    const out = (EPS * SIGMA * T ** 4 - absorbed) * area
    const overheadW = cfg.capacityKw * OVERHEAD * 1000
    const cLoop = cfg.capacityKw * 1000 * 25
    s.loopC += ((toLoop + heaterKw * 1000 + overheadW - out) / cLoop) * dt

    // Dead radiator segments drift to radiative equilibrium with their surroundings.
    const eq = (absorbed / (EPS * SIGMA)) ** 0.25 - K
    for (let k = 0; k < SEGMENT_COUNT; k++) {
      if (alive[k]) s.deadC[k] = s.loopC
      else s.deadC[k] += (eq - s.deadC[k]) * Math.min(1, dt / 420)
    }

    // Power
    const wingAngle = this.wingAngles(t)
    const sun = sunAngleDeg(cfg.orbit, t)
    const wingErr = wingAngle.map((a) => Math.abs(((a - sun + 540) % 360) - 180))
    const wingFactor = wingErr.reduce((acc, e) => acc + Math.max(0, Math.cos((e * Math.PI) / 180)), 0) / 2
    const genKw = eclipse ? 0 : cfg.genMaxKw * wingFactor
    const drawKw = itKw + cfg.capacityKw * OVERHEAD + heaterKw
    s.soc = Math.min(1, Math.max(0.05, s.soc + ((genKw - drawKw) * dt) / (cfg.batteryKwh * 3600)))

    // Radiation: single-event upsets, far more often inside the South Atlantic Anomaly.
    const rate = saa ? 7.5 : 0.18
    const events = poisson(this.rng, (rate * dt) / 60)
    s.seuTotal += events
    s.seuPerMin += ((events * 60) / dt - s.seuPerMin) * Math.min(1, dt / 90)

    // Radiator segment temperatures: inlet hot, outlet cold, steeper when flow is weak.
    const grad = (1.4 + 5 * (1 - flow)) * (0.4 + util)
    const segmentsC = alive.map((ok, k) => (ok ? s.loopC + grad * (1.5 - (k % 4)) : s.deadC[k]))

    const sample: Omit<ClusterSample, 'faults' | 'status'> = {
      t,
      eclipse,
      inSaa: saa,
      util,
      throttle: s.throttle,
      itKw,
      outputPf: itKw * cfg.pfPerKw * (saa ? 0.97 : 1),
      genKw,
      drawKw,
      soc: s.soc,
      loopC: s.loopC,
      modulesC: s.modulesC.slice(),
      segmentsC,
      segmentAlive: alive,
      heaterKw,
      pumpHealth: pump,
      flow,
      seuPerMin: s.seuPerMin,
      seuTotal: s.seuTotal,
      wingErrDeg: wingErr,
      wingAngleDeg: wingAngle,
    }

    const raw = deriveFaults(cfg, sample)
    const seen = new Set<string>()
    const faults: Fault[] = raw.map((f) => {
      seen.add(f.id)
      if (!s.since.has(f.id)) s.since.set(f.id, t)
      return { ...f, since: s.since.get(f.id)! }
    })
    for (const id of s.since.keys()) if (!seen.has(id)) s.since.delete(id)

    this.latest = { ...sample, faults, status: statusOf(faults) }
    return this.latest
  }

  get sample() {
    return this.latest
  }
}
