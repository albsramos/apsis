import { useMemo } from 'react'
import { useGetFactoryStats, useGetLayout, useListCarriers, useListIssues } from '@/api'
import { pointAt, tail, toPath, track, type Track } from '@/lib/geometry'
import { dwellLevel, useLens } from '@/lib/lens'
import { LIVE, SLOW, STATIC } from '@/lib/live'
import { useSelection } from '@/lib/selection'
import { cx } from '@/lib/cx'
import { CarrierDot } from './CarrierDot'
import styles from './LineMap.module.css'

/**
 * The line, drawn from the layout the API returns: nothing here knows what any factory looks like.
 * A lens is a data attribute on the root; the stylesheet does the recolouring.
 */
export function LineMap() {
  const { factoryId, carrierId, select } = useSelection()
  const [lens] = useLens()
  const layout = useGetLayout(factoryId, { query: STATIC })
  const carriers = useListCarriers(factoryId, { query: LIVE }).data
  const issues = useListIssues(factoryId, { query: SLOW }).data
  const stats = useGetFactoryStats(factoryId, { query: { ...SLOW, enabled: lens === 'dwell' } }).data

  const tracks = useMemo(() => {
    const map: Record<string, Track> = {}
    for (const s of layout.data?.segments ?? []) map[s.id] = track(s.points)
    return map
  }, [layout.data])

  if (layout.isError) return <p className={styles.message}>This factory has no published layout.</p>
  if (!layout.data) return <p className={styles.message}>Loading the line…</p>

  const { width, height, nodes, segments } = layout.data
  const dwell = new Map(stats?.segmentDwell.map((d) => [d.segmentId, d]))
  const selected = carriers?.find((c) => c.id === carrierId)
  const impact = issues?.find((i) => i.carrierId === carrierId && i.severity === 'fault')?.impact
  const queued = new Set(impact?.queuedCarrierIds)
  const selectedTrack = selected && tracks[selected.position.segmentId]

  return (
    <svg
      className={styles.map}
      viewBox={`0 0 ${width} ${height}`}
      data-lens={lens}
      role="group"
      aria-label="Line map"
      onClick={() => carrierId && select(null)}
    >
      <g className={styles.tracks}>
        {segments.map((s) => {
          const d = dwell.get(s.id)
          return <path key={s.id} d={toPath(s.points)} className={styles.track} data-level={d && d.carriers > 0 ? dwellLevel(d.ratio) : undefined} />
        })}
      </g>

      {impact?.starvedNodeId && selected && selectedTrack && <path className={styles.starved} d={toPath(tail(selectedTrack, selected.position.offset))} />}

      <g>
        {nodes.map((n) => {
          const starving = n.id === impact?.starvedNodeId
          return (
            <g key={n.id} className={cx(styles.node, styles[n.kind], starving && styles.starving)} transform={`translate(${n.x} ${n.y})`}>
              <title>{starving ? `${n.name}: nothing on its way` : n.name}</title>
              {n.kind === 'station' || n.kind === 'buffer' ? <rect x={-13} y={-13} width={26} height={26} rx={6} /> : <circle r={n.kind === 'junction' ? 4 : 10} />}
              {n.kind !== 'junction' && (
                <text className={styles.label} y={30}>
                  {n.name}
                </text>
              )}
            </g>
          )
        })}
      </g>

      <g className={cx(carrierId && styles.hasSelection)}>
        {carriers?.map((c) => {
          const t = tracks[c.position.segmentId]
          if (!t) return null
          const at = pointAt(t, c.position.offset)
          const role = !carrierId ? 'none' : c.id === carrierId ? 'selected' : queued.has(c.id) ? 'queued' : 'dimmed'
          return <CarrierDot key={c.id} carrier={c} x={at.x} y={at.y} role={role} onSelect={select} />
        })}
      </g>
    </svg>
  )
}
