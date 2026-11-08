import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { Kbd } from '@/components/ui/Kbd'
import { ScrollArea } from '@/components/ui/ScrollArea'
import { Section } from '@/components/ui/Section'
import { STATUS_LABEL, StatusDot } from '@/components/ui/StatusDot'
import { Term } from '@/components/ui/Term'
import { Tooltip } from '@/components/ui/Tooltip'
import type { GlossaryKey } from '@/lib/glossary'
import { Vitals } from '../Vitals'
import { ThermalChart, thermalSpan } from '../ThermalChart'
import { FaultList } from '../FaultList'
import { ModuleGrid } from '../ModuleGrid'
import { OrbitCard } from '../OrbitCard'
import { betaDeg } from '@/sim/orbit'
import { LIMITS } from '@/sim/faults'
import type { ClusterConfig } from '@/sim/types'
import { actions, useApsis, useTelemetry } from '@/store'
import { duration, fmt } from '@/lib/format'
import { cx } from '@/lib/cx'
import styles from './ClusterSheet.module.css'

const TONE = { nominal: 'success', degraded: 'warn', critical: 'danger' } as const

/** One cluster in detail. Opens when a cluster is selected; Esc goes back to the fleet. */
export function ClusterSheet({ cluster }: { cluster: ClusterConfig }) {
  const s = useTelemetry(cluster.id)
  const follow = useApsis((st) => st.follow)
  if (!s) return null
  const loud = s.faults.filter((f) => f.severity !== 'info').length
  return (
    <>
      <header className={styles.header}>
        <div className={styles.nav}>
          <button type="button" className={styles.back} onClick={() => actions.select(null)}>
            <Icon name="back" size={14} /> Fleet <Kbd>Esc</Kbd>
          </button>
          <div className={styles.navRight}>
            <Tooltip content={<>Previous / next cluster <Kbd>J</Kbd> <Kbd>K</Kbd></>}>
              <span className={styles.stepper}>
                <button type="button" onClick={() => actions.cycle(-1)} aria-label="Previous cluster">
                  <Icon name="back" size={14} />
                </button>
                <button type="button" onClick={() => actions.cycle(1)} aria-label="Next cluster">
                  <Icon name="chevron" size={14} />
                </button>
              </span>
            </Tooltip>
            <Tooltip content={<>Ride along with the cluster <Kbd>F</Kbd></>}>
              <button type="button" className={cx(styles.follow, follow && styles.on)} onClick={actions.toggleFollow} aria-pressed={follow}>
                <Icon name="follow" size={14} /> Follow
              </button>
            </Tooltip>
          </div>
        </div>
        <div className={styles.titleRow}>
          <StatusDot status={s.status} size={10} />
          <h2 className={styles.title}>
            <span className={styles.code}>{cluster.code}</span> {cluster.name}
          </h2>
        </div>
        <div className={styles.meta}>
          <Term k="clusterStatus">
            <Badge tone={TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
          </Term>
          <span>{cluster.role}</span>
          <span>{cluster.orbit.label}</span>
          <Term k="sunlit">
            <span className={styles.sun}>
              <Icon name={s.eclipse ? 'moon' : 'sun'} size={12} />
              {/* Both labels share one grid cell so the row never changes width */}
              <span className={styles.swap}>
                <span aria-hidden={s.eclipse} className={s.eclipse ? styles.off : undefined}>Sunlit</span>
                <span aria-hidden={!s.eclipse} className={s.eclipse ? undefined : styles.off}>In shadow</span>
              </span>
            </span>
          </Term>
        </div>
      </header>

      <ScrollArea className={styles.scroll}>
        <div className={styles.vitals}>
          <Vitals cluster={cluster} sample={s} />
        </div>

        <Section title="Faults" info="faults" aside={<span>{loud ? `${loud} need attention` : `${s.faults.length} notices`}</span>}>
          <FaultList sample={s} />
        </Section>

        <Section title="Thermal regulation" info="thermal" aside={<span>{thermalLabel(cluster)}</span>}>
          <ThermalChart cluster={cluster} />
          <div className={styles.stats}>
            <Stat k="Coolant loop" info="loopTemp" v={fmt.temp(s.loopC)} />
            <Stat k="Pump flow" info="pumpFlow" v={fmt.pct(s.flow)} warn={s.flow < LIMITS.pumpWarn} />
            <Stat k="Heaters" info="heaters" v={s.heaterKw > 0.5 ? `${fmt.kw(s.heaterKw)} · ${fmt.pct(s.heaterKw / cluster.maxHeaterKw)}` : 'off'} />
            <Stat k="Beta angle" info="betaAngle" v={`${betaDeg(cluster.orbit).toFixed(0)}°`} />
            <Stat k="Radiation" info="radiation" v={`${s.seuPerMin.toFixed(1)} SEU/min${s.inSaa ? ' · SAA' : ''}`} />
            <Stat k="Battery" info="battery" v={fmt.pct(s.soc)} warn={s.soc < LIMITS.batteryWarn} />
          </div>
        </Section>

        <Section title="Parts" info="parts" aside={<span>click to inspect</span>}>
          <ModuleGrid clusterId={cluster.id} sample={s} />
        </Section>

        <Section title="Orbit" info="orbit">
          <OrbitCard cluster={cluster} />
        </Section>
      </ScrollArea>
    </>
  )
}

function thermalLabel(cluster: ClusterConfig) {
  const { span, orbits } = thermalSpan(cluster)
  return `last ${orbits < 2.95 ? duration(span) : '3 orbits'}`
}

function Stat({ k, v, warn, info }: { k: string; v: string; warn?: boolean; info: GlossaryKey }) {
  return (
    <div className={styles.stat}>
      <Term k={info}>{k}</Term>
      <span className={cx(styles.statValue, warn && styles.statWarn)}>{v}</span>
    </div>
  )
}
