import { useEffect, useRef } from 'react'
import { moduleName, segmentName } from '@/sim/faults'
import type { ClusterSample, PartRef } from '@/sim/types'
import { actions, useApsis } from '@/store'
import { heatCss, MODULE_SCALE, RADIATOR_SCALE } from '@/lib/heat'
import { samePart } from '@/lib/parts'
import { cx } from '@/lib/cx'
import styles from './ModuleGrid.module.css'

/** Every module and radiator segment as a heat-coloured tile: the 2D twin of the 3D model. */
export function ModuleGrid({ clusterId, sample }: { clusterId: string; sample: ClusterSample }) {
  const faulted = new Set(sample.faults.filter((f) => f.severity !== 'info').map((f) => JSON.stringify(f.part)))
  return (
    <div className={styles.wrap}>
      <div className={styles.group}>
        <div className={styles.label}>Compute modules</div>
        <div className={styles.modules}>
          {sample.modulesC.map((t, i) => (
            <Tile
              key={i}
              clusterId={clusterId}
              part={{ kind: 'module', index: i }}
              name={moduleName(i)}
              value={`${t.toFixed(0)}°`}
              color={heatCss(t, MODULE_SCALE)}
              faulted={faulted.has(JSON.stringify({ kind: 'module', index: i }))}
            />
          ))}
        </div>
      </div>
      <div className={styles.group}>
        <div className={styles.label}>Radiator segments, inlet → outlet</div>
        <div className={styles.segments}>
          {sample.segmentsC.map((t, k) => (
            <Tile
              key={k}
              clusterId={clusterId}
              part={{ kind: 'radiator', index: k }}
              name={segmentName(k)}
              value={sample.segmentAlive[k] ? `${t.toFixed(0)}°` : 'dry'}
              color={heatCss(t, RADIATOR_SCALE)}
              faulted={!sample.segmentAlive[k]}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function Tile({ clusterId, part, name, value, color, faulted }: { clusterId: string; part: PartRef; name: string; value: string; color: string; faulted: boolean }) {
  const hovered = useApsis((s) => s.hoverPart?.clusterId === clusterId && samePart(s.hoverPart.part, part))
  const picked = useApsis((s) => s.pickedPart?.clusterId === clusterId && samePart(s.pickedPart.part, part))
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (picked) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [picked])
  return (
    <button
      ref={ref}
      type="button"
      className={cx(styles.tile, faulted && styles.faulted, (hovered || picked) && styles.active)}
      onClick={() => actions.focusPart({ clusterId, part })}
      onMouseEnter={() => actions.setHoverPart({ clusterId, part })}
      onMouseLeave={() => actions.setHoverPart(null)}
      aria-label={`${name}: ${value}`}
    >
      <span className={styles.swatch} style={{ background: color }} />
      <span className={styles.name}>{name}</span>
      <span className={styles.value}>{value}</span>
    </button>
  )
}
