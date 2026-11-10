import type { Point } from '@/api'

/** A segment's polyline with the running length at each vertex, so positions along it are a lookup. */
export interface Track {
  points: Point[]
  at: number[]
  length: number
}

export function track(points: Point[]): Track {
  const at = [0]
  for (let i = 1; i < points.length; i++) at.push(at[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  return { points, at, length: at[at.length - 1] }
}

/** The point a fraction of the way along a track (0 = start, 1 = end). */
export function pointAt(t: Track, offset: number): Point {
  const d = Math.min(1, Math.max(0, offset)) * t.length
  let i = 1
  while (i < t.points.length - 1 && t.at[i] < d) i++
  const span = t.at[i] - t.at[i - 1] || 1
  const k = (d - t.at[i - 1]) / span
  const a = t.points[i - 1]
  const b = t.points[i]
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
}

/** The part of a track from one fraction to the end. */
export function tail(t: Track, from: number): Point[] {
  const d = from * t.length
  return [pointAt(t, from), ...t.points.filter((_, i) => t.at[i] > d)]
}

export function toPath(points: Point[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')
}
