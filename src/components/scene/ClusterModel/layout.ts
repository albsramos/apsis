import { Matrix4, Quaternion, Vector3 } from 'three'
import { BUS, designOf, HUB, MODULE, PUMP_PACKAGE, type Design } from '@/sim/design'
import { bodyFrame, orbitFrame, scenePosition } from '@/sim/orbit'
import type { ClusterConfig, PartRef } from '@/sim/types'

/**
 * Where a cluster's parts sit, in metres, in its body frame: x along the truss (forward), z along the wing
 * and radiator booms, y the axis the compute modules stand on. Dimensions come from sim/design.ts.
 *
 *            wing A (+z)                              radiator R1 (+z)
 *   bus ──────┼──── M6 M5 M4 M3 M2 M1 ─────────────────┼── pumps
 *   dish      wing B (−z)                              radiator R2 (−z)
 *
 * Crosswise clusters fly with z on the orbit normal and y to zenith; towers with z to zenith and y across the
 * orbit, towards or away from the Sun (see `attitude` in sim/orbit.ts).
 */

/** Scene units per metre. The model is drawn far larger than life (a real cluster would be a speck). */
export const MODEL_SCALE = 0.0003

/** Module i (M1 is i = 0): odd-numbered modules on +y when crosswise (zenith), on the Sun side in a tower. */
export const moduleSide = (d: Design, i: number) => (i % 2 === 0 ? 1 : -1) * d.sunSide
export const modulePos = (d: Design, i: number): [number, number, number] => [
  MODULE.x0 + i * MODULE.pitch,
  moduleSide(d, i) * (MODULE.standoff + MODULE.length / 2),
  0,
]

export const wingZ = (d: Design, w: number) => (w === 0 ? 1 : -1) * (d.wing.root + d.wing.length / 2)

/** Segment k: radiator R1 (k 0-3) reaches +z, R2 (k 4-7) reaches −z; k%4 = 0 is the inlet (nearest the truss). */
export const segmentZ = (d: Design, k: number) => {
  const side = k < 4 ? 1 : -1
  return side * (d.segment.root + d.segment.span / 2 + (k % 4) * (d.segment.span + d.segment.gap))
}

/**
 * The ground-link dish hangs off the bus so it can see the Earth: under it when crosswise (nadir is −y), on
 * its shaded side in a tower (nadir is −z), clear of the lower wing. `tilt` turns the −y-pointing dish to nadir.
 */
export function dishMount(d: Design): { position: [number, number, number]; tilt: number } {
  return d.attitude === 'tower'
    ? { position: [BUS.x, -d.sunSide * (BUS.section / 2 + 1.6), -BUS.section / 2 + 0.2], tilt: Math.PI / 2 }
    : { position: [BUS.x, -BUS.section / 2, 0], tilt: 0 }
}

/** Where a part sits in the body frame, metres. */
export function partLocal(p: PartRef, d: Design): Vector3 {
  switch (p.kind) {
    case 'module':
      return new Vector3(...modulePos(d, p.index))
    case 'radiator':
      return new Vector3(HUB.radiatorX, 0, segmentZ(d, p.index))
    case 'wing':
      return new Vector3(HUB.wingX, 0, wingZ(d, p.index))
    case 'loop':
      return new Vector3(PUMP_PACKAGE.x, 0, 0)
    case 'dish':
      return new Vector3(BUS.x, 0, 0)
  }
}

/** Roughly how big a part is, metres: sets how close the camera comes to look at it. */
export function partSize(p: PartRef, d: Design) {
  switch (p.kind) {
    case 'module':
      return MODULE.length * 1.6
    case 'radiator':
      return Math.max(d.segment.chord, d.segment.span)
    case 'wing':
      return d.wing.length * 0.8
    case 'loop':
    case 'dish':
      return 14
  }
}

/** Camera distances, scene units: the whole cluster in view, and one part. */
export const focusDistance = (c: ClusterConfig) => designOf(c).height * MODEL_SCALE * 2.7
export const partDistance = (c: ClusterConfig, p: PartRef) => partSize(p, designOf(c)) * MODEL_SCALE * 3.4

const m = new Matrix4()
const ax = new Vector3()
const ay = new Vector3()
const az = new Vector3()

/** The cluster's pose at time t: position (scene units) and orientation of its body frame. */
export function clusterPose(c: ClusterConfig, t: number, pos: Vector3, quat: Quaternion) {
  const f = bodyFrame(c.orbit, t)
  pos.fromArray(scenePosition(c.orbit, t))
  m.makeBasis(ax.fromArray(f.x), ay.fromArray(f.y), az.fromArray(f.z))
  quat.setFromRotationMatrix(m)
}

/** World position of a part. */
export function partWorld(c: ClusterConfig, t: number, p: PartRef, out: Vector3) {
  const q = new Quaternion()
  clusterPose(c, t, out, q)
  const local = partLocal(p, designOf(c)).multiplyScalar(MODEL_SCALE).applyQuaternion(q)
  return out.add(local)
}

/**
 * Camera offset for the focused view: behind, above and off to the side. A tower is seen from its sunlit
 * side, so the wings face the camera.
 */
export function chaseOffset(c: ClusterConfig, t: number, distance: number, out: Vector3) {
  const f = orbitFrame(c.orbit, t)
  const d = designOf(c)
  // In a tower the Sun is on body +y × sunSide, and body y is the reverse of the orbit frame's normal.
  const side = d.attitude === 'tower' ? -d.sunSide : 1
  out
    .set(0, 0, 0)
    .addScaledVector(ax.fromArray(f.along), -0.62)
    .addScaledVector(ay.fromArray(f.zenith), 0.5)
    .addScaledVector(az.fromArray(f.normal), 0.62 * side)
  return out.normalize().multiplyScalar(distance)
}
