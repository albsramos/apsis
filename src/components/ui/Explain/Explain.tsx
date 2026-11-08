import { GLOSSARY, type GlossaryKey } from '@/lib/glossary'
import { useApsis } from '@/store'
import { cx } from '@/lib/cx'
import styles from './Explain.module.css'

/** The one-line "what this measures" for a glossary entry, shown only while Explain mode is on. */
export function Explain({ k, className }: { k: GlossaryKey; className?: string }) {
  const on = useApsis((s) => s.explain)
  if (!on) return null
  return <p className={cx(styles.explain, className)}>{GLOSSARY[k].what}</p>
}
