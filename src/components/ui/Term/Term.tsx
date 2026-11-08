import { Popover } from 'radix-ui'
import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { GLOSSARY, type GlossaryKey } from '@/lib/glossary'
import { cx } from '@/lib/cx'
import styles from './Term.module.css'

/**
 * A label that explains itself. Click (or tap, or Enter) to open what the thing measures, how it is
 * computed and how to read it, straight from the glossary.
 *
 * With children, the children become the trigger, underlined with dots. Without, it is a small ⓘ.
 */
export function Term({ k, children, className }: { k: GlossaryKey; children?: ReactNode; className?: string }) {
  const g = GLOSSARY[k]
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cx(children ? styles.text : styles.icon, className)}
          aria-label={children ? undefined : `What is ${g.title}?`}
          // Terms sit inside clickable rows; explaining one should not also select the row.
          onClick={(e) => e.stopPropagation()}
        >
          {children ?? <Icon name="info" size={12} />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.content} side="bottom" align="start" sideOffset={6} collisionPadding={12} onClick={(e) => e.stopPropagation()}>
          <div className={styles.title}>{g.title}</div>
          <p className={styles.what}>{g.what}</p>
          {'how' in g && g.how && (
            <p className={styles.more}>
              <span className={styles.k}>How</span> {g.how}
            </p>
          )}
          {'read' in g && g.read && (
            <p className={styles.more}>
              <span className={styles.k}>Read</span> {g.read}
            </p>
          )}
          <Popover.Arrow className={styles.arrow} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
