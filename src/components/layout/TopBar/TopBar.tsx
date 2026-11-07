import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { Icon } from '@/components/ui/Icon'
import { Kbd } from '@/components/ui/Kbd'
import { Tooltip } from '@/components/ui/Tooltip'
import { actions, useApsis } from '@/store'
import type { Lens } from '@/sim/types'
import { utc } from '@/lib/format'
import { cx } from '@/lib/cx'
import styles from './TopBar.module.css'

export const LENSES: { value: Lens; label: string; icon: 'bolt' | 'thermo' | 'alert'; key: string; hint: string }[] = [
  { value: 'output', label: 'Output', icon: 'bolt', key: '1', hint: 'Compute throughput and power' },
  { value: 'thermal', label: 'Thermal', icon: 'thermo', key: '2', hint: 'Heat: modules, coolant, radiators' },
  { value: 'faults', label: 'Faults', icon: 'alert', key: '3', hint: 'Anything degraded or failing' },
]

export function TopBar() {
  const lens = useApsis((s) => s.lens)
  return (
    <header className={styles.bar}>
      <a className={styles.brand} href="/" onClick={(e) => (e.preventDefault(), actions.select(null))}>
        <Logo />
        <span className={styles.name}>Apsis</span>
        <span className={styles.company}>Kestrel Orbital</span>
      </a>

      <ToggleGroup
        className={styles.lenses}
        label="Lens"
        value={lens}
        onChange={actions.setLens}
        items={LENSES.map((l) => ({
          value: l.value,
          title: `${l.label} lens (${l.key}): ${l.hint}`,
          label: (
            <>
              <Icon name={l.icon} size={14} />
              <span className={styles.lensLabel}>{l.label}</span>
            </>
          ),
        }))}
      />

      <div className={styles.right}>
        <Tooltip content={<>Jump to a cluster or fault <Kbd>⌘K</Kbd></>}>
          <button type="button" className={styles.search} onClick={() => actions.setPalette(true)}>
            <Icon name="search" size={14} />
            <span className={styles.searchLabel}>Search fleet…</span>
            <span className={styles.searchKbd}>
              <Kbd>⌘K</Kbd>
            </span>
          </button>
        </Tooltip>
        <Clock />
      </div>
    </header>
  )
}

function Clock() {
  const view = useApsis((s) => s.viewTime)
  const offset = useApsis((s) => s.offset)
  const playing = useApsis((s) => s.playing)
  const { time } = utc(view)
  const live = offset < 30 && playing
  return (
    <div className={styles.clock}>
      <span className={cx(styles.liveDot, live && styles.isLive)} />
      <span className={styles.time}>{time}</span>
      <span className={styles.utc}>UTC</span>
    </div>
  )
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden className={styles.logo}>
      <ellipse cx="16" cy="16" rx="12.5" ry="5.5" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.6" transform="rotate(-24 16 16)" />
      <circle cx="16" cy="16" r="5" fill="currentColor" />
      <circle cx="26.6" cy="11.2" r="2.4" fill="var(--viz-active)" />
    </svg>
  )
}
