import type { KeyboardEvent } from 'react'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { StatTile } from '@/components/ui/StatTile'
import { Sparkline } from '@/components/ui/Sparkline'
import { StatusDot } from '@/components/ui/StatusDot'
import { Section } from '@/components/ui/Section'
import { Explain } from '@/components/ui/Explain'
import { Term } from '@/components/ui/Term'
import { FLEET, SIM } from '@/sim/fleet'
import { rank } from '@/sim/faults'
import type { ClusterConfig, ClusterSample, Lens } from '@/sim/types'
import { actions, telemetry, useApsis } from '@/store'
import { fmt, range } from '@/lib/format'
import { cx } from '@/lib/cx'
import styles from './FleetSheet.module.css'

const STATUS_RANK = { critical: 0, degraded: 1, nominal: 2 } as const

/** What the right-hand column of the cluster list shows, which depends on the lens. */
const LENS_COLUMN: Record<Lens, string> = {
  output: 'output · bar = utilisation',
  thermal: 'hottest module · bar to 45°C',
  faults: 'worst fault',
}

/** The fleet at a glance: totals, then every cluster, the ones that need attention first. */
export function FleetSheet() {
  useApsis((s) => s.version)
  useApsis((s) => s.offset)
  const lens = useApsis((s) => s.lens)
  const history = useApsis((s) => s.history)
  const hoverId = useApsis((s) => s.hoverId)

  const rows = FLEET.map((c) => ({ c, s: telemetry(c.id) })).filter((r): r is { c: ClusterConfig; s: ClusterSample } => !!r.s)
  rows.sort(
    (a, b) =>
      STATUS_RANK[a.s.status] - STATUS_RANK[b.s.status] ||
      Math.min(...a.s.faults.map((f) => rank(f.severity)), 9) - Math.min(...b.s.faults.map((f) => rank(f.severity)), 9) ||
      Math.max(...b.s.modulesC) - Math.max(...a.s.modulesC),
  )

  const totalPf = rows.reduce((a, r) => a + r.s.outputPf, 0)
  const drawKw = rows.reduce((a, r) => a + r.s.drawKw, 0)
  const faults = rows.flatMap((r) => r.s.faults).filter((f) => f.severity !== 'info')
  const counts = { nominal: 0, degraded: 0, critical: 0 }
  for (const r of rows) counts[r.s.status]++

  // Last hour of fleet output (history samples line up across clusters).
  const n = Math.min(120, ...FLEET.map((c) => history[c.id]?.length ?? 0))
  const outputSeries = Array.from({ length: n }, (_, i) =>
    FLEET.reduce((a, c) => a + history[c.id][history[c.id].length - n + i].outputPf, 0),
  )

  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(e.currentTarget.querySelectorAll('button'))
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }

  return (
    <>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>
            Fleet <Term k="data" />
          </h2>
          <p className={styles.sub}>{FLEET.length} clusters in 4 orbit classes · simulated</p>
        </div>
        <Term k="statusCounts">
          <span className={styles.counts}>
            {(['critical', 'degraded', 'nominal'] as const).map((s) => (
              <span key={s} className={styles.count} title={s}>
                <StatusDot status={s} size={7} /> {counts[s]}
              </span>
            ))}
          </span>
        </Term>
      </header>
      <Explain k="data" className={styles.explain} />
      <ScrollArea className={styles.scroll}>
        <div className={styles.kpis}>
          <StatTile
            label="Fleet output"
            info="fleetOutput"
            value={fmt.pf(totalPf)}
            hint="FP8 petaflops, all clusters"
            chart={<Sparkline values={outputSeries} />}
            axis={{ from: `−${Math.round((n * SIM.sampleEvery) / 60)}m`, range: range(outputSeries, fmt.pf) }}
          />
          <StatTile
            label="Power draw"
            info="fleetPower"
            value={fmt.kw(drawKw)}
            hint={`${fmt.kw(rows.reduce((a, r) => a + r.s.genKw, 0))} generated`}
          />
          <StatTile
            label="Active faults"
            info="activeFaults"
            value={faults.length}
            tone={faults.some((f) => f.severity === 'critical') ? 'danger' : faults.length ? 'warn' : undefined}
            hint={faults[0]?.title ?? 'All clear'}
          />
          <StatTile
            label="In shadow"
            info="inShadow"
            value={`${rows.filter((r) => r.s.eclipse).length} / ${rows.length}`}
            hint="clusters in Earth’s shadow"
          />
        </div>

        <Section title="Clusters" info="clusterList" aside={<span>{LENS_COLUMN[lens]}</span>}>
          <ul className={styles.list} onKeyDown={onKey}>
            {rows.map(({ c, s }) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={cx(styles.row, hoverId === c.id && styles.hovered)}
                  onClick={() => actions.select(c.id)}
                  onMouseEnter={() => actions.setHover(c.id)}
                  onMouseLeave={() => actions.setHover(null)}
                  onFocus={() => actions.setHover(c.id)}
                  onBlur={() => actions.setHover(null)}
                >
                  <StatusDot status={s.status} />
                  <span className={styles.ident}>
                    <span className={styles.name}>
                      <span className={styles.code}>{c.code}</span> {c.name}
                    </span>
                    <span className={styles.orbit}>
                      {c.orbit.label} · {c.role}
                    </span>
                  </span>
                  <LensMetric lens={lens} c={c} s={s} />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </ScrollArea>
    </>
  )
}

function LensMetric({ lens, c, s }: { lens: Lens; c: ClusterConfig; s: ClusterSample }) {
  if (lens === 'output') {
    const u = s.itKw / c.capacityKw
    return (
      <span className={styles.metric}>
        <span className={styles.value}>{fmt.pf(s.outputPf)}</span>
        <Bar value={u} color="var(--viz-active)" />
      </span>
    )
  }
  if (lens === 'thermal') {
    const t = Math.max(...s.modulesC)
    const margin = SIM.moduleLimitC - t
    return (
      <span className={styles.metric}>
        <span className={cx(styles.value, margin < 2.5 ? styles.critical : margin < 6 && styles.warn)}>{fmt.temp(t)}</span>
        <Bar
          value={Math.min(1, Math.max(0.04, (t - 10) / (SIM.moduleLimitC - 10)))}
          color={margin < 2.5 ? 'var(--danger)' : margin < 6 ? 'var(--viz-warn)' : 'var(--viz-active)'}
        />
      </span>
    )
  }
  const f = s.faults.find((x) => x.severity !== 'info') ?? s.faults[0]
  return (
    <span className={styles.metric}>
      <span className={cx(styles.faultText, f && f.severity !== 'info' && styles[f.severity])}>{f ? f.title : 'All clear'}</span>
    </span>
  )
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <span className={styles.bar}>
      <span style={{ width: `${value * 100}%`, background: color }} />
    </span>
  )
}
