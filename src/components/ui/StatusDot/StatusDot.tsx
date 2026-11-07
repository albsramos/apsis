import type { Status } from '@/sim/types'
import styles from './StatusDot.module.css'
import { cx } from '@/lib/cx'

export const STATUS_LABEL: Record<Status, string> = { nominal: 'Nominal', degraded: 'Degraded', critical: 'Critical' }

/** Status as a dot; critical pulses. */
export function StatusDot({ status, size = 8 }: { status: Status; size?: number }) {
  return <span className={cx(styles.dot, styles[status])} style={{ width: size, height: size }} aria-label={STATUS_LABEL[status]} role="img" />
}
