import { ScrollArea as S } from 'radix-ui'
import type { ReactNode, Ref } from 'react'
import styles from './ScrollArea.module.css'
import { cx } from '@/lib/cx'

export function ScrollArea({ children, className, viewportRef }: { children: ReactNode; className?: string; viewportRef?: Ref<HTMLDivElement> }) {
  return (
    <S.Root className={cx(styles.root, className)} type="hover">
      <S.Viewport className={styles.viewport} ref={viewportRef}>
        {children}
      </S.Viewport>
      <S.Scrollbar className={styles.bar} orientation="vertical">
        <S.Thumb className={styles.thumb} />
      </S.Scrollbar>
    </S.Root>
  )
}
