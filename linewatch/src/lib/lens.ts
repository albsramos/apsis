import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type { IconName } from '@/components/ui/Icon'

/** A lens recolours the same map to answer a different question. */
export type Lens = 'status' | 'payload' | 'dwell'

export const LENSES: { value: Lens; label: string; hint: string; icon: IconName }[] = [
  { value: 'status', label: 'Status', hint: 'Which carriers have a problem', icon: 'pulse' },
  { value: 'payload', label: 'Payload', hint: 'What each carrier is carrying', icon: 'box' },
  { value: 'dwell', label: 'Dwell', hint: 'Where the line is slower than normal', icon: 'clock' },
]

/** The lens lives in the URL (?lens=dwell), so a link shows what its sender saw. */
export function useLens(): [Lens, (lens: Lens) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('lens')
  const lens = LENSES.some((l) => l.value === raw) ? (raw as Lens) : 'status'
  const setLens = useCallback(
    (next: Lens) =>
      setParams(
        (p) => {
          const q = new URLSearchParams(p)
          if (next === 'status') q.delete('lens')
          else q.set('lens', next)
          return q
        },
        { replace: true },
      ),
    [setParams],
  )
  return [lens, setLens]
}

/** Dwell over expected, as a step on the five-step ramp (--dwell-0 … --dwell-4). */
export const DWELL_STEPS = [
  { below: 1.2, label: 'On time' },
  { below: 1.8, label: '1.2×' },
  { below: 2.5, label: '1.8×' },
  { below: 4, label: '2.5×' },
  { below: Infinity, label: '4× +' },
]

export function dwellLevel(ratio: number): number {
  return DWELL_STEPS.findIndex((s) => ratio < s.below)
}
