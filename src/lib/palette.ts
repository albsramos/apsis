import { Color } from 'three'
import { heatPosition, type HeatScale } from './heat'

/**
 * Design tokens as three.js colours, read once from CSS so the scene and the UI share one palette.
 * Only call on the client, after styles have loaded.
 */
const NAMES = [
  'fg', 'fg-muted', 'fg-subtle', 'border', 'border-strong', 'surface', 'viz-active', 'viz-done', 'viz-warn', 'danger',
  'heat-0', 'heat-1', 'heat-2', 'heat-3', 'heat-4', 'space', 'atmosphere', 'globe-ocean', 'globe-shade', 'globe-land',
  'globe-active', 'saa',
] as const
export type Token = (typeof NAMES)[number]
export type Palette = Record<Token, Color>

let cached: Palette | null = null

export function palette(): Palette {
  if (cached) return cached
  const css = getComputedStyle(document.documentElement)
  cached = Object.fromEntries(
    NAMES.map((n) => [n, new Color(css.getPropertyValue(`--${n}`).trim() || '#ffffff')]),
  ) as Palette
  return cached
}

/** Heat ramp colour into `out`. */
export function heatColor(tempC: number, scale: HeatScale, out: Color) {
  const p = palette()
  const stops = [p['heat-0'], p['heat-1'], p['heat-2'], p['heat-3'], p['heat-4']]
  const pos = heatPosition(tempC, scale)
  const i = Math.min(3, Math.floor(pos))
  return out.copy(stops[i]).lerp(stops[i + 1], pos - i)
}

export function statusColor(status: 'nominal' | 'degraded' | 'critical') {
  const p = palette()
  return status === 'critical' ? p.danger : status === 'degraded' ? p['viz-warn'] : p['viz-done']
}
