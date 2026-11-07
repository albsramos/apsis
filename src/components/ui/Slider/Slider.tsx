import { Slider as S } from 'radix-ui'
import type { ReactNode } from 'react'
import styles from './Slider.module.css'

/** A single-thumb slider. `track` renders behind the range (e.g. eclipse bands on the timeline). */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  track,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  label: string
  track?: ReactNode
}) {
  return (
    <S.Root className={styles.root} value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)}>
      <S.Track className={styles.track}>
        {track}
        <S.Range className={styles.range} />
      </S.Track>
      <S.Thumb className={styles.thumb} aria-label={label} />
    </S.Root>
  )
}
