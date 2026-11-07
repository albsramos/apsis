import { ClusterSim } from './cluster'
import { FLEET, SIM } from './fleet'
import type { ClusterSample } from './types'

/** The whole fleet, stepped together. Runs in the worker; the sanity script runs it in Node too. */
export class Engine {
  readonly sims = FLEET.map((cfg, i) => new ClusterSim(cfg, 1337 + i * 7919))
  t = -SIM.historySeconds
  private nextSample = -SIM.historySeconds

  /** Step to `to`, returning the samples recorded on the way, per cluster. */
  advance(to: number): Record<string, ClusterSample[]> {
    const out: Record<string, ClusterSample[]> = Object.fromEntries(FLEET.map((c) => [c.id, []]))
    while (this.t < to) {
      const dt = Math.min(SIM.dt, to - this.t)
      this.t += dt
      for (const sim of this.sims) sim.step(this.t, dt)
      if (this.t >= this.nextSample) {
        this.nextSample += SIM.sampleEvery
        for (const sim of this.sims) out[sim.cfg.id].push(sim.sample!)
      }
    }
    return out
  }

  head(): Record<string, ClusterSample> {
    return Object.fromEntries(this.sims.map((s) => [s.cfg.id, s.sample!]))
  }
}
