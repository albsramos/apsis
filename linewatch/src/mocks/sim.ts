import type { Carrier, CarrierDetail, Defect, FactoryStats, Fault, Issue, LayoutSegment, Payload, PayloadType, TrailStep } from '@/api'
import { polylineLength, SPEED, type FactoryDef } from './layouts/build'

/**
 * A small line simulation that stands in for the backend. Carriers drive along segments, stop at stations, keep a gap
 * to the one ahead and give way at merges; a faulted carrier stops, so the queue behind it and the dwell times are
 * consequences, never scripted. Pure TypeScript: no React, no DOM.
 */

const GAP = 20 // layout units between carrier centres
const STEP = 0.25 // seconds per simulation step
const WARM_UP = 600 // seconds simulated before the first request
const FAULT_LASTS = 240
const FAULT_PAUSE = 60
const FIRST_FAULT_AT = 520

const FAULTS = [
  { code: 'DRV-204', title: 'Drive motor overcurrent', detail: 'The drive stopped to protect the motor. It needs a reset at the carrier.' },
  { code: 'NAV-118', title: 'Position reference lost', detail: 'The carrier missed two read points in a row and stopped where it was.' },
  { code: 'CLP-071', title: 'Payload clamp not confirmed', detail: 'The clamp sensor did not report closed, so movement is inhibited.' },
  { code: 'COM-310', title: 'Controller link timeout', detail: 'No heartbeat from the carrier controller for 10 s.' },
]
const WARNINGS = [
  { code: 'BAT-012', title: 'Battery below 20%', detail: 'Route to a charger at the next opportunity.' },
  { code: 'SRV-040', title: 'Service interval exceeded', detail: 'Past 5,000 cycles since the last service.' },
]
const DEFECTS: Record<PayloadType, string[]> = {
  car_body: ['Weld spatter on left sill', 'Gap out of tolerance at rear door', 'Sealer bead incomplete'],
  car_plastics: ['Surface scratch', 'Clip missing', 'Colour mismatch against master'],
  robot_arm: ['Torque value missing on joint 3', 'Connector not seated', 'Backlash above limit'],
  robot_part: ['Dimension out of tolerance', 'Surface scratch', 'Label unreadable'],
}

const PAYLOADS: Record<PayloadType, { prefix: string; items: [name: string, variants: string[]][] }> = {
  car_body: { prefix: 'BW', items: [['Body-in-white', ['Sedan', 'SUV', 'Crew cab']]] },
  car_plastics: { prefix: 'PL', items: [['Front bumper', ['Graphite', 'Pearl white']], ['Dash panel', ['LHD', 'RHD']], ['Door trim set', ['Standard', 'Premium']]] },
  robot_arm: { prefix: 'RA', items: [['Arm assembly A6', ['6-axis · 12 kg', '6-axis · 20 kg']], ['Arm assembly S4', ['4-axis · 6 kg']]] },
  robot_part: { prefix: 'RP', items: [['Wrist gearbox', ['Ratio 80:1', 'Ratio 120:1']], ['Servo drive', ['400 W', '750 W']], ['Base casting', ['Machined']]] },
}

interface Seg extends LayoutSegment {
  len: number
}

interface SimCarrier {
  id: string
  model: string
  battery: number
  cycles: number
  seg: string
  /** Distance along the segment, layout units */
  d: number
  next?: string
  arrivedAt?: number
  processLeft: number
  enteredAt: number
  fault?: Fault & { until: number }
  warning?: Fault
  payload?: Payload
  trail: TrailStep[]
}

