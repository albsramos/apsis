import { Matrix4, Quaternion, Vector3 } from 'three'
import type { Orbit, PartRef } from '@/sim/types'
import { orbitFrame, scenePosition } from '@/sim/orbit'

/**
 * Geometry of a cluster in its own frame: x along-track (the truss), y zenith (away from Earth),
 * z the orbit normal (where the wings and radiators reach out).
 *
 *        wing A (+z)                 radiator R1 (+z)
 *   dish ─┼─ M2  M4  M6 ─── truss ───┼
 *        wing B (−z)  M1  M3  M5     radiator R2 (−z)
 */
export const MODEL_SCALE = 0.012

export const TRUSS = { length: 2.3, x0: -1.05, x1: 1.25 }
export const WING_X = 0.98
export const RADIATOR_X = -0.98
export const DISH_X = 1.22

export const modulePos = (i: number): [number, number, number] => [-0.68 + i * 0.27, i % 2 ? -0.17 : 0.17, 0]

export const WING = { width: 0.5, length: 1.25, offset: 0.12 }
export const wingZ = (w: number) => (w === 0 ? 1 : -1) * (WING.offset + WING.length / 2)

export const SEGMENT = { width: 0.46, length: 0.29, gap: 0.025, offset: 0.12 }
/** Segment k: radiator R1 (k 0-3) reaches +z, R2 (k 4-7) reaches −z; k%4 = 0 is the inlet (nearest the truss). */
export const segmentZ = (k: number) => {
  const side = k < 4 ? 1 : -1
  const s = k % 4
  return side * (SEGMENT.offset + SEGMENT.length / 2 + s * (SEGMENT.length + SEGMENT.gap))
}

/** Where a part sits in the model frame (before scaling). */
export function partLocal(p: PartRef): Vector3 {
  switch (p.kind) {
    case 'module':
      return new Vector3(...modulePos(p.index))
    case 'radiator':
      return new Vector3(RADIATOR_X, 0, segmentZ(p.index))
    case 'wing':
      return new Vector3(WING_X, 0, wingZ(p.index))
    case 'loop':
      return new Vector3(-0.3, 0, 0.07)
    case 'dish':
      return new Vector3(DISH_X, -0.15, 0)
  }
}

const m = new Matrix4()
const ax = new Vector3()
const ay = new Vector3()
const az = new Vector3()

/** The cluster's pose at time t: position (scene units) and orientation. */
export function clusterPose(o: Orbit, t: number, pos: Vector3, quat: Quaternion) {
  const f = orbitFrame(o, t)
  pos.fromArray(scenePosition(o, t))
  ax.fromArray(f.along)
  ay.fromArray(f.zenith)
  az.fromArray(f.normal)
  m.makeBasis(ax, ay, az)
  quat.setFromRotationMatrix(m)
}

/** World position of a part. */
export function partWorld(o: Orbit, t: number, p: PartRef, out: Vector3) {
  const q = new Quaternion()
  clusterPose(o, t, out, q)
  const local = partLocal(p).multiplyScalar(MODEL_SCALE).applyQuaternion(q)
  return out.add(local)
}

/** Camera offset for the focused view: behind, above and off to the side, in the cluster frame. */
export function chaseOffset(o: Orbit, t: number, distance: number, out: Vector3) {
  const f = orbitFrame(o, t)
  out
    .set(0, 0, 0)
    .addScaledVector(ax.fromArray(f.along), -0.62)
    .addScaledVector(ay.fromArray(f.zenith), 0.5)
    .addScaledVector(az.fromArray(f.normal), 0.62)
  return out.normalize().multiplyScalar(distance)
}
