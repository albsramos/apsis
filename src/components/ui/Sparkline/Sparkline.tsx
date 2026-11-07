import { useId } from 'react'
import styles from './Sparkline.module.css'

/** A tiny line chart with a soft fill. `tone` is a CSS colour (usually a token var). */
export function Sparkline({ values, tone = 'var(--viz-active)', height = 28 }: { values: number[]; tone?: string; height?: number }) {
  const id = useId()
  if (values.length < 2) return <svg className={styles.svg} height={height} aria-hidden />
  const w = 100
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - 2 - ((v - min) / span) * (height - 4)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('')
  return (
    <svg className={styles.svg} viewBox={`0 0 ${w} ${height}`} height={height} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={tone} stopOpacity="0.28" />
          <stop offset="1" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${w},${height}L0,${height}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={tone} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
