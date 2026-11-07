import { SIM } from '@/sim/fleet'
import type { WorkerIn, WorkerOut } from '@/sim/types'
import { clock, useApsis } from './useApsis'

const TICK_MS = 250
const MAX_HISTORY = Math.ceil(SIM.historySeconds / SIM.sampleEvery)

/**
 * Starts the simulation worker and the clock. The clock advances every animation frame; four times a
 * second the worker is asked to catch up and sends back fresh telemetry. Returns a stop function.
 */
export function startSim() {
  const worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' })
  let raf = 0
  let last = performance.now()
  let lastTick = 0
  let busy = true

  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const msg = e.data
    const state = useApsis.getState()
    if (msg.type === 'init') {
      useApsis.setState({ ready: true, head: msg.head, history: msg.history, version: state.version + 1, viewTime: clock.view() })
    } else {
      for (const [id, samples] of Object.entries(msg.appended)) {
        const arr = state.history[id]
        arr.push(...samples)
        if (arr.length > MAX_HISTORY) arr.splice(0, arr.length - MAX_HISTORY)
      }
      useApsis.setState({ head: msg.head, version: state.version + 1, viewTime: clock.view() })
    }
    busy = false
  }

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (clock.playing) clock.head += dt * clock.speed
    if (!busy && now - lastTick > TICK_MS) {
      lastTick = now
      busy = true
      worker.postMessage({ type: 'advance', to: clock.head } satisfies WorkerIn)
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return () => {
    cancelAnimationFrame(raf)
    worker.terminate()
  }
}
