import type { PayloadType, Severity } from '@/api'

export const PAYLOAD_LABEL: Record<PayloadType, string> = {
  car_body: 'Car body',
  car_plastics: 'Car plastics',
  robot_arm: 'Robot arm',
  robot_part: 'Robot part',
}

export const SEVERITY_LABEL: Record<Severity, string> = { ok: 'Running', warning: 'Warning', fault: 'Fault' }

export const SEVERITY_TONE = { ok: 'neutral', warning: 'warn', fault: 'danger' } as const

/** "45 s", "2 min 40 s", "1 h 05 min" */
export function duration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s} s`
  if (s < 3600) return s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`
}

/** How long ago, coarse: "now", "40 s", "4 min", "2 h" */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 10) return 'now'
  if (s < 60) return `${Math.floor(s / 10) * 10} s`
  if (s < 3600) return `${Math.floor(s / 60)} min`
  return `${Math.floor(s / 3600)} h`
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

/** "3.5×" */
export function times(ratio: number): string {
  return `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}×`
}
