import { useEffect, useState } from 'react'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { LensLegend } from '@/components/layout/LensLegend'
import { TopBar } from '@/components/layout/TopBar'
import { LineMap } from '@/components/map/LineMap'
import { CarrierSheet } from '@/components/sheet/CarrierSheet'
import { FactorySheet } from '@/components/sheet/FactorySheet'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { useSelection } from '@/lib/selection'
import styles from './AppShell.module.css'

/** One map, one sheet, one selection. The sheet shows the factory, or the carrier the URL names. */
export function AppShell() {
  const { carrierId } = useSelection()
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearching((s) => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <TooltipProvider delayDuration={300}>
      <div className={styles.shell}>
        <TopBar onSearch={() => setSearching(true)} />
        <div className={styles.body}>
          <aside className={styles.sheet} aria-label={carrierId ? 'Carrier' : 'Factory'}>
            <ScrollArea className={styles.scroll}>{carrierId ? <CarrierSheet key={carrierId} /> : <FactorySheet />}</ScrollArea>
          </aside>
          <main className={styles.stage}>
            <div className={styles.map}>
              <LineMap />
            </div>
            <div className={styles.legend}>
              <LensLegend />
            </div>
          </main>
        </div>
        <CommandPalette open={searching} onOpenChange={setSearching} />
      </div>
    </TooltipProvider>
  )
}
