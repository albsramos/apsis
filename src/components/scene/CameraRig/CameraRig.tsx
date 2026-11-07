import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { clusterById } from '@/sim/fleet'
import { orbitFrame } from '@/sim/orbit'
import type { ClusterConfig } from '@/sim/types'
import { clock, useApsis } from '@/store'
import { REDUCED_MOTION, useMediaQuery } from '@/lib/useMediaQuery'
import { chaseOffset, clusterPose, partWorld } from '../ClusterModel/layout'

export const OVERVIEW_DISTANCE = 6.2
const FOCUS_DISTANCE = 0.085
const PART_DISTANCE = 0.042
/** The camera never dips closer to the Earth's centre than this during a flight. */
const MIN_RADIUS = 1.12

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const phase = (t: number, a: number, b: number) => ease(clamp01((t - a) / (b - a)))
const logLerp = (a: number, b: number, e: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * e)

type Kind = 'dive' | 'rise' | 'hop' | 'part'

interface Flight {
  kind: Kind
  t: number
  dur: number
  fromTarget: Vector3
  fromOffset: Vector3
  from: ClusterConfig | null
  /** For hops: total angle travelled (radians); sets how far the camera pulls back */
  angle: number
}

/**
 * Owns the camera. Every way of selecting (click, list, ⌘K, URL) ends here.
 *
 * A flight interpolates two things: the point the camera looks at (target) and the camera's offset from it.
 * Both end exactly where the focused view wants them, and the camera looks at the target every frame, so a
 * flight lands with no correction at the end.
 *
 * - dive (fleet → cluster): turn towards the cluster while still far out, then descend onto it.
 * - rise (cluster → fleet): pull straight back along the current view direction.
 * - hop (cluster → cluster): ride along the current orbit to the point nearest the next cluster, cross over
 *   to its orbit, and pull back on the way, further the further apart they are (opposite sides of the Earth
 *   means nearly a full zoom out and back in).
 */
export function CameraRig() {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const reduced = useMediaQuery(REDUCED_MOTION)
  const r = useRef({ key: 'init', flight: null as Flight | null, last: new Vector3(), hasLast: false, prev: null as ClusterConfig | null })
  const v = useMemo(
    () => ({ anchor: new Vector3(), off: new Vector3(), target: new Vector3(), offset: new Vector3(), a: new Vector3(), b: new Vector3(), tmp: new Vector3(), q: new Quaternion() }),
    [],
  )

  useFrame((state, dt) => {
    if (!controls) return
    const cam = state.camera
    // Dev only: lets the transition test sample the camera path.
    if (import.meta.env.DEV) (window as unknown as { __apsisCam?: unknown }).__apsisCam = { p: cam.position, t: controls.target, flying: !!r.current.flight }
    const st = useApsis.getState()
    const c = clusterById(st.selectedId) ?? null
    const part = c && st.focusPart?.clusterId === c.id ? st.focusPart.part : null
    const key = `${c?.id ?? ''}|${part ? JSON.stringify(part) : ''}`
    const rig = r.current
    const t = clock.view()

    // A new destination: plan a flight from wherever the camera is now (even mid-flight).
    if (key !== rig.key) {
      const first = rig.key === 'init'
      const from = rig.prev
      rig.key = key
      rig.hasLast = false
      if (!(first && !c)) {
        let kind: Kind = !c ? 'rise' : !from ? 'dive' : from.id === c.id ? 'part' : 'hop'
        // A hop that starts from far out (the user zoomed away) is really a dive.
        if (kind === 'hop' && cam.position.distanceTo(controls.target) > 0.8) kind = 'dive'
        const angle = kind === 'hop' ? hopAngle(from!, c!, t) : 0
        const dur = reduced ? 0.3 : kind === 'part' ? 0.9 : kind === 'rise' ? 1.5 : kind === 'dive' ? 2.0 : 1.6 + 1.2 * (angle / Math.PI)
        rig.flight = { kind, t: 0, dur, fromTarget: controls.target.clone(), fromOffset: cam.position.clone().sub(controls.target), from, angle }
        controls.enabled = false
      }
      rig.prev = c
    }

    // Where the focused view wants to be right now.
    if (c) {
      if (part) partWorld(c.orbit, t, part, v.anchor)
      else clusterPose(c.orbit, t, v.anchor, v.q)
      chaseOffset(c.orbit, t, part ? PART_DISTANCE : FOCUS_DISTANCE, v.off)
    } else {
      v.anchor.set(0, 0, 0)
    }

    const f = rig.flight
    if (f) {
      f.t = Math.min(1, f.t + dt / f.dur)
      const e = ease(f.t)
      const fromDir = v.a.copy(f.fromOffset).normalize()
      const startLen = f.fromOffset.length()
      switch (f.kind) {
        case 'dive': {
          // Turn while far out, view the cluster from above (so the approach never crosses the Earth),
          // then settle into the chase view as the camera descends.
          const descend = phase(f.t, 0.2, 1)
          v.target.lerpVectors(f.fromTarget, v.anchor, descend)
          const outward = v.tmp.copy(v.anchor).normalize()
          const dir = slerp(slerp(fromDir, outward, phase(f.t, 0, 0.6)), v.b.copy(v.off).normalize(), phase(f.t, 0.55, 1))
          v.offset.copy(dir).multiplyScalar(logLerp(startLen, v.off.length(), descend))
          break
        }
        case 'rise': {
          // Pull straight out from the Earth along the camera's own radial line (so it can never come closer),
          // while the target slides back to the centre.
          v.target.lerpVectors(f.fromTarget, v.anchor, e)
          const start = v.b.copy(f.fromTarget).add(f.fromOffset)
          const r0 = start.length()
          const radius = logLerp(r0, OVERVIEW_DISTANCE, e)
          v.offset.copy(start).multiplyScalar(radius / r0).sub(v.target)
          break
        }
        case 'part': {
          v.target.lerpVectors(f.fromTarget, v.anchor, e)
          v.offset.copy(slerp(fromDir, v.b.copy(v.off).normalize(), e)).multiplyScalar(logLerp(startLen, v.off.length(), e))
          break
        }
        case 'hop': {
          hopTarget(f.from!, c!, t, e, v.target)
          // Blend the two chase views; mid-flight, lift outwards and pull back in proportion to the distance.
          const bump = Math.sin(Math.PI * e)
          const pull = 1 + (1.5 + 30 * (f.angle / Math.PI) ** 2) * bump
          const dir = slerp(fromDir, v.b.copy(v.off).normalize(), e)
          dir.addScaledVector(v.tmp.copy(v.target).normalize(), 1.6 * bump * Math.min(1, f.angle * 1.5)).normalize()
          v.offset.copy(dir).multiplyScalar(logLerp(startLen, v.off.length(), e) * pull)
          break
        }
      }
      cam.position.copy(v.target).add(v.offset)
      const rad = cam.position.length()
      if (rad < MIN_RADIUS) cam.position.multiplyScalar(MIN_RADIUS / rad)
      controls.target.copy(v.target)
      cam.lookAt(v.target)

      if (f.t >= 1) {
        rig.flight = null
        controls.enabled = true
        rig.last.copy(v.anchor)
        rig.hasLast = true
      }
    } else if (c && st.follow) {
      // Ride along: move the camera with the cluster, keep whatever angle the user chose.
      if (rig.hasLast) cam.position.add(v.tmp.copy(v.anchor).sub(rig.last))
      controls.target.copy(v.anchor)
      rig.last.copy(v.anchor)
      rig.hasLast = true
    }

    controls.minDistance = c ? 0.02 : 1.6
    controls.maxDistance = c ? 0.9 : 14
    controls.rotateSpeed = c ? 0.6 : 0.45
  })

  return null
}

