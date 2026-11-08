import { create } from 'zustand'
import { FLEET, SIM } from '@/sim/fleet'
import type { ClusterSample, Lens, PartRef } from '@/sim/types'

/**
 * Per-frame values (the sim clock) live in `clock`, a plain object the scene reads inside useFrame.
 * React state here changes at most 4× a second (telemetry) or on user input (selection, lens, hover),
 * so the 3D scene never waits on a React render.
 */
export const clock = {
  /** Sim time at the head of the simulation */
  head: 0,
  /** How far the view is scrubbed back from the head, seconds (0 = live) */
  offset: 0,
  playing: true,
  speed: 60,
  view() {
    return this.head - this.offset
  },
}

export interface PartHover {
  clusterId: string
  part: PartRef
}

interface State {
  ready: boolean
  head: Record<string, ClusterSample>
  /** Mutable, appended in place; `version` changes when it does */
  history: Record<string, ClusterSample[]>
  version: number
  viewTime: number
  offset: number
  playing: boolean
  speed: number

  lens: Lens
  selectedId: string | null
  hoverId: string | null
  hoverPart: PartHover | null
  /** A part the camera should look at (set by clicking a fault or a module tile) */
  focusPart: PartHover | null
  /** A part picked in the scene, so the sheet can highlight its row */
  pickedPart: PartHover | null
  follow: boolean
  paletteOpen: boolean
  drawerOpen: boolean
  /** Explain mode: every section and number shows what it measures, inline */
  explain: boolean
  navigate: ((path: string) => void) | null
}

export const useApsis = create<State>(() => ({
  ready: false,
  head: {},
  history: Object.fromEntries(FLEET.map((c) => [c.id, []])),
  version: 0,
  viewTime: 0,
  offset: 0,
  playing: true,
  speed: 60,

  lens: 'thermal',
  selectedId: null,
  hoverId: null,
  hoverPart: null,
  focusPart: null,
  pickedPart: null,
  follow: true,
  paletteOpen: false,
  drawerOpen: false,
  explain: false,
  navigate: null,
}))

const set = useApsis.setState
const get = useApsis.getState

export const actions = {
  setLens: (lens: Lens) => set({ lens }),
  select(id: string | null) {
    const nav = get().navigate
    if (nav) nav(id ? `/cluster/${id}` : '/')
  },
  cycle(dir: 1 | -1) {
    const ids = FLEET.map((c) => c.id)
    const cur = get().selectedId
    const i = cur ? ids.indexOf(cur) : dir === 1 ? -1 : 0
    actions.select(ids[(i + dir + ids.length) % ids.length])
  },
  setHover: (hoverId: string | null) => get().hoverId !== hoverId && set({ hoverId }),
  setHoverPart: (hoverPart: PartHover | null) => set({ hoverPart }),
  focusPart: (focusPart: PartHover | null) => set({ focusPart, pickedPart: focusPart }),
  pickPart: (pickedPart: PartHover | null) => set({ pickedPart }),
  toggleFollow: () => set({ follow: !get().follow }),
  togglePlay() {
    clock.playing = !clock.playing
    set({ playing: clock.playing })
  },
  setSpeed(speed: number) {
    clock.speed = speed
    set({ speed })
  },
  scrub(offset: number) {
    clock.offset = Math.max(0, Math.min(SIM.scrubSeconds, offset))
    set({ offset: clock.offset, viewTime: clock.view() })
  },
  goLive: () => actions.scrub(0),
  setPalette: (paletteOpen: boolean) => set({ paletteOpen }),
  setDrawer: (drawerOpen: boolean) => set({ drawerOpen }),
  toggleExplain: () => set({ explain: !get().explain }),
}

/** The newest history sample at or before `t` (binary search). */
export function sampleAt(samples: ClusterSample[], t: number): ClusterSample | undefined {
  let lo = 0
  let hi = samples.length - 1
  if (hi < 0 || samples[0].t > t) return samples[0]
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (samples[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  return samples[lo]
}

/** Telemetry for a cluster at the current view time: the head when live, history when scrubbed. */
export function telemetry(id: string): ClusterSample | undefined {
  const s = get()
  if (s.offset < SIM.sampleEvery) return s.head[id]
  return sampleAt(s.history[id] ?? [], s.viewTime)
}

/** React hook form of `telemetry`; re-renders on each sim tick. */
export function useTelemetry(id: string | null | undefined) {
  useApsis((s) => s.version)
  useApsis((s) => s.offset)
  return id ? telemetry(id) : undefined
}
