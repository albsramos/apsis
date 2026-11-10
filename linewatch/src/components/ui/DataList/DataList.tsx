import type { ReactNode } from 'react'
import styles from './DataList.module.css'

/** Label and value pairs, one per row. */
export function DataList({ items }: { items: { label: string; value: ReactNode; mono?: boolean }[] }) {
  return (
    <dl className={styles.list}>
      {items.map((it) => (
        <div key={it.label} className={styles.row}>
          <dt className={styles.label}>{it.label}</dt>
          <dd className={it.mono ? styles.mono : styles.value}>{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}
