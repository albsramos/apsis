import { ToggleGroup as T } from 'radix-ui'
import type { ReactNode } from 'react'
import styles from './ToggleGroup.module.css'
import { cx } from '@/lib/cx'

interface Item<V extends string> {
  value: V
  label: ReactNode
  /** Accessible name when the label is an icon */
  title?: string
}

/** A segmented control: one value always selected. */
export function ToggleGroup<V extends string>({
  value,
  onChange,
  items,
  label,
  size = 'md',
  className,
}: {
  value: V
  onChange: (v: V) => void
  items: Item<V>[]
  label: string
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <T.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as V)}
      aria-label={label}
      className={cx(styles.root, styles[size], className)}
    >
      {items.map((it) => (
        <T.Item key={it.value} value={it.value} className={styles.item} aria-label={it.title} title={it.title}>
          {it.label}
        </T.Item>
      ))}
    </T.Root>
  )
}
