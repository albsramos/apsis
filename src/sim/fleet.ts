import type { ClusterConfig } from './types'

const H = 3600

/** Simulation constants shared by the worker and the UI. */
export const SIM = {
  /** Integration step, sim seconds */
  dt: 10,
  /** A history sample is kept every this many sim seconds */
  sampleEvery: 30,
  /** How much history the worker keeps (and pre-simulates on start) */
  historySeconds: 8 * H,
  /** How far back the timeline can scrub */
  scrubSeconds: 4 * H,
  /** Wall clock date of sim time 0 */
  epochMs: Date.UTC(2031, 2, 14, 6, 0, 0),
  /** Compute modules are designed to stay under this */
  moduleLimitC: 45,
} as const

const shares = (...w: number[]) => {
  const sum = w.reduce((a, b) => a + b, 0)
  return w.map((x) => x / sum)
}

/**
 * Kestrel Orbital's fleet. Fictional, but the orbits are chosen like a real operator would: two dawn-dusk
 * sun-synchronous clusters that never see eclipse (the thermally calm control group), three at 53° that cycle
 * through shadow every orbit, one polar, and one higher, colder storage cluster.
 */
export const FLEET: ClusterConfig[] = [
  {
    id: 'ko-1',
    code: 'KO-1',
    name: 'Halyard',
    role: 'Training',
    orbit: { klass: 'SSO', label: 'SSO dawn-dusk · 550 km', altKm: 550, incDeg: 97.6, raanDeg: 90, phaseDeg: 10 },
    capacityKw: 420,
    baseUtil: 0.86,
    pfPerKw: 2.6,
    moduleShares: shares(1, 1.05, 0.95, 1, 1.02, 0.98),
    radiatorAreaM2: 2150,
    maxHeaterKw: 40,
    genMaxKw: 560,
    batteryKwh: 260,
    scenario: {},
  },
  {
    id: 'ko-2',
    code: 'KO-2',
    name: 'Bowline',
    role: 'Training',
    orbit: { klass: 'SSO', label: 'SSO dawn-dusk · 610 km', altKm: 610, incDeg: 97.8, raanDeg: 86, phaseDeg: 200 },
    capacityKw: 420,
    baseUtil: 0.82,
    pfPerKw: 2.6,
    moduleShares: shares(1, 1, 1, 1, 1, 1),
    radiatorAreaM2: 2150,
    maxHeaterKw: 40,
    genMaxKw: 560,
    batteryKwh: 260,
    scenario: { mmod: { segment: 5, at: -2.6 * H } },
  },
  {
    id: 'ko-3',
    code: 'KO-3',
    name: 'Sheave',
    role: 'Inference',
    orbit: { klass: 'LEO', label: 'LEO 53° · 520 km', altKm: 520, incDeg: 53, raanDeg: 20, phaseDeg: 40 },
    capacityKw: 360,
    baseUtil: 0.74,
    pfPerKw: 2.4,
    moduleShares: shares(1.1, 1, 0.9, 1, 1, 1),
    radiatorAreaM2: 1240,
    maxHeaterKw: 40,
    genMaxKw: 720,
    batteryKwh: 420,
    scenario: {},
  },
  {
    id: 'ko-4',
    code: 'KO-4',
    name: 'Capstan',
    role: 'Inference',
    orbit: { klass: 'LEO', label: 'LEO 53° · 580 km', altKm: 580, incDeg: 53, raanDeg: 140, phaseDeg: 150 },
    capacityKw: 360,
    baseUtil: 0.7,
    pfPerKw: 2.4,
    moduleShares: shares(1, 1, 1, 1.1, 0.9, 1),
    radiatorAreaM2: 1240,
    maxHeaterKw: 40,
    genMaxKw: 720,
    batteryKwh: 420,
    scenario: {},
  },
  {
    id: 'ko-5',
    code: 'KO-5',
    name: 'Windlass',
    role: 'Inference',
    orbit: { klass: 'LEO', label: 'LEO 53° · 550 km', altKm: 550, incDeg: 53, raanDeg: 262, phaseDeg: 300 },
    capacityKw: 380,
    baseUtil: 0.8,
    pfPerKw: 2.4,
    moduleShares: shares(1, 1.08, 1.12, 1, 0.92, 0.88),
    radiatorAreaM2: 1300,
    maxHeaterKw: 40,
    genMaxKw: 760,
    batteryKwh: 440,
    scenario: { pump: { start: 1, perHour: 0.035 } },
  },
  {
    id: 'ko-6',
    code: 'KO-6',
    name: 'Gimbal',
    role: 'Rendering',
    orbit: { klass: 'Polar', label: 'Polar · 700 km', altKm: 700, incDeg: 90, raanDeg: 200, phaseDeg: 230 },
    capacityKw: 300,
    baseUtil: 0.72,
    pfPerKw: 2.2,
    moduleShares: shares(1, 1, 1, 1, 1, 1),
    radiatorAreaM2: 1030,
    maxHeaterKw: 35,
    genMaxKw: 620,
    batteryKwh: 360,
    scenario: { wingStall: { wing: 1, angleDeg: 38, at: -4.2 * H } },
  },
  {
    id: 'ko-7',
    code: 'KO-7',
    name: 'Deepwell',
    role: 'Cold storage',
    orbit: { klass: 'MEO', label: 'MEO 30° · 2,000 km', altKm: 2000, incDeg: 30, raanDeg: 320, phaseDeg: 80 },
    capacityKw: 140,
    baseUtil: 0.38,
    pfPerKw: 0.6,
    moduleShares: shares(1, 1, 1, 1, 1, 1),
    radiatorAreaM2: 430,
    maxHeaterKw: 45,
    genMaxKw: 240,
    batteryKwh: 220,
    scenario: {},
  },
]

export const clusterById = (id: string | null | undefined) => FLEET.find((c) => c.id === id)

export const GROUND_STATIONS = [
  { name: 'Svalbard', lat: 78.2, lon: 15.4 },
  { name: 'Punta Arenas', lat: -53.2, lon: -70.9 },
  { name: 'Hawaiʻi', lat: 19.8, lon: -155.5 },
  { name: 'Perth', lat: -31.8, lon: 115.9 },
  { name: 'Azores', lat: 37.7, lon: -25.7 },
  { name: 'Hartebeesthoek', lat: -25.9, lon: 27.7 },
]

export const MODULE_COUNT = 6
export const SEGMENT_COUNT = 8