/** Small seeded generator, so a factory tells the same story on every load. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class LineSim {
  private readonly segs: Record<string, Seg> = {}
  private readonly out: Record<string, Seg[]> = {}
  private readonly into: Record<string, Seg[]> = {}
  private readonly nodeName: Record<string, string> = {}
  private readonly nodeKind: Record<string, string> = {}
  private readonly rand: () => number
  private readonly startMs: number
  private carriers: SimCarrier[] = []
  private t = 0
  private serial = 48000
  private unloads: number[] = []
  private history: number[] = []
  private nextSample = 255
  private nextFaultAt = FIRST_FAULT_AT
  private faultCount = 0

  constructor(private readonly def: FactoryDef) {
    this.rand = mulberry32(def.factory.id.length * 7919 + def.carriers)
    for (const n of def.layout.nodes) {
      this.nodeName[n.id] = n.name
      this.nodeKind[n.id] = n.kind
    }
    for (const s of def.layout.segments) {
      const seg = { ...s, len: polylineLength(s.points) }
      this.segs[s.id] = seg
      ;(this.out[s.from] ??= []).push(seg)
      ;(this.into[s.to] ??= []).push(seg)
    }
    this.startMs = Date.now() - WARM_UP * 1000
    this.place()
    this.run(WARM_UP)
  }

  /** Brings the simulation up to the wall clock. A long gap (hidden tab) is skipped, not replayed. */
  advance() {
    const target = (Date.now() - this.startMs) / 1000
    if (target - this.t > 30) this.t = target - 30
    this.run(target - this.t)
  }

  private run(seconds: number) {
    for (let n = Math.floor(seconds / STEP); n > 0; n--) this.step()
  }

  private iso(t: number) {
    return new Date(this.startMs + t * 1000).toISOString()
  }

  // ---- setup ----

  private place() {
    const all = Object.values(this.segs)
    const total = all.reduce((a, s) => a + s.len, 0)
    const spacing = total / this.def.carriers
    let carry = spacing / 2
    let i = 0
    for (const s of all) {
      for (; carry < s.len && i < this.def.carriers; carry += spacing, i++) {
        const c: SimCarrier = {
          id: `C-${String(101 + i * 7).padStart(4, '0')}`,
          model: this.rand() < 0.7 ? 'Skid carrier SK-2' : 'Tugger TG-5',
          battery: Math.round(35 + this.rand() * 60),
          cycles: Math.round(300 + this.rand() * 4200),
          seg: s.id,
          d: carry,
          processLeft: 0,
          enteredAt: -carry / SPEED,
          trail: [],
        }
        c.next = this.pickNext(c, s.to)
        if (this.rand() < 0.9) c.payload = this.makePayload(Object.keys(this.def.loads)[0])
        this.carriers.push(c)
      }
      carry -= s.len
    }
    // Two standing warnings, so the amber state is always on screen.
    const [a, b] = [this.carriers[5], this.carriers[Math.floor(this.carriers.length * 0.7)]]
    a.battery = 17
    a.warning = { id: `${a.id}-w`, ...WARNINGS[0], severity: 'warning', since: this.iso(40) }
    b.cycles = 5120
    b.warning = { id: `${b.id}-w`, ...WARNINGS[1], severity: 'warning', since: this.iso(0) }
  }

  private makePayload(entry: string): Payload {
    const types = this.def.loads[entry] ?? this.def.loads[Object.keys(this.def.loads)[0]]
    const type = types[Math.floor(this.rand() * types.length)]
    const kind = PAYLOADS[type]
    const [name, variants] = kind.items[Math.floor(this.rand() * kind.items.length)]
    this.serial += 1 + Math.floor(this.rand() * 9)
    return {
      id: `${kind.prefix}-${this.serial}`,
      type,
      name,
      variant: variants[Math.floor(this.rand() * variants.length)],
      orderId: `ORD-${71000 + Math.floor(this.rand() * 900)}`,
      status: 'ok',
      defects: [],
    }
  }

  private pickNext(c: SimCarrier, nodeId: string): string | undefined {
    const options = this.out[nodeId]
    if (!options?.length) return undefined
    // Empty carriers prefer a buffer when one is on offer.
    const weights = options.map((s) => (this.def.weight[s.id] ?? 1) * (!c.payload && this.nodeKind[s.to] === 'buffer' ? 6 : 1))
    let r = this.rand() * weights.reduce((a, b) => a + b, 0)
    for (let i = 0; i < options.length; i++) if ((r -= weights[i]) <= 0) return options[i].id
    return options[options.length - 1].id
  }

  // ---- one step ----

  private step() {
    this.t += STEP
    const t = this.t
    this.updateFaults()

    const on: Record<string, SimCarrier[]> = {}
    for (const c of this.carriers) (on[c.seg] ??= []).push(c)
    const tail = (segId?: string) => (segId && on[segId]?.length ? Math.min(...on[segId].map((c) => c.d)) : Infinity)

    for (const c of this.carriers) {
      if (c.fault) continue
      const seg = this.segs[c.seg]
      const remaining = seg.len - c.d

      if (remaining > 0.01) {
        let free = Infinity
        for (const o of on[c.seg]) if (o !== c && o.d > c.d) free = Math.min(free, o.d - c.d - GAP)
        if (free === Infinity) {
          free = remaining + Math.max(0, tail(c.next) - GAP) * (c.next ? 1 : 0)
          // Give way at a merge to whoever is closer to it.
          for (const other of this.into[seg.to]) {
            if (other.id === seg.id) continue
            for (const o of on[other.id] ?? []) {
              const theirs = other.len - o.d
              if (theirs < remaining || (theirs === remaining && o.id < c.id)) free = Math.min(free, remaining - theirs - GAP)
            }
          }
        }
        c.d += Math.max(0, Math.min(SPEED * STEP, free, remaining))
        if (seg.len - c.d > 0.01) continue
        c.d = seg.len
      }

      // At the node at the end of the segment.
      if (c.arrivedAt === undefined) {
        c.arrivedAt = t
        c.processLeft = this.def.processSec[seg.to] ?? 0
      }
      if (c.processLeft > 0) {
        c.processLeft -= STEP
        continue
      }

      if (this.nodeKind[seg.to] === 'exit') {
        this.respawn(c, tail)
        continue
      }
      if (!c.next || tail(c.next) < GAP) continue
      this.leaveNode(c, seg)
      on[seg.id] = on[seg.id].filter((o) => o !== c)
      c.seg = c.next
      c.d = 0
      c.enteredAt = t
      c.arrivedAt = undefined
      c.next = this.pickNext(c, this.segs[c.seg].to)
      ;(on[c.seg] ??= []).push(c)
    }

    if (t >= this.nextSample) {
      this.nextSample = t + 15
      this.history.push(this.throughput())
      if (this.history.length > 24) this.history.shift()
    }
  }

  /** Records the stop that just ended, and lets inspection stations find a defect. */
  private leaveNode(c: SimCarrier, seg: Seg) {
    if (this.nodeKind[seg.to] !== 'station' || c.arrivedAt === undefined) return
    const normal = this.def.processSec[seg.to] ?? 0
    const durationSec = Math.round(this.t - c.arrivedAt)
    c.trail.unshift({ nodeId: seg.to, nodeName: this.nodeName[seg.to], at: this.iso(c.arrivedAt), durationSec, result: durationSec > normal * 2 + 4 ? 'warning' : 'ok' })
    if (c.trail.length > 6) c.trail.pop()
    if (c.payload && c.payload.defects.length === 0 && this.def.inspection.includes(seg.to) && this.rand() < 0.14) {
      const titles = DEFECTS[c.payload.type]
      const defect: Defect = {
        id: `${c.payload.id}-d1`,
        title: titles[Math.floor(this.rand() * titles.length)],
        severity: 'warning',
        foundAt: this.nodeName[seg.to],
        at: this.iso(this.t),
      }
      c.payload.defects.push(defect)
      c.payload.status = 'warning'
    }
  }

  private respawn(c: SimCarrier, tail: (segId?: string) => number) {
    const entries = Object.values(this.segs).filter((s) => this.nodeKind[s.from] === 'entry' && tail(s.id) >= GAP)
    if (!entries.length) return
    const weights = entries.map((s) => this.def.weight[s.id] ?? 1)
    let r = this.rand() * weights.reduce((a, b) => a + b, 0)
    const entry = entries.find((_, i) => (r -= weights[i]) <= 0) ?? entries[0]
    if (c.payload) this.unloads.push(this.t)
    c.seg = entry.id
    c.d = 0
    c.enteredAt = this.t
    c.arrivedAt = undefined
    c.trail = []
    c.cycles += 1
    c.payload = this.rand() < 0.9 ? this.makePayload(entry.from) : undefined
    c.next = this.pickNext(c, entry.to)
  }

  private updateFaults() {
    for (const c of this.carriers) if (c.fault && this.t >= c.fault.until) c.fault = undefined
    if (this.t < this.nextFaultAt || this.carriers.some((c) => c.fault)) return
    const first = this.faultCount === 0
    const pool = this.carriers.filter((c) => {
      const seg = this.segs[c.seg]
      if (!c.payload || this.nodeKind[seg.to] === 'exit' || this.nodeKind[seg.from] === 'entry') return false
      return first ? c.seg === this.def.firstFaultSegment && c.d < seg.len - 30 : c.d > 20 && c.d < seg.len - 20
    })
    if (!pool.length) return
    const c = pool[Math.floor(this.rand() * pool.length)]
    const kind = FAULTS[this.faultCount % FAULTS.length]
    this.faultCount++
    c.fault = { id: `${c.id}-f${this.faultCount}`, ...kind, severity: 'fault', since: this.iso(this.t), until: this.t + FAULT_LASTS }
    this.nextFaultAt = this.t + FAULT_LASTS + FAULT_PAUSE
  }

  // ---- what the API returns ----

  private severity(c: SimCarrier) {
    return c.fault ? 'fault' : c.warning || c.payload?.status === 'warning' ? 'warning' : 'ok'
  }

  private view(c: SimCarrier): Carrier {
    const seg = this.segs[c.seg]
    return {
      id: c.id,
      status: this.severity(c),
      loaded: !!c.payload,
      payloadId: c.payload?.id,
      payloadType: c.payload?.type,
      position: { segmentId: c.seg, offset: Math.round((c.d / seg.len) * 1000) / 1000 },
      dwellSec: Math.round(this.t - c.enteredAt),
      expectedSec: seg.expectedSec,
    }
  }

  listCarriers(): Carrier[] {
    return this.carriers.map((c) => this.view(c))
  }

  getCarrier(id: string): CarrierDetail | undefined {
    const c = this.carriers.find((c) => c.id === id)
    if (!c) return undefined
    const seg = this.segs[c.seg]
    const faults: Fault[] = []
    if (c.fault) faults.push({ id: c.fault.id, code: c.fault.code, title: c.fault.title, detail: c.fault.detail, severity: 'fault', since: c.fault.since })
    if (c.warning) faults.push(c.warning)
    return {
      ...this.view(c),
      model: c.model,
      batteryPct: c.battery,
      cyclesSinceService: c.cycles,
      fromNodeName: this.nodeName[seg.from],
      toNodeName: this.nodeName[seg.to],
      faults,
      payload: c.payload && { ...c.payload, defects: [...c.payload.defects], nextOperation: this.nextStation(c) },
      trail: [...c.trail],
    }
  }

  private nextStation(c: SimCarrier): string | undefined {
    let seg: Seg | undefined = this.segs[c.seg]
    let next = c.next
    for (let i = 0; seg && i < 6; i++) {
      if (this.nodeKind[seg.to] === 'station' || this.nodeKind[seg.to] === 'exit') return this.nodeName[seg.to]
      seg = next ? this.segs[next] : undefined
      next = seg && this.out[seg.to]?.[0]?.id
    }
    return undefined
  }

  /** Carriers held up behind `c`, nearest first: follows the queue back through the segments feeding this one. */
  private queueBehind(c: SimCarrier): string[] {
    const found: string[] = []
    const walk = (segId: string, from: number, depth: number) => {
      const behind = this.carriers.filter((o) => o.seg === segId && o.d < from).sort((a, b) => b.d - a.d)
      let edge = from
      for (const o of behind) {
        if (edge - o.d > GAP * 1.5) return
        found.push(o.id)
        edge = o.d
      }
      if (edge > GAP * 1.5 || depth > 3) return
      for (const feeder of this.into[this.segs[segId].from] ?? []) walk(feeder.id, feeder.len + edge, depth + 1)
    }
    walk(c.seg, c.d, 0)
    return found
  }

  /** The next station ahead of `c`, when no carrier is between `c` and it. */
  private starved(c: SimCarrier): string | undefined {
    if (this.carriers.some((o) => o.seg === c.seg && o.d > c.d)) return undefined
    let seg = this.segs[c.seg]
    for (let i = 0; i < 3; i++) {
      if (this.nodeKind[seg.to] === 'station') return seg.to
      const next = i === 0 && c.next ? this.segs[c.next] : this.out[seg.to]?.[0]
      if (!next || this.carriers.some((o) => o.seg === next.id)) return undefined
      seg = next
    }
    return undefined
  }

  listIssues(): Issue[] {
    const issues: Issue[] = []
    for (const c of this.carriers) {
      const seg = this.segs[c.seg]
      const location = `${this.nodeName[seg.from]} → ${this.nodeName[seg.to]}`
      if (c.fault)
        issues.push({
          id: c.fault.id,
          kind: 'carrier',
          severity: 'fault',
          carrierId: c.id,
          title: c.fault.title,
          location,
          since: c.fault.since,
          impact: { queuedCarrierIds: this.queueBehind(c), starvedNodeId: this.starved(c) },
        })
      if (c.warning) issues.push({ id: c.warning.id, kind: 'carrier', severity: 'warning', carrierId: c.id, title: c.warning.title, location, since: c.warning.since, impact: { queuedCarrierIds: [] } })
      for (const d of c.payload?.defects ?? [])
        issues.push({ id: d.id, kind: 'payload', severity: 'warning', carrierId: c.id, title: d.title, location, since: d.at, impact: { queuedCarrierIds: [] } })
    }
    const rank = (i: Issue) => (i.severity === 'fault' ? 1000 : 0) + i.impact.queuedCarrierIds.length
    return issues.sort((a, b) => rank(b) - rank(a) || b.since.localeCompare(a.since))
  }

  private throughput() {
    const window = 240
    this.unloads = this.unloads.filter((u) => u > this.t - window)
    return Math.round((this.unloads.length * 3600) / window)
  }

  getStats(): FactoryStats {
    const bySeg: Record<string, { ratio: number; carriers: number }> = {}
    for (const c of this.carriers) {
      const s = (bySeg[c.seg] ??= { ratio: 0, carriers: 0 })
      s.carriers++
      s.ratio = Math.max(s.ratio, (this.t - c.enteredAt) / this.segs[c.seg].expectedSec)
    }
    return {
      carriers: this.carriers.length,
      loaded: this.carriers.filter((c) => c.payload).length,
      throughputPerHour: this.throughput(),
      throughputHistory: [...this.history],
      openIssues: this.listIssues().length,
      segmentDwell: Object.values(this.segs).map((s) => ({
        segmentId: s.id,
        ratio: Math.round((bySeg[s.id]?.ratio ?? 0) * 100) / 100,
        carriers: bySeg[s.id]?.carriers ?? 0,
      })),
    }
  }
}
