import { Tooltip as T } from 'radix-ui'
import type { ReactNode } from 'react'
import styles from './Tooltip.module.css'

export const TooltipProvider = T.Provider

/** Hover/focus hint, shadcn style. `content` can include a <Kbd>. */
export function Tooltip({ content, children, side = 'bottom' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content className={styles.content} side={side} sideOffset={6}>
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
