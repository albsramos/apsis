import { ApiRequestError } from '@/api/http'
import { austin } from './layouts/austin'
import type { FactoryDef } from './layouts/build'
import { shanghai } from './layouts/shanghai'
import { LineSim } from './sim'

/**
 * The backend, for now: answers the routes in api/openapi.yaml from a simulation running in the browser.
 * Its return values are typed by the generated models, so it cannot drift from the contract.
 */
const DEFS: FactoryDef[] = [austin, shanghai]
const sims = new Map<string, LineSim>()

function simFor(factoryId: string): { def: FactoryDef; sim: LineSim } {
  const def = DEFS.find((d) => d.factory.id === factoryId)
  if (!def) throw new ApiRequestError(404, `No factory "${factoryId}"`)
  let sim = sims.get(factoryId)
  if (!sim) sims.set(factoryId, (sim = new LineSim(def)))
  sim.advance()
  return { def, sim }
}

function route(path: string): unknown {
  const [root, factoryId, resource, id] = path.split('/').filter(Boolean)
  if (root !== 'factories') throw new ApiRequestError(404, `No route ${path}`)
  if (!factoryId) return DEFS.map((d) => d.factory)
  const { def, sim } = simFor(decodeURIComponent(factoryId))
  switch (resource) {
    case 'layout':
      return def.layout
    case 'stats':
      return sim.getStats()
    case 'issues':
      return sim.listIssues()
    case 'carriers': {
      if (!id) return sim.listCarriers()
      const carrier = sim.getCarrier(decodeURIComponent(id))
      if (!carrier) throw new ApiRequestError(404, `No carrier "${id}"`)
      return carrier
    }
  }
  throw new ApiRequestError(404, `No route ${path}`)
}

export async function mockFetch<T>(url: string, options?: RequestInit): Promise<T> {
  await new Promise((r) => setTimeout(r, 60))
  options?.signal?.throwIfAborted()
  const path = new URL(url, 'http://mock').pathname.replace(/^\/api/, '')
  return structuredClone(route(path)) as T
}
