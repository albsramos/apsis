import type { ReactNode } from 'react'
import { actions, useApsis } from '@/store'
import { cx } from '@/lib/cx'
import styles from './SidePanel.module.css'

/**
 * The information column. Desktop: a glass sheet on the left. Phones: a bottom drawer that peeks
 * (name and vitals) and opens with its handle. `viewKey` re-runs the slide-in when the view changes.
 */
export function SidePanel({ children, viewKey, label }: { children: ReactNode; viewKey: string; label: string }) {
  const open = useApsis((s) => s.drawerOpen)
  return (
    <aside className={cx(styles.panel, open && styles.open)} aria-label={label}>
      <button
        type="button"
        className={styles.handle}
        onClick={() => actions.setDrawer(!open)}
        aria-label={open ? 'Collapse panel' : 'Expand panel'}
        aria-expanded={open}
      >
        <span />
      </button>
      <div key={viewKey} className={styles.view}>
        {children}
      </div>
    </aside>
  )
}
