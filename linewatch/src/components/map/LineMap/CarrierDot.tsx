import { memo, useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import type { Carrier } from '@/api'
import { PAYLOAD_LABEL, SEVERITY_LABEL } from '@/lib/format'
import { cx } from '@/lib/cx'
import styles from './LineMap.module.css'

/** Further than this between two reports is a re-entry at the start of the line, not travel: jump, don't glide. */
const JUMP = 90

export const CarrierDot = memo(function CarrierDot({
  carrier,
  x,
  y,
  role,
  onSelect,
}: {
  carrier: Carrier
  x: number
  y: number
  /** How this carrier relates to the selection */
  role: 'none' | 'selected' | 'queued' | 'dimmed'
  onSelect: (id: string) => void
}) {
  const last = useRef({ x, y })
  const jump = Math.hypot(x - last.current.x, y - last.current.y) > JUMP
  useEffect(() => {
    last.current = { x, y }
  })

  const pick = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation()
    onSelect(carrier.id)
  }
  const what = carrier.payloadType ? PAYLOAD_LABEL[carrier.payloadType] : 'empty'

  return (
    <g
      className={cx(styles.carrier, jump && styles.jump, styles[role])}
      style={{ transform: `translate(${x}px, ${y}px)` }}
      data-status={carrier.status}
      data-type={carrier.payloadType ?? 'none'}
      data-loaded={carrier.loaded}
      role="button"
      tabIndex={0}
      aria-label={`Carrier ${carrier.id}, ${what}, ${SEVERITY_LABEL[carrier.status]}`}
      aria-pressed={role === 'selected'}
      onClick={pick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && pick(e)}
    >
      <title>{`${carrier.id} · ${what}`}</title>
      <circle className={styles.hit} r={15} />
      {carrier.status !== 'ok' && <circle className={styles.halo} r={14} />}
      {role === 'selected' && <circle className={styles.ring} r={13} />}
      <circle className={styles.dot} r={7} />
    </g>
  )
})
