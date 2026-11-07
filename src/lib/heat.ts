/**
 * The heat ramp: five stops (--heat-0 … --heat-4), each pinned to a temperature. Radiators and compute
 * modules use different scales because "normal" means very different temperatures for each.
 */
export type HeatScale = readonly [number, number, number, number, number]

/** Blue while healthy; yellow 6°C under the 45°C limit (the warning threshold), red at 2.5°C. */
export const MODULE_SCALE: HeatScale = [8, 24, 38, 39.5, 42.5]
/** Radiators never get hot enough to warn; a dead segment falls to the darkest blue. */
export const RADIATOR_SCALE: HeatScale = [-60, -5, 32, 60, 80]

/** Position on the ramp, 0…4 */
export function heatPosition(tempC: number, scale: HeatScale) {
  if (tempC <= scale[0]) return 0
  for (let i = 0; i < 4; i++) {
    if (tempC <= scale[i + 1]) return i + (tempC - scale[i]) / (scale[i + 1] - scale[i])
  }
  return 4
}

/** A CSS colour for inline styles, mixing the two nearest token stops. */
export function heatCss(tempC: number, scale: HeatScale) {
  const p = heatPosition(tempC, scale)
  const i = Math.min(3, Math.floor(p))
  const f = Math.round((p - i) * 100)
  return `color-mix(in oklab, var(--heat-${i + 1}) ${f}%, var(--heat-${i}))`
}
