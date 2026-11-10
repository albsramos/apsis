import type { Severity } from '@/api'
import { SEVERITY_LABEL } from '@/lib/format'
import { cx } from '@/lib/cx'
import styles from './StatusDot.module.css'

/** Severity as a dot; a fault pulses. */
export function StatusDot({ status, size = 8 }: { status: Severity; size?: number }) {
  return <span className={cx(styles.dot, styles[status])} style={{ width: size, height: size }} aria-label={SEVERITY_LABEL[status]} role="img" />
}
