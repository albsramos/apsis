/**
 * Sanity checks for the simulation (npm run sim:check). Runs the engine in Node and asserts the
 * stories the UI relies on: dawn-dusk clusters stay in sunlight, KO-5's pump loses thermal margin,
 * radiation upsets cluster in the South Atlantic Anomaly.
 */
import { Engine } from '../src/sim/engine'
import { SIM } from '../src/sim/fleet'

const engine = new Engine()
const hist = engine.advance(0)
let failed = 0
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failed++
}
const verbose = process.argv.includes('-v')

for (const [id, samples] of Object.entries(hist)) {
  const ecl = samples.filter((s) => s.eclipse).length / samples.length
  const loop = samples.map((s) => s.loopC)
  const maxMod = samples.map((s) => Math.max(...s.modulesC))
  const last = samples[samples.length - 1]
  if (verbose)
    console.log(
      id.padEnd(5),
      `eclipse ${(ecl * 100).toFixed(0)}%`.padEnd(13),
      `loop ${Math.min(...loop).toFixed(1)}…${Math.max(...loop).toFixed(1)}`.padEnd(18),
      `mod ${Math.min(...maxMod).toFixed(1)}…${Math.max(...maxMod).toFixed(1)}`.padEnd(17),
      `soc ${Math.min(...samples.map((s) => s.soc)).toFixed(2)}`,
      `heater ${Math.max(...samples.map((s) => s.heaterKw)).toFixed(0)}kW`,
      `out ${last.outputPf.toFixed(0)}PF`,
      `status ${last.status}`,
      last.faults.map((f) => f.title).join(' | '),
    )
}

const ecl = (id: string) => hist[id].filter((s) => s.eclipse).length / hist[id].length
check(ecl('ko-1') < 0.01 && ecl('ko-2') < 0.01, 'dawn-dusk clusters (KO-1, KO-2) are never in eclipse')
check(ecl('ko-3') > 0.25, 'KO-3 at 53° spends over a quarter of its time in shadow')

const k5 = hist['ko-5']
const margin = (from: number, to: number) => {
  const xs = k5.slice(Math.floor(k5.length * from), Math.floor(k5.length * to))
  return xs.reduce((a, s) => a + SIM.moduleLimitC - Math.max(...s.modulesC), 0) / xs.length
}
check(margin(0.85, 1) < margin(0.15, 0.4) - 3, 'KO-5 pump fault shrinks thermal margin')

const all = Object.values(hist).flat()
const saa = all.filter((s) => s.inSaa)
const out = all.filter((s) => !s.inSaa)
const rate = (xs: typeof all) => xs.reduce((a, s) => a + s.seuPerMin, 0) / xs.length
check(saa.length > 0 && rate(saa) > 5 * rate(out), 'SEU rate is much higher inside the SAA')

const statuses = Object.fromEntries(Object.entries(engine.head()).map(([id, s]) => [id, s.status]))
check(statuses['ko-5'] !== 'nominal' && statuses['ko-1'] === 'nominal', 'the fleet opens with a story: KO-5 in trouble, KO-1 calm')

process.exit(failed ? 1 : 0)
