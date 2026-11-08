import type { ReactNode } from 'react'
import { Explain } from '@/components/ui/Explain'
import { Term } from '@/components/ui/Term'
import type { GlossaryKey } from '@/lib/glossary'
import styles from './Section.module.css'

/** A titled block in a sheet. `info` names the glossary entry that explains it (ⓘ, and inline in Explain mode). */
export function Section({
  title,
  aside,
  children,
  id,
  info,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  id?: string
  info?: GlossaryKey
}) {
  return (
    <section className={styles.section} id={id}>
      <header className={styles.header}>
        <h3 className={styles.title}>
          {title}
          {info && <Term k={info} />}
        </h3>
        {aside && <div className={styles.aside}>{aside}</div>}
      </header>
      {info && <Explain k={info} />}
      {children}
    </section>
  )
}
