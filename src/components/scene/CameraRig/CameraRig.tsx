import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { clusterById } from '@/sim/fleet'
import { useApsis } from '@/store'
import { clock } from '@/store'
import { REDUCED_MOTION, useMediaQuery } from '@/lib/useMediaQuery'
import { chaseOffset, clusterPose, partWorld } from '../ClusterModel/layout'
import { Quaternion } from 'three'

export const OVERVIEW_DISTANCE = 6.2
const FOCUS_DISTANCE = 0.085
const PART_DISTANCE = 0.042

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * Owns the camera. Every way of selecting (click, list, ⌘K, URL) ends here: when the selection or the
 * focused part changes, the camera flies along an arc around the Earth (never through it), zooming on
 * a log scale so the approach feels even. Once it arrives it rides along with the cluster ("follow"),
 * while OrbitControls still lets you look around.
 */
export function CameraRig() {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const reduced = useMediaQuery(REDUCED_MOTION)
  const r = useRef({
    key: 'init',
    t: 1,
    dur: 1.6,
    fromPos: new Vector3(),
    fromTarget: new Vector3(),
    last: new Vector3(),
    hasLast: false,
  })
  const v = useMemo(
    () => ({ anchor: new Vector3(), desired: new Vector3(), off: new Vector3(), dirA: new Vector3(), dirB: new Vector3(), q: new Quaternion() }),
    [],
  )

  useFrame((state, dt) => {
    if (!controls) return
    const cam = state.camera
    const st = useApsis.getState()
    const c = clusterById(st.selectedId)
    const part = c && st.focusPart?.clusterId === c.id ? st.focusPart.part : null
    const key = `${c?.id ?? ''}|${part ? JSON.stringify(part) : ''}`
    const rig = r.current
    const t = clock.view()

    if (key !== rig.key) {
      const first = rig.key === 'init'
      rig.key = key
      rig.fromPos.copy(cam.position)
      rig.fromTarget.copy(controls.target)
      rig.t = first && !c ? 1 : 0
      rig.dur = reduced ? 0.25 : part ? 0.9 : c ? 1.7 : 1.4
      rig.hasLast = false
    }

    // Where we want to look, and from where.
    if (c) {
      if (part) partWorld(c.orbit, t, part, v.anchor)
      else clusterPose(c.orbit, t, v.anchor, v.q)
      chaseOffset(c.orbit, t, part ? PART_DISTANCE : FOCUS_DISTANCE, v.off)
      v.desired.copy(v.anchor).add(v.off)
    } else {
      v.anchor.set(0, 0, 0)
      v.desired.copy(rig.fromPos).normalize().multiplyScalar(OVERVIEW_DISTANCE)
      if (v.desired.lengthSq() === 0) v.desired.set(0, 0, OVERVIEW_DISTANCE)
    }

    if (rig.t < 1) {
      controls.enabled = false
      rig.t = Math.min(1, rig.t + dt / rig.dur)
      const e = ease(rig.t)
      const a = rig.fromPos.length()
      const b = v.desired.length()
      v.dirA.copy(rig.fromPos).divideScalar(a)
      v.dirB.copy(v.desired).divideScalar(b)
      // Slerp the direction (arc around the Earth), log-lerp the radius (even-feeling zoom)…
      const angle = v.dirA.angleTo(v.dirB)
      const dir = angle < 1e-4 ? v.dirB : slerp(v.dirA, v.dirB, angle, e)
      const radius = Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * e)
      cam.position.copy(dir).multiplyScalar(radius)
      // …then blend into the exact chase position over the last stretch, so it lands precisely.
      if (c) cam.position.lerp(v.desired, smoothstep(0.7, 1, rig.t))
      controls.target.lerpVectors(rig.fromTarget, v.anchor, e)
      if (rig.t === 1) {
        controls.enabled = true
        rig.last.copy(v.anchor)
        rig.hasLast = true
      }
    } else if (c && st.follow) {
      // Ride along: move the camera with the cluster, keep whatever angle the user chose.
      if (rig.hasLast) cam.position.add(v.off.copy(v.anchor).sub(rig.last))
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

function slerp(a: Vector3, b: Vector3, angle: number, t: number) {
  const s = Math.sin(angle)
  const wa = Math.sin((1 - t) * angle) / s
  const wb = Math.sin(t * angle) / s
  return new Vector3().addScaledVector(a, wa).addScaledVector(b, wb)
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
