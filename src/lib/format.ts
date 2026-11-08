import { SIM } from '@/sim/fleet'

export const fmt = {
  int: (x: number) => Math.round(x).toLocaleString('en-US'),
  pct: (x: number) => `${Math.round(x * 100)}%`,
  temp: (c: number) => `${c.toFixed(1)}°C`,
  kw: (x: number) => (Math.abs(x) >= 1000 ? `${(x / 1000).toFixed(2)} MW` : `${Math.round(x)} kW`),
  signedKw: (x: number) => `${x >= 0 ? '+' : '−'}${Math.round(Math.abs(x))} kW`,
  pf: (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(2)} EF` : `${Math.round(x)} PF`),
}

/** "42m", "1h 05m", "12s" */
export function duration(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** Sim time as UTC wall clock: "08:42:10" and "14 Mar 2031" */
export function utc(t: number) {
  const d = new Date(SIM.epochMs + t * 1000)
  const time = d.toISOString().slice(11, 19)
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return { time, date }
}

export function ago(seconds: number) {
  return seconds < 60 ? 'just now' : `${duration(seconds).split(' ')[0]} ago`
}

/** "12–34 PF": the span of a series, for charts that auto-scale. Empty for an empty series. */
export function range(values: number[], f: (x: number) => string) {
  if (!values.length) return ''
  const lo = f(Math.min(...values))
  const hi = f(Math.max(...values))
  return lo === hi ? lo : `${lo} – ${hi}`
}
