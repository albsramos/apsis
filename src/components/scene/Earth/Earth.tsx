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
 * The Earth as a dotted globe, with a thin atmosphere rim. It is a backdrop: the orbits and clusters are
 * the subject. In the Faults lens the South Atlantic Anomaly appears on it. `children` sit in the Earth's
 * rotating frame (ground tracks, ground stations).
 */
export function Earth({ children }: { children?: ReactNode }) {
  const land = useTexture('/textures/land_mask_1024.png')
  land.minFilter = LinearFilter
  land.generateMipmaps = false

  const group = useRef<Group>(null)
  const p = palette()

  const earthMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: earthVert,
        fragmentShader: earthFrag,
        uniforms: {
          landMap: { value: land },
          sunDir: { value: SUN },
          uOcean: { value: p['globe-ocean'] },
          uLand: { value: p['globe-land'] },
          uAtmos: { value: p.atmosphere },
          uSaa: { value: 0 },
          uSaaCenter: { value: [SAA.lon, SAA.lat] },
          uSaaRadius: { value: [SAA.rLon, SAA.rLat] },
          uSaaColor: { value: p.saa },
          uTime: { value: 0 },
          uStep: { value: DOT_STEP },
        },
      }),
    [land, p],
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
