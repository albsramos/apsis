/// <reference lib="webworker" />
import { Engine } from './engine'
import type { WorkerIn, WorkerOut } from './types'

const engine = new Engine()
const post = (msg: WorkerOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg)

// Pre-simulate the history so the charts are full on first paint.
const history = engine.advance(0)
post({ type: 'init', head: engine.head(), history })

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  if (e.data.type === 'advance' && e.data.to > engine.t) {
    const appended = engine.advance(e.data.to)
    post({ type: 'tick', head: engine.head(), appended })
  }
}
