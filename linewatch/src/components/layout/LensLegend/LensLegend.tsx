import { PayloadType } from '@/api'
import { PAYLOAD_LABEL } from '@/lib/format'
import { DWELL_STEPS, useLens } from '@/lib/lens'
import { cx } from '@/lib/cx'
import styles from './LensLegend.module.css'

const TYPE_CLASS: Record<PayloadType, string> = {
  car_body: styles.carBody,
  car_plastics: styles.carPlastics,
  robot_arm: styles.robotArm,
  robot_part: styles.robotPart,
}

/** What the colours on the map mean under the current lens. */
export function LensLegend() {
  const [lens] = useLens()
  return (
    <div className={styles.legend} aria-label="Legend">
      {lens === 'dwell' ? (
        <>
          <span className={styles.caption}>Time on a stretch against normal</span>
          <div className={styles.ramp}>
            {DWELL_STEPS.map((s, i) => (
              <div key={s.label} className={styles.step}>
                <span className={cx(styles.bar, styles[`dwell${i}`])} />
                {s.label}
              </div>
            ))}
          </div>
        </>
      ) : (
        <ul className={styles.items}>
          {lens === 'status' && (
            <li>
              <span className={styles.swatch} /> Running
            </li>
          )}
          {lens === 'payload' &&
            Object.values(PayloadType).map((t) => (
              <li key={t}>
                <span className={cx(styles.swatch, TYPE_CLASS[t])} /> {PAYLOAD_LABEL[t]}
              </li>
            ))}
          <li>
            <span className={cx(styles.swatch, styles.empty)} /> Empty
          </li>
          <li>
            <span className={cx(styles.swatch, styles.warning)} /> Warning
          </li>
          <li>
            <span className={cx(styles.swatch, styles.fault)} /> Fault
          </li>
        </ul>
      )}
    </div>
  )
}
