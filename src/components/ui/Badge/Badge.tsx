import type { ReactNode } from 'react'
import styles from './Badge.module.css'
import { cx } from '@/lib/cx'

export function Badge({
  tone = 'neutral',
  children,
}: {
  /** `solid`: inverted (light on dark, dark on light), for the strongest status. */
  tone?: 'neutral' | 'success' | 'warn' | 'info' | 'danger' | 'solid'
  children: ReactNode
}) {
  return <span className={cx(styles.badge, styles[tone])}>{children}</span>
}
