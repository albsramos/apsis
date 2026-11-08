import { StatusDot } from '@/components/ui/StatusDot'
import { MODULE_SCALE, RADIATOR_SCALE, type HeatScale } from '@/lib/heat'
import { useApsis } from '@/store'
import { cx } from '@/lib/cx'
import styles from './LensLegend.module.css'

/**
 * What the colours in the 3D scene mean under the current lens. Always on for desktop; on phones only in
 * Explain mode, where there is room to spare for it.
 */
export function LensLegend() {
  const lens = useApsis((s) => s.lens)
  const selected = useApsis((s) => s.selectedId)
  const explain = useApsis((s) => s.explain)
  return (
    <aside className={cx(styles.legend, explain && styles.explain)} aria-label="Scene legend">
      {lens === 'output' && (
        <>
          <div className={styles.title}>Output lens</div>
          {selected ? (
            <p className={styles.note}>
              Compute modules glow with the work they carry, solar wings with the power they generate, and the beam to Earth is the data
              downlink. Brighter means more.
            </p>
          ) : (
            <>
              <p className={styles.note}>Ring and marker brightness: utilisation</p>
              <div className={cx(styles.ramp, styles.output)} />
              <div className={styles.ticks}>
                <span>0%</span>
                <span>100%</span>
              </div>
            </>
          )}
        </>
      )}
      {lens === 'thermal' && (
        <>
          <div className={styles.title}>Thermal lens</div>
          <p className={styles.note}>{selected ? 'Compute modules, °C' : 'Ring and marker: hottest module, °C'}</p>
          <Ramp scale={MODULE_SCALE} />
          {selected && (
            <>
              <p className={styles.note}>Radiator segments, °C · coolant flows along the pipes</p>
              <Ramp scale={RADIATOR_SCALE} />
            </>
          )}
        </>
      )}
      {lens === 'faults' && (
        <>
          <div className={styles.title}>Faults lens</div>
          <ul className={styles.keys}>
            <li>
              <StatusDot status="critical" size={7} /> Critical
            </li>
            <li>
              <StatusDot status="degraded" size={7} /> Warning
            </li>
            <li>
              <span className={styles.notice} /> Notice
            </li>
            {!selected && (
              <li>
                <StatusDot status="nominal" size={7} /> Nominal: shown grey
              </li>
            )}
          </ul>
          <p className={styles.note}>
            {selected ? 'A faulted part is drawn solid and pulses.' : 'The pale patch on the globe is the South Atlantic Anomaly.'}
          </p>
        </>
      )}
    </aside>
  )
}

/** The heat ramp, with each of its five stops labelled by the temperature it is pinned to. */
function Ramp({ scale }: { scale: HeatScale }) {
  return (
    <>
      <div className={cx(styles.ramp, styles.heat)} />
      <div className={styles.ticks}>
        {scale.map((t) => (
          <span key={t}>{t}°</span>
        ))}
      </div>
    </>
  )
}
