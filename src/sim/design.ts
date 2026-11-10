import { attitude, betaDeg, type Attitude } from './orbit'
import type { ClusterConfig } from './types'

/**
 * The physical design of a cluster, in metres: what the 3D model draws. The general arrangement is the one in
 * docs/halyard-general-arrangement.pdf, drawn for KO-1 Halyard. Every cluster shares the truss, the six compute
 * modules and the bus; its wings and radiators are sized from its own power and heat, at Halyard's proportions.
 *
 * Body axes: x along the truss (forward), z along the wing and radiator booms, y the axis the modules stand on.
 */

/** KO-1 Halyard, the cluster the drawing dimensions: 560 kW from two 19.5 × 48.0 m wings, 2,150 m² of radiator. */
const REF = { genKw: 560, wingChord: 19.5, wingLength: 48, radiatorM2: 2150, segmentChord: 14, segmentSpan: 9.6 }

export const TRUSS = { length: 30, section: 1.6, bays: 15 }
/** Canisters stand off the truss on alternate sides, 3.2 m apart, starting `standoff` from its axis. */
export const MODULE = { radius: 1.2, length: 4.8, pitch: 3.2, x0: -8, standoff: 1.2 }
export const HUB = { wingX: 12, radiatorX: -12 }
/** Thermal control package (pumps, accumulator), aft; bus module (power, battery, avionics), forward. */
export const PUMP_PACKAGE = { x: -16.5, length: 3, section: 2.4 }
export const BUS = { x: 16.8, length: 3.6, section: 2.4 }
export const DISH_RADIUS = 1.2
export const MAST_RADIUS = 0.25

export interface Design {
  attitude: Attitude
  /** Which side of the truss (±y) faces the Sun in a tower; odd-numbered modules go there. 1 when crosswise. */
  sunSide: 1 | -1
  /** One wing: two blankets either side of a mast, starting `root` from the truss axis */
  wing: { chord: number; length: number; root: number }
  /** One radiator segment; four in a row on each boom, `gap` apart, starting `root` from the truss axis */
  segment: { chord: number; span: number; gap: number; root: number }
  /** Reach of a radiator boom from the truss axis */
  boom: number
  /** Wing tip to wing tip */
  height: number
}

const cache = new Map<string, Design>()

export function designOf(c: ClusterConfig): Design {
  const hit = cache.get(c.id)
  if (hit) return hit
  // Same power per square metre and the same panel proportions as Halyard, so area scales both sides.
  const w = Math.sqrt(c.genMaxKw / REF.genKw)
  const r = Math.sqrt(c.radiatorAreaM2 / REF.radiatorM2)
  const wing = { chord: REF.wingChord * w, length: REF.wingLength * w, root: 5 }
  const segment = { chord: REF.segmentChord * r, span: REF.segmentSpan * r, gap: 0.8, root: 4 }
  const att = attitude(c.orbit)
  const d: Design = {
    attitude: att,
    sunSide: att === 'tower' && betaDeg(c.orbit) < 0 ? -1 : 1,
    wing,
    segment,
    boom: segment.root + 4 * segment.span + 3 * segment.gap,
    height: 2 * (wing.root + wing.length),
  }
  cache.set(c.id, d)
  return d
}

/** Area of both wings, m² */
export const wingAreaM2 = (d: Design) => 2 * d.wing.chord * d.wing.length
/** Radiating area: both faces of all eight segments, m² */
export const radiatingAreaM2 = (d: Design) => 16 * d.segment.chord * d.segment.span
