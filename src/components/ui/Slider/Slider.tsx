import { Slider as S } from 'radix-ui'
import { useEffect, useState, type ReactNode } from 'react'
import styles from './Slider.module.css'

/** A single-thumb slider. `track` renders behind the range (e.g. eclipse bands on the timeline). Glows while dragged. */
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
  const [dragging, setDragging] = useState(false)
  // The drag can end anywhere on the page, so listen for the release on the window.
  useEffect(() => {
    if (!dragging) return
    const stop = () => setDragging(false)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [dragging])
  return (
    <S.Root
      className={styles.root}
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => onChange(v)}
      onPointerDown={() => setDragging(true)}
      data-dragging={dragging || undefined}
    >
      <S.Track className={styles.track}>
        {track}
        <S.Range className={styles.range} />
      </S.Track>
      <S.Thumb className={styles.thumb} aria-label={label} />
    </S.Root>
  )
}
