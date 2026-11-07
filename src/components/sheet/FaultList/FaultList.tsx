import { useEffect, useRef } from 'react'
import { Icon } from '@/components/ui/Icon'
import type { ClusterSample, Fault } from '@/sim/types'
import { actions, useApsis } from '@/store'
import { ago } from '@/lib/format'
import { samePart } from '@/lib/parts'
import { cx } from '@/lib/cx'
import styles from './FaultList.module.css'

const LABEL = { critical: 'Critical', warn: 'Warning', info: 'Notice' } as const

/** Faults, worst first. Click one to fly the camera to the part. */
export function FaultList({ sample }: { sample: ClusterSample }) {
  if (!sample.faults.length) {
    return (
      <div className={styles.clear}>
        <Icon name="check" size={16} /> No active faults. Every part within limits.
      </div>
    )
  }
  return (
    <ul className={styles.list}>
      {sample.faults.map((f) => (
        <FaultRow key={f.id} f={f} now={sample.t} />
      ))}
    </ul>
  )
}

function FaultRow({ f, now }: { f: Fault; now: number }) {
  const picked = useApsis((s) => s.pickedPart?.clusterId === f.clusterId && samePart(s.pickedPart.part, f.part))
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (picked) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [picked])
  return (
    <li>
      <button
        ref={ref}
        type="button"
        className={cx(styles.row, styles[f.severity], picked && styles.picked)}
        onClick={() => actions.focusPart({ clusterId: f.clusterId, part: f.part })}
        onMouseEnter={() => actions.setHoverPart({ clusterId: f.clusterId, part: f.part })}
        onMouseLeave={() => actions.setHoverPart(null)}
      >
        <div className={styles.top}>
          <span className={styles.severity}>{LABEL[f.severity]}</span>
          <span className={styles.since}>{ago(now - f.since)}</span>
        </div>
        <div className={styles.title}>{f.title}</div>
        <div className={styles.detail}>{f.detail}</div>
        <div className={styles.action}>
          <Icon name="chevron" size={12} /> {f.action}
        </div>
      </button>
    </li>
  )
}
