import { StatTile } from '@/components/ui/StatTile'
import { Sparkline } from '@/components/ui/Sparkline'
import { SIM } from '@/sim/fleet'
import type { ClusterConfig, ClusterSample } from '@/sim/types'
import { useApsis } from '@/store'
import { fmt } from '@/lib/format'
import styles from './Vitals.module.css'

/** The four numbers that answer "is it OK?", each with its last hour. */
export function Vitals({ cluster, sample }: { cluster: ClusterConfig; sample: ClusterSample }) {
  useApsis((s) => s.version)
  const view = useApsis((s) => s.viewTime)
  const hist = useApsis((s) => s.history[cluster.id]).filter((s) => s.t <= view && s.t > view - 3600)
  const margin = SIM.moduleLimitC - Math.max(...sample.modulesC)
  const power = sample.genKw - sample.drawKw
  return (
    <div className={styles.grid}>
      <StatTile
        label="Output"
        value={fmt.pf(sample.outputPf)}
        hint={sample.throttle < 0.97 ? `throttled −${fmt.pct(1 - sample.throttle)}` : 'FP8 petaflops'}
        tone={sample.throttle < 0.97 ? 'danger' : undefined}
        chart={<Sparkline values={hist.map((s) => s.outputPf)} />}
      />
      <StatTile
        label="Utilisation"
        value={fmt.pct(sample.itKw / cluster.capacityKw)}
        hint={`${fmt.kw(sample.itKw)} of ${fmt.kw(cluster.capacityKw)}`}
        chart={<Sparkline values={hist.map((s) => s.itKw / cluster.capacityKw)} />}
      />
      <StatTile
        label="Power margin"
        value={fmt.signedKw(power)}
        hint={sample.eclipse ? `on battery · ${fmt.pct(sample.soc)}` : `charging · ${fmt.pct(sample.soc)}`}
        tone={sample.soc < 0.3 ? 'warn' : undefined}
        chart={<Sparkline values={hist.map((s) => s.genKw - s.drawKw)} />}
      />
      <StatTile
        label="Thermal margin"
        value={`${margin.toFixed(1)}°C`}
        hint={`hottest module · limit ${SIM.moduleLimitC}°C`}
        tone={margin < 2.5 ? 'danger' : margin < 6 ? 'warn' : undefined}
        chart={<Sparkline values={hist.map((s) => SIM.moduleLimitC - Math.max(...s.modulesC))} />}
      />
    </div>
  )
}
