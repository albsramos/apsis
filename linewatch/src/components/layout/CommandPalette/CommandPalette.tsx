import { Command } from 'cmdk'
import { Dialog } from 'radix-ui'
import { useListCarriers, useListFactories, useListIssues } from '@/api'
import { Icon } from '@/components/ui/Icon'
import { Kbd } from '@/components/ui/Kbd'
import { StatusDot } from '@/components/ui/StatusDot'
import { PAYLOAD_LABEL } from '@/lib/format'
import { LENSES, useLens } from '@/lib/lens'
import { STATIC } from '@/lib/live'
import { useSelection } from '@/lib/selection'
import styles from './CommandPalette.module.css'

/** ⌘K: jump to a carrier by its ID or its payload's serial, to an open issue, to another factory, or switch lens. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { factoryId, select, openFactory } = useSelection()
  const [, setLens] = useLens()
  const factories = useListFactories({ query: STATIC }).data ?? []
  // Read once when the palette opens: a list that reorders under the cursor is hard to pick from.
  const carriers = useListCarriers(factoryId, { query: { enabled: open } }).data ?? []
  const issues = useListIssues(factoryId, { query: { enabled: open } }).data ?? []
  const run = (fn: () => void) => () => {
    onOpenChange(false)
    fn()
  }

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Search" overlayClassName={styles.overlay} contentClassName={styles.content} className={styles.command}>
      <Dialog.Title className={styles.srOnly}>Search</Dialog.Title>
      <Dialog.Description className={styles.srOnly}>Find a carrier, a payload, an issue or a factory.</Dialog.Description>
      <div className={styles.inputRow}>
        <Icon name="search" size={16} />
        <Command.Input className={styles.input} placeholder="Carrier ID, payload serial, issue…" />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className={styles.list}>
        <Command.Empty className={styles.empty}>Nothing matches.</Command.Empty>

        {issues.length > 0 && (
          <Command.Group heading="Needs attention" className={styles.group}>
            {issues.map((i) => (
              <Command.Item key={i.id} value={`${i.title} ${i.carrierId} ${i.location} ${i.id}`} onSelect={run(() => select(i.carrierId))} className={styles.item}>
                <StatusDot status={i.severity} />
                <span className={styles.main}>{i.title}</span>
                <span className={styles.meta}>{i.carrierId}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Carriers" className={styles.group}>
          {carriers.map((c) => (
            <Command.Item
              key={c.id}
              value={`${c.id} ${c.payloadId ?? 'empty'} ${c.payloadType ? PAYLOAD_LABEL[c.payloadType] : ''}`}
              onSelect={run(() => select(c.id))}
              className={styles.item}
            >
              <StatusDot status={c.status} />
              <span className={styles.main}>
                <span className={styles.code}>{c.id}</span>
              </span>
              <span className={styles.meta}>{c.payloadType ? `${PAYLOAD_LABEL[c.payloadType]} · ${c.payloadId}` : 'Empty'}</span>
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Factories" className={styles.group}>
          {factories.map((f) => (
            <Command.Item key={f.id} value={`factory ${f.name} ${f.location}`} onSelect={run(() => openFactory(f.id))} className={styles.item}>
              <Icon name="factory" size={14} />
              <span className={styles.main}>{f.name}</span>
              <span className={styles.meta}>{f.location}</span>
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Lens" className={styles.group}>
          {LENSES.map((l) => (
            <Command.Item key={l.value} value={`lens ${l.label} ${l.hint}`} onSelect={run(() => setLens(l.value))} className={styles.item}>
              <Icon name={l.icon} size={14} />
              <span className={styles.main}>{l.label} lens</span>
              <span className={styles.meta}>{l.hint}</span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
