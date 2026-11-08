import { StatTile } from '@/components/ui/StatTile'
import { Sparkline } from '@/components/ui/Sparkline'
import { SIM } from '@/sim/fleet'
import { LIMITS } from '@/sim/faults'
import type { ClusterConfig, ClusterSample } from '@/sim/types'
import { useApsis } from '@/store'
import { fmt, range } from '@/lib/format'
import styles from './Vitals.module.css'

/** The four numbers that answer "is it OK?", each with its last hour. */
export function Vitals({ cluster, sample }: { cluster: ClusterConfig; sample: ClusterSample }) {
  useApsis((s) => s.version)
  const view = useApsis((s) => s.viewTime)
  const hist = useApsis((s) => s.history[cluster.id]).filter((s) => s.t <= view && s.t > view - 3600)
  const margin = SIM.moduleLimitC - Math.max(...sample.modulesC)
  const power = sample.genKw - sample.drawKw
  const output = hist.map((s) => s.outputPf)
  const util = hist.map((s) => s.itKw / cluster.capacityKw)
  const powers = hist.map((s) => s.genKw - s.drawKw)
  const margins = hist.map((s) => SIM.moduleLimitC - Math.max(...s.modulesC))
  const deg = (x: number) => `${x.toFixed(1)}°C`
  return (
    <div className={styles.grid}>
      <StatTile
        label="Output"
        info="output"
        value={fmt.pf(sample.outputPf)}
        hint={sample.throttle < LIMITS.throttled ? `throttled −${fmt.pct(1 - sample.throttle)}` : 'FP8 petaflops'}
        tone={sample.throttle < LIMITS.throttled ? 'danger' : undefined}
        chart={<Sparkline values={output} />}
        axis={{ from: '−1h', range: range(output, fmt.pf) }}
      />
      <StatTile
        label="Utilisation"
        info="utilisation"
        value={fmt.pct(sample.itKw / cluster.capacityKw)}
        hint={`${fmt.kw(sample.itKw)} of ${fmt.kw(cluster.capacityKw)} IT load`}
        chart={<Sparkline values={util} />}
        axis={{ from: '−1h', range: range(util, fmt.pct) }}
      />
      <StatTile
        label="Power margin"
        info="powerMargin"
        value={fmt.signedKw(power)}
        hint={`${power >= 0 ? 'charging' : 'draining'} · battery ${fmt.pct(sample.soc)}`}
        tone={sample.soc < LIMITS.batteryWarn ? 'warn' : undefined}
        chart={<Sparkline values={powers} />}
        axis={{ from: '−1h', range: range(powers, fmt.signedKw) }}
      />
      <StatTile
        label="Thermal margin"
        info="thermalMargin"
        value={`${margin.toFixed(1)}°C`}
        hint={`under the ${SIM.moduleLimitC}°C module limit`}
        tone={margin < LIMITS.marginCritical ? 'danger' : margin < LIMITS.marginWarn ? 'warn' : undefined}
        chart={<Sparkline values={margins} />}
        axis={{ from: '−1h', range: range(margins, deg) }}
      />
    </div>
  )
}
