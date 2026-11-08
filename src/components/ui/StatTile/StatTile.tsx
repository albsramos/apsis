import type { ReactNode } from 'react'
import { Explain } from '@/components/ui/Explain'
import { Term } from '@/components/ui/Term'
import type { GlossaryKey } from '@/lib/glossary'
import { cx } from '@/lib/cx'
import styles from './StatTile.module.css'

/** A KPI: label, big value, optional hint and a chart slot. Plain, no card. */
export function StatTile({
  label,
  value,
  hint,
  tone,
  chart,
  axis,
  info,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  /** Only when the number itself is a warning or a danger; otherwise it stays white. */
  tone?: 'warn' | 'danger'
  chart?: ReactNode
  /** What the chart spans: its start (e.g. "−1h") and the min–max of its values, since it auto-scales. */
  axis?: { from: string; range?: string }
  /** The glossary entry that explains this number. */
  info?: GlossaryKey
}) {
  return (
    <div className={cx(styles.tile, tone && styles[tone])}>
      <div className={styles.label}>
        {label}
        {info && <Term k={info} />}
      </div>
      <div className={styles.value}>{value}</div>
      {hint && <div className={styles.hint}>{hint}</div>}
      {chart && <div className={styles.chart}>{chart}</div>}
      {chart && axis && (
        <div className={styles.axis}>
          <span>{axis.from}</span>
          {axis.range && <span className={styles.range}>{axis.range}</span>}
          <span>now</span>
        </div>
      )}
      {info && <Explain k={info} className={styles.explain} />}
    </div>
  )
}
