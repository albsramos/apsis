import { Progress as P } from 'radix-ui'
import { cx } from '@/lib/cx'
import styles from './Progress.module.css'

/** A horizontal bar for a share of a whole (0–100). */
export function Progress({ value, label, tone = 'neutral' }: { value: number; label: string; tone?: 'neutral' | 'warn' | 'danger' }) {
  const v = Math.min(100, Math.max(0, value))
  return (
    <P.Root className={styles.root} value={v} aria-label={label}>
      <P.Indicator className={cx(styles.bar, styles[tone])} style={{ width: `${v}%` }} />
    </P.Root>
  )
}
