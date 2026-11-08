import { SIM } from '@/sim/fleet'
import { periodS } from '@/sim/orbit'
import type { ClusterConfig } from '@/sim/types'
import { useApsis } from '@/store'
import { Explain } from '@/components/ui/Explain'
import { Term } from '@/components/ui/Term'
import { duration } from '@/lib/format'
import styles from './ThermalChart.module.css'

const W = 340
const H = 132

/** The window the chart shows: three orbits, capped at six hours (which cuts the slow MEO cluster short). */
export function thermalSpan(cluster: ClusterConfig) {
  const P = periodS(cluster.orbit)
  const span = Math.min(3 * P, 6 * 3600)
  return { span, orbits: span / P }
}

/**
 * Temperatures over the last three orbits, with Earth's shadow shaded. This is where the regulation
 * shows: the loop dips in every eclipse and recovers in sunlight, the hottest module rides above it,
 * and the dashed line is the limit the scheduler throttles to stay under.
 */
export function ThermalChart({ cluster }: { cluster: ClusterConfig }) {
  useApsis((s) => s.version)
  const view = useApsis((s) => s.viewTime)
  const all = useApsis((s) => s.history[cluster.id])
  const { span } = thermalSpan(cluster)
  const from = view - span
  const pts = all.filter((s) => s.t >= from && s.t <= view)
  if (pts.length < 2) return <div className={styles.empty}>Collecting telemetry…</div>

  const step = Math.max(1, Math.floor(pts.length / 220))
  const xs = pts.filter((_, i) => i % step === 0)
  const hot = xs.map((s) => Math.max(...s.modulesC))
  const loop = xs.map((s) => s.loopC)
  const lo = Math.floor(Math.min(...loop) - 3)
  const hi = Math.ceil(Math.max(SIM.moduleLimitC + 3, ...hot))
  const x = (t: number) => ((t - from) / span) * W
  const y = (c: number) => H - ((c - lo) / (hi - lo)) * H
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(xs[i].t).toFixed(1)},${y(v).toFixed(1)}`).join('')

  const bands: [number, number][] = []
  let open: number | null = null
  for (const s of pts) {
    if (s.eclipse && open === null) open = s.t
    if (!s.eclipse && open !== null) (bands.push([open, s.t]), (open = null))
  }
  if (open !== null) bands.push([open, view])

  const ticks = [lo, Math.round((lo + hi) / 2), hi]
  const xTicks = [1, 2 / 3, 1 / 3, 0].map((f) => (f ? `−${duration(span * f).replace(/ 00m$/, '')}` : 'now'))
  return (
    <figure className={styles.chart}>
      <div className={styles.plot}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={styles.svg} role="img" aria-label="Temperatures over the last three orbits">
          {bands.map(([a, b], i) => (
            <rect key={i} x={x(a)} y={0} width={Math.max(0.5, x(b) - x(a))} height={H} className={styles.band} />
          ))}
          {ticks.map((t) => (
            <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} className={styles.grid} />
          ))}
          <line x1={0} x2={W} y1={y(SIM.moduleLimitC)} y2={y(SIM.moduleLimitC)} className={styles.limit} />
          <path d={path(loop)} className={styles.loop} />
          <path d={path(hot)} className={styles.hot} />
        </svg>
        <div className={styles.yAxis} aria-hidden>
          {ticks.map((t) => (
            <span key={t} style={{ top: `${(y(t) / H) * 100}%` }}>
              {t}°C
            </span>
          ))}
        </div>
      </div>
      <div className={styles.xAxis} aria-hidden>
        {xTicks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <figcaption className={styles.legend}>
        <span>
          <i className={styles.keyHot} /> <Term k="hottestModule">Hottest module</Term>
        </span>
        <span>
          <i className={styles.keyLoop} /> <Term k="loopTemp">Coolant loop</Term>
        </span>
        <span>
          <i className={styles.keyLimit} /> <Term k="moduleLimit">Limit {SIM.moduleLimitC}°C</Term>
        </span>
        <span>
          <i className={styles.keyBand} /> <Term k="eclipseBand">Eclipse</Term>
        </span>
        <Term k="thermalChart" />
      </figcaption>
      <Explain k="thermalChart" className={styles.explain} />
    </figure>
  )
}
