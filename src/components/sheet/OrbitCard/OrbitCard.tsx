import { useMemo } from 'react'
import { GROUND_STATIONS } from '@/sim/fleet'
import { betaDeg, centralAngleDeg, footprintDeg, inSaa, isEclipsed, periodS, subSatellite, velocityKms } from '@/sim/orbit'
import type { ClusterConfig } from '@/sim/types'
import { useApsis } from '@/store'
import { duration } from '@/lib/format'
import styles from './OrbitCard.module.css'

/** Where the cluster is and what comes next: shadow, the SAA, the next ground station. */
export function OrbitCard({ cluster }: { cluster: ClusterConfig }) {
  const view = useApsis((s) => s.viewTime)
  const bucket = Math.floor(view / 15)
  const o = cluster.orbit
  const info = useMemo(() => {
    const t = bucket * 15
    const P = periodS(o)
    const ecl = isEclipsed(o, t)
    let eclipseChange: number | null = null
    for (let dt = 15; dt < P; dt += 15) if (isEclipsed(o, t + dt) !== ecl) ((eclipseChange = dt), (dt = P))
    const here = subSatellite(o, t)
    const saaNow = inSaa(here.lat, here.lon)
    let saa: number | null = null
    for (let dt = 30; dt < 4 * P; dt += 30) {
      const p = subSatellite(o, t + dt)
      if (inSaa(p.lat, p.lon) !== saaNow) ((saa = dt), (dt = 4 * P))
    }
    const fp = footprintDeg(o)
    let pass: { name: string; in: number } | null = null
    const visibleNow = GROUND_STATIONS.find((g) => centralAngleDeg(here, g) < fp)
    if (!visibleNow) {
      outer: for (let dt = 30; dt < 6 * 3600; dt += 30) {
        const p = subSatellite(o, t + dt)
        for (const g of GROUND_STATIONS)
          if (centralAngleDeg(p, g) < fp) {
            pass = { name: g.name, in: dt }
            break outer
          }
      }
    }
    return { P, ecl, eclipseChange, here, saaNow, saa, visibleNow, pass }
  }, [o, bucket])

  const rows: [string, string][] = [
    ['Orbit', o.label],
    ['Inclination', `${o.incDeg.toFixed(1)}°`],
    ['Period', duration(info.P)],
    ['Velocity', `${velocityKms(o).toFixed(2)} km/s`],
    ['Beta angle', `${betaDeg(o).toFixed(0)}°${Math.abs(betaDeg(o)) > 66 ? ' · always sunlit' : ''}`],
    ['Sub-point', `${fmtLat(info.here.lat)} ${fmtLon(info.here.lon)}`],
    [
      info.ecl ? 'Leaves shadow' : 'Enters shadow',
      info.eclipseChange === null ? 'not this orbit' : `in ${duration(info.eclipseChange)}`,
    ],
    [info.saaNow ? 'Leaves SAA' : 'Next SAA transit', info.saa === null ? 'none soon' : `in ${duration(info.saa)}`],
    ['Ground contact', info.visibleNow ? `${info.visibleNow.name} · now` : info.pass ? `${info.pass.name} in ${duration(info.pass.in)}` : 'none in 6h'],
  ]

  return (
    <dl className={styles.list}>
      {rows.map(([k, v]) => (
        <div key={k} className={styles.row}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const fmtLat = (x: number) => `${Math.abs(x).toFixed(1)}°${x >= 0 ? 'N' : 'S'}`
const fmtLon = (x: number) => `${Math.abs(x).toFixed(1)}°${x >= 0 ? 'E' : 'W'}`
