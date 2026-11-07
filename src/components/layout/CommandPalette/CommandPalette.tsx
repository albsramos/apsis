import { Command } from 'cmdk'
import { Dialog } from 'radix-ui'
import { Icon } from '@/components/ui/Icon'
import { StatusDot } from '@/components/ui/StatusDot'
import { Kbd } from '@/components/ui/Kbd'
import { FLEET } from '@/sim/fleet'
import { actions, useApsis } from '@/store'
import { LENSES } from '../TopBar'
import styles from './CommandPalette.module.css'

/** ⌘K: jump to any cluster or fault, switch lens, control time. */
export function CommandPalette() {
  const open = useApsis((s) => s.paletteOpen)
  const head = useApsis((s) => s.head)
  const playing = useApsis((s) => s.playing)
  const run = (fn: () => void) => () => {
    actions.setPalette(false)
    fn()
  }
  const faults = FLEET.flatMap((c) => (head[c.id]?.faults ?? []).map((f) => ({ c, f })))

  return (
    <Command.Dialog
      open={open}
      onOpenChange={actions.setPalette}
      label="Command menu"
      overlayClassName={styles.overlay}
      contentClassName={styles.content}
      className={styles.command}
    >
      <Dialog.Title className={styles.srOnly}>Command menu</Dialog.Title>
      <div className={styles.inputRow}>
        <Icon name="search" size={16} />
        <Command.Input className={styles.input} placeholder="Search clusters, faults, actions…" />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className={styles.list}>
        <Command.Empty className={styles.empty}>Nothing matches.</Command.Empty>

        <Command.Group heading="Clusters" className={styles.group}>
          {FLEET.map((c) => {
            const s = head[c.id]
            return (
              <Command.Item key={c.id} value={`${c.code} ${c.name} ${c.role} ${c.orbit.label}`} onSelect={run(() => actions.select(c.id))} className={styles.item}>
                {s && <StatusDot status={s.status} />}
                <span className={styles.main}>
                  <span className={styles.code}>{c.code}</span> {c.name}
                </span>
                <span className={styles.meta}>{c.orbit.label}</span>
              </Command.Item>
            )
          })}
        </Command.Group>

        {faults.length > 0 && (
          <Command.Group heading="Faults" className={styles.group}>
            {faults.map(({ c, f }) => (
              <Command.Item
                key={f.id}
                value={`${f.title} ${c.code} ${c.name} fault`}
                onSelect={run(() => {
                  actions.select(c.id)
                  setTimeout(() => actions.focusPart({ clusterId: c.id, part: f.part }), 1800)
                })}
                className={styles.item}
              >
                <Icon name="alert" size={14} className={styles[f.severity]} />
                <span className={styles.main}>{f.title}</span>
                <span className={styles.meta}>{c.code}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Lens" className={styles.group}>
          {LENSES.map((l) => (
            <Command.Item key={l.value} value={`lens ${l.label} ${l.hint}`} onSelect={run(() => actions.setLens(l.value))} className={styles.item}>
              <Icon name={l.icon} size={14} />
              <span className={styles.main}>{l.label} lens</span>
              <Kbd>{l.key}</Kbd>
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Time" className={styles.group}>
          <Command.Item value="play pause time" onSelect={run(actions.togglePlay)} className={styles.item}>
            <Icon name={playing ? 'pause' : 'play'} size={14} />
            <span className={styles.main}>{playing ? 'Pause' : 'Play'}</span>
            <Kbd>Space</Kbd>
          </Command.Item>
          <Command.Item value="go live now" onSelect={run(actions.goLive)} className={styles.item}>
            <Icon name="live" size={14} />
            <span className={styles.main}>Back to live</span>
          </Command.Item>
          {[1, 60, 600].map((x) => (
            <Command.Item key={x} value={`speed ${x}x`} onSelect={run(() => actions.setSpeed(x))} className={styles.item}>
              <Icon name="orbit" size={14} />
              <span className={styles.main}>Speed ×{x}</span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
