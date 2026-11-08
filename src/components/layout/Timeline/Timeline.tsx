import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { Icon } from '@/components/ui/Icon'
import { Tooltip } from '@/components/ui/Tooltip'
import { Kbd } from '@/components/ui/Kbd'
import { Term } from '@/components/ui/Term'
import { SIM } from '@/sim/fleet'
import { actions, clock, useApsis } from '@/store'
import { duration, utc } from '@/lib/format'
import { cx } from '@/lib/cx'
import styles from './Timeline.module.css'

const SPEEDS = [1, 60, 600]

/**
 * Time control. Live by default (sped up ×60: an orbit takes ~95 minutes); scrub back up to four
 * hours to replay what happened. Shaded bands show when the selected cluster was in Earth's shadow
 * and when it crossed the South Atlantic Anomaly.
 */
export function Timeline() {
  const offset = useApsis((s) => s.offset)
  const playing = useApsis((s) => s.playing)
  const speed = useApsis((s) => s.speed)
  const view = useApsis((s) => s.viewTime)
  const { time, date } = utc(view)
  const live = offset < SIM.sampleEvery

  return (
    <div className={styles.bar}>
      <Tooltip content={<>{playing ? 'Pause' : 'Play'} <Kbd>Space</Kbd></>} side="top">
        <button type="button" className={styles.play} onClick={actions.togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} size={14} />
        </button>
      </Tooltip>

      <div className={styles.readout}>
        <span className={styles.time}>{time}</span>
        <span className={styles.date}>{live ? date : `T−${duration(offset)}`}</span>
      </div>
      <Term k="timeline" />

      <div className={styles.track}>
        <Slider
          label="Scrub time"
          min={-SIM.scrubSeconds}
          max={0}
          step={30}
          value={-offset}
          onChange={(v) => actions.scrub(-v)}
          track={<Bands />}
        />
        <div className={styles.ticks} aria-hidden>
          <span>−4h</span>
          <span>−3h</span>
          <span>−2h</span>
          <span>−1h</span>
          <span>now</span>
        </div>
      </div>

      <ToggleGroup
        size="sm"
        label="Speed"
        className={styles.speed}
        value={String(speed)}
        onChange={(v) => actions.setSpeed(Number(v))}
        items={SPEEDS.map((s) => ({ value: String(s), label: `×${s}`, title: `${s}× real time` }))}
      />

      <button type="button" className={cx(styles.live, live && styles.isLive)} onClick={actions.goLive} disabled={live}>
        <span className={styles.liveDot} />
        Live
      </button>
    </div>
  )
}

/** Eclipse and SAA stretches of the selected cluster across the scrub window. */
function Bands() {
  const id = useApsis((s) => s.selectedId)
  const history = useApsis((s) => (id ? s.history[id] : undefined))
  useApsis((s) => s.version)
  if (!history?.length) return null
  const end = clock.head
  const start = end - SIM.scrubSeconds
  const runs: { kind: 'eclipse' | 'saa'; from: number; to: number }[] = []
  for (const kind of ['eclipse', 'saa'] as const) {
    let open: number | null = null
    for (const s of history) {
      if (s.t < start) continue
      const on = kind === 'eclipse' ? s.eclipse : s.inSaa
      if (on && open === null) open = s.t
      if (!on && open !== null) {
        runs.push({ kind, from: open, to: s.t })
        open = null
      }
    }
    if (open !== null) runs.push({ kind, from: open, to: end })
  }
  return (
    <>
      {runs.map((r, i) => (
        <span
          key={i}
          className={r.kind === 'eclipse' ? styles.eclipse : styles.saa}
          style={{ left: `${((r.from - start) / SIM.scrubSeconds) * 100}%`, width: `${((r.to - r.from) / SIM.scrubSeconds) * 100}%` }}
        />
      ))}
    </>
  )
}
