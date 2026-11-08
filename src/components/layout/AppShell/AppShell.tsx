import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Scene } from '@/components/scene/Scene'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { FleetSheet } from '@/components/sheet/FleetSheet'
import { ClusterSheet } from '@/components/sheet/ClusterSheet'
import { clusterById } from '@/sim/fleet'
import { actions, startSim, useApsis } from '@/store'
import { useHotkeys } from '@/lib/useHotkeys'
import { TopBar } from '../TopBar'
import { Timeline } from '../Timeline'
import { SidePanel } from '../SidePanel'
import { CommandPalette } from '../CommandPalette'
import styles from './AppShell.module.css'

/** The whole app: scene behind, top bar, the information sheet on the left, time at the bottom. */
export function AppShell() {
  const { id } = useParams()
  const navigate = useNavigate()
  const cluster = clusterById(id)
  const ready = useApsis((s) => s.ready)

  useEffect(() => startSim(), [])
  useEffect(() => useApsis.setState({ navigate: (p) => navigate(p) }), [navigate])

  // The URL is the selection.
  useEffect(() => {
    useApsis.setState({ selectedId: cluster?.id ?? null, focusPart: null, pickedPart: null })
    document.title = cluster ? `${cluster.code} ${cluster.name} · Apsis` : 'Apsis'
  }, [cluster])
  useEffect(() => {
    if (id && !cluster) navigate('/', { replace: true })
  }, [id, cluster, navigate])

  const keys = useMemo(
    () => ({
      'mod+k': (e: KeyboardEvent) => (e.preventDefault(), actions.setPalette(!useApsis.getState().paletteOpen)),
      escape: () => {
        const s = useApsis.getState()
        if (s.paletteOpen) return
        if (s.focusPart) actions.focusPart(null)
        else actions.select(null)
      },
      j: () => actions.cycle(1),
      k: () => actions.cycle(-1),
      '1': () => actions.setLens('output'),
      '2': () => actions.setLens('thermal'),
      '3': () => actions.setLens('faults'),
      space: (e: KeyboardEvent) => {
        if ((e.target as HTMLElement).closest('button, [role="slider"]')) return
        e.preventDefault()
        actions.togglePlay()
      },
      f: () => actions.toggleFollow(),
    }),
    [],
  )
  useHotkeys(keys)

  return (
    <TooltipProvider delayDuration={300}>
      <div className={styles.shell}>
        <Scene />
        <TopBar />
        <SidePanel viewKey={cluster?.id ?? 'fleet'} label={cluster ? `${cluster.name} details` : 'Fleet'}>
          {!ready ? <div className={styles.loading}>Acquiring telemetry…</div> : cluster ? <ClusterSheet cluster={cluster} /> : <FleetSheet />}
        </SidePanel>
        <div className={styles.timeline}>
          <Timeline />
        </div>
        <Hint />
        <CommandPalette />
      </div>
    </TooltipProvider>
  )
}

function Hint() {
  const selected = useApsis((s) => s.selectedId)
  return (
    <p className={styles.hint} aria-hidden>
      {selected ? 'Drag to look around · scroll to zoom · hover a part' : 'Click a cluster to focus · drag to orbit · ⌘K to search'}
    </p>
  )
}
