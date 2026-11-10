import { useGetFactoryStats, useGetLayout, useListFactories, useListIssues } from '@/api'
import { IssueList } from '@/components/sheet/IssueList'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { Section } from '@/components/ui/Section'
import { Skeleton } from '@/components/ui/Skeleton'
import { Sparkline } from '@/components/ui/Sparkline'
import { StatTile } from '@/components/ui/StatTile'
import { times } from '@/lib/format'
import { LIVE, SLOW, STATIC } from '@/lib/live'
import { useSelection } from '@/lib/selection'
import styles from './FactorySheet.module.css'

/** Past this multiple of the normal time, a stretch is listed as slow. */
const SLOW_FROM = 1.8

/** The sheet with nothing selected: how the factory is doing and what needs someone's attention. */
export function FactorySheet() {
  const { factoryId, select } = useSelection()
  const factories = useListFactories({ query: STATIC })
  const layout = useGetLayout(factoryId, { query: STATIC }).data
  const stats = useGetFactoryStats(factoryId, { query: SLOW }).data
  const issues = useListIssues(factoryId, { query: LIVE }).data

  const factory = factories.data?.find((f) => f.id === factoryId)
  if (factories.data && !factory) {
    return (
      <div className={styles.header}>
        <h1 className={styles.name}>Factory not found</h1>
        <p className={styles.sub}>There is no factory “{factoryId}”. Pick one from the list at the top.</p>
      </div>
    )
  }

  const faults = issues?.filter((i) => i.severity === 'fault').length ?? 0
  const nodeName = (id: string) => layout?.nodes.find((n) => n.id === id)?.name ?? id
  const slow = (stats?.segmentDwell ?? [])
    .filter((d) => d.carriers > 0 && d.ratio >= SLOW_FROM)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 4)
    .map((d) => ({ ...d, segment: layout?.segments.find((s) => s.id === d.segmentId) }))

  return (
    <>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.name}>{factory?.name ?? <Skeleton width={120} height={24} />}</h1>
          <Badge tone="success">Live</Badge>
        </div>
        <p className={styles.sub}>{factory ? `${factory.location} · layout v${factory.layoutVersion}` : <Skeleton width={160} />}</p>
        <div className={styles.tiles}>
          <StatTile label="Carriers" value={stats ? stats.carriers : '–'} hint={stats && `${stats.loaded} loaded`} />
          <StatTile
            label="Throughput"
            value={stats ? `${stats.throughputPerHour}/h` : '–'}
            chart={stats && <Sparkline values={stats.throughputHistory} tone="var(--fg-subtle)" height={22} />}
          />
          <StatTile label="Open issues" value={issues ? issues.length : '–'} hint={faults ? `${faults} stopping the line` : issues?.length ? 'none stopping the line' : undefined} tone={faults ? 'danger' : undefined} />
        </div>
      </div>

      <Section title="Needs attention" aside={issues && issues.length > 0 ? 'by impact' : undefined}>
        {issues ? <IssueList issues={issues} layout={layout} onSelect={select} /> : <Skeleton height={64} />}
      </Section>

      <Section title="Slow stretches" aside="time against normal">
        {slow.length === 0 ? (
          <p className={styles.quiet}>{stats ? 'Every stretch is running close to its normal time.' : <Skeleton />}</p>
        ) : (
          <ul className={styles.slow}>
            {slow.map((d) => (
              <li key={d.segmentId} className={styles.stretch}>
                <div className={styles.stretchRow}>
                  <span>{d.segment ? `${nodeName(d.segment.from)} → ${nodeName(d.segment.to)}` : d.segmentId}</span>
                  <span className={styles.ratio}>{times(d.ratio)}</span>
                </div>
                <Progress value={(d.ratio / 6) * 100} label={`${times(d.ratio)} the normal time`} tone={d.ratio >= 4 ? 'danger' : 'warn'} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}
