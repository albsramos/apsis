import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'
import styles from './StatTile.module.css'

/** A KPI: label, big value, optional hint and a chart slot. Plain, no card. */
export function StatTile({
  label,
  value,
  hint,
  tone,
  chart,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  /** Only when the number itself is a warning or a danger. */
  tone?: 'warn' | 'danger'
  chart?: ReactNode
}) {
  return (
    <div className={cx(styles.tile, tone && styles[tone])}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {hint && <div className={styles.hint}>{hint}</div>}
      {chart && <div className={styles.chart}>{chart}</div>}
    </div>
  )
}
