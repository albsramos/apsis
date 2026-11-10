import type { ReactNode } from 'react'
import styles from './Section.module.css'

/** A titled block in a sheet. */
export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {aside && <div className={styles.aside}>{aside}</div>}
      </header>
      {children}
    </section>
  )
}
