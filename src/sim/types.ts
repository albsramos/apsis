export type Lens = 'output' | 'thermal' | 'faults'
export type Severity = 'critical' | 'warn' | 'info'
export type Status = 'nominal' | 'degraded' | 'critical'

/** A physical part of a cluster, shared by the 3D model, the sheet and the fault list. */
export type PartRef =
  | { kind: 'module'; index: number }
  | { kind: 'radiator'; index: number }
  | { kind: 'wing'; index: number }
  | { kind: 'loop' }
  | { kind: 'dish' }

export type OrbitClass = 'SSO' | 'LEO' | 'Polar' | 'MEO'

export interface Orbit {
  klass: OrbitClass
  /** Short human label, e.g. "SSO dawn-dusk · 550 km" */
  label: string
  altKm: number
  incDeg: number
  raanDeg: number
  /** Argument of latitude at t = 0 */
  phaseDeg: number
}

export interface Scenario {
  /** Pump health at the start of history and its loss per hour (coolant pump wearing out). */
  pump?: { start: number; perHour: number }
  /** Radiator segment punctured by a micrometeoroid at this sim time (s). */
  mmod?: { segment: number; at: number }
  /** Solar wing drive stuck at this angle (deg) from this sim time (s). */
  wingStall?: { wing: number; angleDeg: number; at: number }
}

export interface ClusterConfig {
  id: string
  code: string
  name: string
  role: string
  orbit: Orbit
  capacityKw: number
  /** Baseline utilisation the scheduler aims for */
  baseUtil: number
  /** FP8 petaflops per kW of IT load */
  pfPerKw: number
  /** Share of IT load per compute module (sums to 1) */
  moduleShares: number[]
  radiatorAreaM2: number
  maxHeaterKw: number
  genMaxKw: number
  batteryKwh: number
  scenario: Scenario
}

export interface Fault {
  id: string
  clusterId: string
  severity: Severity
  part: PartRef
  title: string
  detail: string
  action: string
  /** Sim time the fault was first seen */
  since: number
}

/** Everything the UI knows about one cluster at one moment. */
export interface ClusterSample {
  t: number
  eclipse: boolean
  inSaa: boolean
  util: number
  throttle: number
  itKw: number
  outputPf: number
  genKw: number
  drawKw: number
  soc: number
  loopC: number
  modulesC: number[]
  segmentsC: number[]
  segmentAlive: boolean[]
  heaterKw: number
  pumpHealth: number
  flow: number
  seuPerMin: number
  seuTotal: number
  /** Solar wing tracking error, deg */
  wingErrDeg: number[]
  /** Solar wing angle about its boom, from the truss, deg (what the 3D model shows) */
  wingAngleDeg: number[]
  faults: Fault[]
  status: Status
}

export type WorkerIn = { type: 'advance'; to: number }

export type WorkerOut =
  | { type: 'init'; head: Record<string, ClusterSample>; history: Record<string, ClusterSample[]> }
  | { type: 'tick'; head: Record<string, ClusterSample>; appended: Record<string, ClusterSample[]> }
