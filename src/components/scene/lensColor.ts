import type { Color } from 'three'
import type { ClusterConfig, ClusterSample, Lens } from '@/sim/types'
import { heatColor, palette } from '@/lib/palette'
import { MODULE_SCALE } from '@/lib/heat'

/** The one colour a cluster shows at fleet scale (orbit ring and marker) under each lens. */
export function lensColor(lens: Lens, cluster: ClusterConfig, s: ClusterSample, out: Color) {
  const p = palette()
  switch (lens) {
    case 'output':
      return out.copy(p['viz-active']).multiplyScalar(0.35 + 0.9 * (s.itKw / cluster.capacityKw))
    case 'thermal':
      return heatColor(Math.max(...s.modulesC), MODULE_SCALE, out)
    case 'faults':
      // Only what is wrong gets a colour; healthy clusters stay neutral.
      return s.status === 'critical' ? out.copy(p.danger) : s.status === 'degraded' ? out.copy(p['viz-warn']) : out.copy(p['fg-subtle'])
  }
}