const ua = new Vector3()
const ub = new Vector3()
const n = new Vector3()
const q = new Vector3()
const tmpQ = new Quaternion()
const tmpP = new Vector3()

function poseRadius(c: ClusterConfig, t: number, unit?: Vector3) {
  clusterPose(c.orbit, t, tmpP, tmpQ)
  const r = tmpP.length()
  if (unit) unit.copy(tmpP).divideScalar(r)
  return r
}

/** Angle along the hop route: along orbit A to the point nearest B, then across to B. */
function hopAngle(a: ClusterConfig, b: ClusterConfig, t: number) {
  poseRadius(a, t, ua)
  n.fromArray(orbitFrame(a.orbit, t).normal)
  poseRadius(b, t, ub)
  nearestOnPlane(ub, n, q)
  return Math.abs(signedAngle(ua, q, n)) + q.angleTo(ub)
}

/**
 * The hop route's target at progress e: first along orbit A (rotating about its normal, so it stays on the
 * ring), then across to the destination on a great circle, the radius blending between the two orbits.
 */
function hopTarget(a: ClusterConfig, b: ClusterConfig, t: number, e: number, out: Vector3) {
  const rA = poseRadius(a, t, ua)
  n.fromArray(orbitFrame(a.orbit, t).normal)
  const rB = poseRadius(b, t, ub)
  nearestOnPlane(ub, n, q)
  const along = signedAngle(ua, q, n)
  const across = q.angleTo(ub)
  const total = Math.abs(along) + across || 1
  const split = Math.abs(along) / total
  if (e < split) {
    return out.copy(ua).applyAxisAngle(n, along * (e / split)).multiplyScalar(rA)
  }
  const k = split < 1 ? (e - split) / (1 - split) : 1
  return out.copy(slerp(q, ub, k)).multiplyScalar(rA + (rB - rA) * k)
}

function nearestOnPlane(p: Vector3, normal: Vector3, out: Vector3) {
  out.copy(p).addScaledVector(normal, -p.dot(normal))
  if (out.lengthSq() < 1e-8) out.copy(normal).cross(new Vector3(0, 1, 0))
  return out.normalize()
}

function signedAngle(a: Vector3, b: Vector3, axis: Vector3) {
  const c = new Vector3().crossVectors(a, b)
  return Math.atan2(c.dot(axis), a.dot(b))
}

function slerp(a: Vector3, b: Vector3, t: number) {
  const angle = a.angleTo(b)
  if (angle < 1e-4) return b.clone()
  const s = Math.sin(angle)
  return new Vector3().addScaledVector(a, Math.sin((1 - t) * angle) / s).addScaledVector(b, Math.sin(t * angle) / s)
}
