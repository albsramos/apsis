import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import { AdditiveBlending, BackSide, Group, LinearFilter, ShaderMaterial, Vector3 } from 'three'
import { earthRotation, SAA } from '@/sim/orbit'
import { clock, useApsis } from '@/store'
import { palette } from '@/lib/palette'
import { atmosphereFrag, atmosphereVert, earthFrag, earthVert } from './shaders'

const SUN = new Vector3(1, 0, 0)
/** Degrees between dot rows */
const DOT_STEP = 1.1

/**
 * The Earth as a dotted globe in the manner of GitHub's: an indigo sphere shaded from light into shadow, land
 * as dots that light up where people are, and a halo on the sunward limb. It is a backdrop: the orbits and
 * clusters are the subject. In the Faults lens the South Atlantic Anomaly appears on it. `children` sit in the Earth's
 * rotating frame (ground tracks, ground stations).
 */
export function Earth({ children }: { children?: ReactNode }) {
  const [land, activity] = useTexture([
    `${import.meta.env.BASE_URL}textures/land_mask_1024.png`,
    `${import.meta.env.BASE_URL}textures/activity_1024.png`,
  ])
  // Both maps are data, looked up once per dot at its centre; neither is drawn on the globe.
  for (const t of [land, activity]) {
    t.minFilter = LinearFilter
    t.generateMipmaps = false
  }

  const group = useRef<Group>(null)
  const p = palette()

  const earthMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: earthVert,
        fragmentShader: earthFrag,
        uniforms: {
          landMap: { value: land },
          activityMap: { value: activity },
          sunDir: { value: SUN },
          uOcean: { value: p['globe-ocean'] },
          uShade: { value: p['globe-shade'] },
          uLand: { value: p['globe-land'] },
          uActive: { value: p['globe-active'] },
          uAtmos: { value: p.atmosphere },
          uSaa: { value: 0 },
          uSaaCenter: { value: [SAA.lon, SAA.lat] },
          uSaaRadius: { value: [SAA.rLon, SAA.rLat] },
          uSaaColor: { value: p.saa },
          uTime: { value: 0 },
          uStep: { value: DOT_STEP },
          uLod: { value: 0 },
          uDim: { value: 1 },
        },
      }),
    [land, activity, p],
  )

  const atmosMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: atmosphereVert,
        fragmentShader: atmosphereFrag,
        uniforms: { sunDir: { value: SUN }, uColor: { value: p.atmosphere }, uShell: { value: 1.08 } },
        side: BackSide,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    [p],
  )

  useFrame((state, dt) => {
    if (group.current) group.current.rotation.y = earthRotation(clock.view())
    const target = useApsis.getState().lens === 'faults' ? 1 : 0
    const u = earthMat.uniforms
    u.uSaa.value += (target - u.uSaa.value) * Math.min(1, dt * 4)
    u.uTime.value = state.clock.elapsedTime
    // Height above the surface → finer, dimmer dots (up to 3 halvings: 1.1° → 0.14°).
    const h = Math.max(0.02, state.camera.position.length() - 1)
    const lod = Math.min(3, Math.max(0, Math.log2(4.5 / h) * 0.8))
    u.uLod.value += (lod - u.uLod.value) * Math.min(1, dt * 5)
    u.uDim.value = 1 - 0.6 * (u.uLod.value / 3)
  })

  return (
    <>
      <group ref={group}>
        <mesh material={earthMat} name="earth">
          <sphereGeometry args={[1, 128, 96]} />
        </mesh>
        {children}
      </group>
      <mesh material={atmosMat} raycast={() => null}>
        <sphereGeometry args={[1.08, 96, 72]} />
      </mesh>
    </>
  )
}
