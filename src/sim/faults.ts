import { SIM } from './fleet'
import type { ClusterConfig, ClusterSample, Fault, Severity, Status } from './types'

const pct = (x: number) => `${Math.round(x * 100)}%`
const c = (x: number) => `${x.toFixed(1)}°C`

export const segmentName = (k: number) => `R${Math.floor(k / 4) + 1}·S${(k % 4) + 1}`
export const moduleName = (i: number) => `M${i + 1}`
export const wingName = (w: number) => (w === 0 ? 'A' : 'B')

type RawFault = Omit<Fault, 'since'>

/** The thresholds every fault is raised at. The sheet's explanations quote these, so they can't drift. */
export const LIMITS = {
  /** Pump flow (share of nominal) below which the pump is a warning, and a critical fault */
  pumpWarn: 0.88,
  pumpCritical: 0.66,
  /** Throttle below which output counts as throttled */
  throttled: 0.97,
  /** Module headroom under the limit (°C) for a warning, and a critical fault */
  marginWarn: 6,
  marginCritical: 2.5,
  /** Solar-wing tracking error (deg) for a notice, and a warning */
  wingNotice: 12,
  wingWarn: 60,
  /** Upsets a minute that, inside the SAA, raise a notice */
  seuNotice: 1.2,
  /** Heater power, share of the maximum, that raises a notice */
  heaterNotice: 0.2,
  /** Battery state of charge for a warning */
  batteryWarn: 0.3,
} as const

/** Faults follow from the physics, so the same state always gives the same list. */
export function deriveFaults(cfg: ClusterConfig, s: Omit<ClusterSample, 'faults' | 'status'>): RawFault[] {
  const out: RawFault[] = []
  const id = (k: string) => `${cfg.id}:${k}`
  const limit = SIM.moduleLimitC

  if (s.pumpHealth < LIMITS.pumpWarn) {
    out.push({
      id: id('pump'),
      clusterId: cfg.id,
      severity: s.pumpHealth < LIMITS.pumpCritical ? 'critical' : 'warn',
      part: { kind: 'loop' },
      title: 'Coolant pump P1 degrading',
      detail: `Loop flow at ${pct(s.flow)} of nominal and falling. Module-to-loop ΔT is widening.`,
      action: 'Switch to redundant pump P2 at the next ground pass, then run a P1 bearing diagnostic.',
    })
  }

  if (s.throttle < LIMITS.throttled) {
    out.push({
      id: id('throttle'),
      clusterId: cfg.id,
      severity: 'critical',
      part: { kind: 'module', index: s.modulesC.indexOf(Math.max(...s.modulesC)) },
      title: `Thermal throttling, output −${pct(1 - s.throttle)}`,
      detail: `The scheduler is shedding load to hold the hottest module under ${limit}°C.`,
      action: 'Migrate long-running jobs to KO-3 or KO-4 until coolant flow is restored.',
    })
  }

  s.modulesC.forEach((t, i) => {
    const margin = limit - t
    if (margin < LIMITS.marginWarn) {
      out.push({
        id: id(`mod-${i}`),
        clusterId: cfg.id,
        severity: margin < LIMITS.marginCritical ? 'critical' : 'warn',
        part: { kind: 'module', index: i },
        title: `Module ${moduleName(i)} running hot`,
        detail: `${c(t)}, ${margin.toFixed(1)}°C under its limit.`,
        action: 'Check cold-plate flow for this module.',
      })
    }
  })

  s.segmentAlive.forEach((ok, k) => {
    if (!ok) {
      out.push({
        id: id(`seg-${k}`),
        clusterId: cfg.id,
        severity: 'warn',
        part: { kind: 'radiator', index: k },
        title: `Radiator ${segmentName(k)} has no flow`,
        detail: `Sudden pressure loss, then the segment fell to ${c(s.segmentsC[k])}. Likely a micrometeoroid puncture; segment isolated, 12.5% of radiator capacity lost.`,
        action: 'Keep load under 90% until the inspection drone patches the panel.',
      })
    }
  })

  s.wingErrDeg.forEach((err, w) => {
    if (err > LIMITS.wingNotice) {
      out.push({
        id: id(`wing-${w}`),
        clusterId: cfg.id,
        severity: err > LIMITS.wingWarn ? 'warn' : 'info',
        part: { kind: 'wing', index: w },
        title: `Solar wing ${wingName(w)} drive stalled`,
        detail: `Stuck at ${s.wingAngleDeg[w].toFixed(0)}°, ${err.toFixed(0)}° off the Sun. Power dips once per orbit.`,
        action: 'Command a drive reset; if it fails, plan load for −30% power on the low side of the orbit.',
      })
    }
  })

  if (s.inSaa && s.seuPerMin > LIMITS.seuNotice) {
    out.push({
      id: id('seu'),
      clusterId: cfg.id,
      severity: 'info',
      part: { kind: 'module', index: Math.floor((s.seuTotal * 7) % 6) },
      title: 'Radiation upsets: South Atlantic Anomaly',
      detail: `${s.seuPerMin.toFixed(1)} single-event upsets a minute, all corrected by ECC.`,
      action: 'None. Batch jobs pause automatically for the transit.',
    })
  }

  if (s.heaterKw > cfg.maxHeaterKw * LIMITS.heaterNotice) {
    out.push({
      id: id('heater'),
      clusterId: cfg.id,
      severity: 'info',
      part: { kind: 'loop' },
      title: 'Heaters holding the loop',
      detail: `Heaters at ${pct(s.heaterKw / cfg.maxHeaterKw)}, keeping the coolant at ${c(s.loopC)}.`,
      action: 'Expected for a lightly loaded cluster in shadow.',
    })
  }

  if (s.soc < LIMITS.batteryWarn) {
    out.push({
      id: id('battery'),
      clusterId: cfg.id,
      severity: 'warn',
      part: { kind: 'dish' },
      title: 'Battery low',
      detail: `State of charge ${pct(s.soc)}.`,
      action: 'Defer batch work until the next sunlit arc.',
    })
  }

  return out.sort((a, b) => rank(a.severity) - rank(b.severity))
}

export const rank = (s: Severity) => (s === 'critical' ? 0 : s === 'warn' ? 1 : 2)

export function statusOf(faults: { severity: Severity }[]): Status {
  if (faults.some((f) => f.severity === 'critical')) return 'critical'
  if (faults.some((f) => f.severity === 'warn')) return 'degraded'
  return 'nominal'
}
