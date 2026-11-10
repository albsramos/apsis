import type { Factory, Layout, LayoutNode, LayoutSegment, NodeKind, PayloadType, Point } from '@/api'

/** Carrier speed on open track, layout units per second. */
export const SPEED = 14
/** Layout units per metre. */
export const UNITS_PER_M = 10

/** What the mock knows about a factory beyond its public layout: how the simulation should run it. */
export interface FactoryDef {
  factory: Factory
  layout: Layout
  /** Seconds a carrier stops at a node. */
  processSec: Record<string, number>
  /** Relative odds of taking a segment where the track splits (default 1). */
  weight: Record<string, number>
  /** Stations that can raise a payload defect. */
  inspection: string[]
  /** What gets loaded at each entry node. */
  loads: Record<string, PayloadType[]>
  carriers: number
  /** The first scripted fault happens on this segment, so the story is on screen at load. */
  firstFaultSegment: string
}

export const p = (x: number, y: number): Point => ({ x, y })

/** A circular arc sampled finely enough to draw as straight pieces. Angles in degrees, 0 = east, 90 = south. */
export function arc(cx: number, cy: number, r: number, from: number, to: number): Point[] {
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) / 6))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180
    return p(cx + r * Math.cos(a), cy + r * Math.sin(a))
  })
}

/** A cubic Bézier, sampled. */
export function curve(a: Point, c1: Point, c2: Point, b: Point): Point[] {
  return Array.from({ length: 17 }, (_, i) => {
    const t = i / 16
    const u = 1 - t
    return p(
      u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    )
  })
}

export function polylineLength(points: Point[]): number {
  let len = 0
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  return len
}

export const node = (id: string, kind: NodeKind, name: string, x: number, y: number, code?: string): LayoutNode => ({ id, kind, name, x, y, code })

/** Builds the public segments, deriving length and expected time from the geometry and the stop at the far end. */
export function segments(nodes: LayoutNode[], processSec: Record<string, number>, defs: [id: string, from: string, to: string, via?: Point[]][]): LayoutSegment[] {
  const at = (id: string) => {
    const n = nodes.find((n) => n.id === id)
    if (!n) throw new Error(`Unknown node ${id}`)
    return p(n.x, n.y)
  }
  return defs.map(([id, from, to, via = []]) => {
    const points = [at(from), ...via, at(to)]
    const len = polylineLength(points)
    return { id, from, to, points, lengthM: Math.round(len / UNITS_PER_M), expectedSec: Math.round(len / SPEED + (processSec[to] ?? 0)) }
  })
}
