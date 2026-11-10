import { useListFactories } from '@/api'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Kbd } from '@/components/ui/Kbd'
import { Select } from '@/components/ui/Select'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { Tooltip } from '@/components/ui/Tooltip'
import { LENSES, useLens } from '@/lib/lens'
import { STATIC } from '@/lib/live'
import { useSelection } from '@/lib/selection'
import { useTheme } from '@/lib/theme'
import styles from './TopBar.module.css'

export function TopBar({ onSearch }: { onSearch: () => void }) {
  const { factoryId, openFactory } = useSelection()
  const factories = useListFactories({ query: STATIC }).data ?? []
  const [lens, setLens] = useLens()
  const [theme, toggleTheme] = useTheme()

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden />
        <span className={styles.name}>Linewatch</span>
      </div>

      <Select
        label="Factory"
        value={factories.some((f) => f.id === factoryId) ? factoryId : undefined}
        onChange={openFactory}
        options={factories.map((f) => ({ value: f.id, label: f.name, hint: f.location }))}
        icon={<Icon name="factory" size={15} />}
        className={styles.factory}
      />

      <button type="button" className={styles.search} onClick={onSearch} aria-label="Search carriers and payloads">
        <Icon name="search" size={15} />
        <span className={styles.searchText}>Search carriers, payloads…</span>
        <span className={styles.searchKey}>
          <Kbd>⌘K</Kbd>
        </span>
      </button>

      <div className={styles.end}>
        <ToggleGroup
          label="Lens"
          value={lens}
          onChange={setLens}
          items={LENSES.map((l) => ({
            value: l.value,
            title: `${l.label}: ${l.hint}`,
            label: (
              <>
                <Icon name={l.icon} size={15} />
                <span className={styles.lensLabel}>{l.label}</span>
              </>
            ),
          }))}
        />
        <Tooltip content={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </Button>
        </Tooltip>
      </div>
    </header>
  )
}
