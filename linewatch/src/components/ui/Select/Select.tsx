import { Select as S } from 'radix-ui'
import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { cx } from '@/lib/cx'
import styles from './Select.module.css'

interface Option<V extends string> {
  value: V
  label: string
  /** Secondary text, shown in the list only */
  hint?: string
}

/** A dropdown for one value out of a few, shadcn style. */
export function Select<V extends string>({
  value,
  onChange,
  options,
  label,
  icon,
  className,
}: {
  value: V | undefined
  onChange: (v: V) => void
  options: Option<V>[]
  /** Accessible name */
  label: string
  icon?: ReactNode
  className?: string
}) {
  return (
    <S.Root value={value} onValueChange={(v) => onChange(v as V)}>
      <S.Trigger className={cx(styles.trigger, className)} aria-label={label}>
        {icon}
        <span className={styles.value}>
          <S.Value placeholder={label} />
        </span>
        <S.Icon className={styles.chevron}>
          <Icon name="down" size={14} />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content className={styles.content} position="popper" sideOffset={6} align="start">
          <S.Viewport className={styles.viewport}>
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} className={styles.item}>
                <S.ItemText>{o.label}</S.ItemText>
                {o.hint && <span className={styles.hint}>{o.hint}</span>}
                <S.ItemIndicator className={styles.check}>
                  <Icon name="check" size={14} />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}
