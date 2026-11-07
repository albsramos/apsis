import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Line, ShaderMaterial, Sprite, SpriteMaterial } from 'three'
import { clusterById, GROUND_STATIONS } from '@/sim/fleet'
import { isEclipsed, localFromLatLon, orbitFrame, periodS, toEarthFrame } from '@/sim/orbit'
import { clock, useApsis } from '@/store'
import { palette } from '@/lib/palette'
import { glowTexture } from '@/lib/textures'

const N = 360
const LIFT = 1.004

const vert = /* glsl */ `
attribute float aRel;
attribute float aShadow;
varying float vRel;
varying float vShadow;
void main() {
  vRel = aRel;
  vShadow = aShadow;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const frag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uShadowColor;
uniform float uOpacity;
varying float vRel;
varying float vShadow;
void main() {
  // vRel: -0.5 (half an orbit ago) … 0 (now) … 1 (an orbit ahead)
  float past = smoothstep(-0.5, 0.0, vRel) * 0.35;
  float ahead = (1.0 - smoothstep(0.0, 1.0, vRel)) * 0.95;
  float a = (vRel < 0.0 ? past : ahead) * uOpacity;
  vec3 c = mix(uColor, uShadowColor, vShadow);
  gl_FragColor = vec4(c * 1.4, a);
}
`

/**
 * The selected cluster's path over the ground: half an orbit behind, one ahead, with the stretches in
 * Earth's shadow tinted. Lives in the Earth's rotating frame, so it curves the way real ground tracks do.
 * Also draws the ground stations.
 */
export function GroundTrack() {
  const p = palette()
  const line = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array((N + 1) * 3), 3))
    g.setAttribute('aRel', new Float32BufferAttribute(new Float32Array(N + 1), 1))
    g.setAttribute('aShadow', new Float32BufferAttribute(new Float32Array(N + 1), 1))
    const m = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uColor: { value: p['viz-active'].clone() },
        uShadowColor: { value: p['fg-subtle'].clone() },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    const l = new Line(g, m)
    l.raycast = () => {}
    l.frustumCulled = false
    return l
  }, [p])
  const nadir = useRef<Sprite>(null)
  const nadirMat = useMemo(
    () => new SpriteMaterial({ map: glowTexture(), color: p['viz-active'].clone().multiplyScalar(2), blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    [p],
  )
  const last = useRef({ id: '', t: -Infinity })

  useFrame((_, dt) => {
    const id = useApsis.getState().selectedId
    const m = line.material as ShaderMaterial
    m.uniforms.uOpacity.value += ((id ? 1 : 0) - m.uniforms.uOpacity.value) * Math.min(1, dt * 3)
    if (nadir.current) nadir.current.visible = !!id
    const c = clusterById(id)
    if (!c) return
    const t = clock.view()
    const P = periodS(c.orbit)
    if (nadir.current) {
      const l = toEarthFrame(orbitFrame(c.orbit, t).zenith, t)
      nadir.current.position.set(l[0] * LIFT, l[1] * LIFT, l[2] * LIFT)
      nadir.current.scale.setScalar(0.035)
    }
    if (last.current.id === c.id && Math.abs(t - last.current.t) < P / 400) return
    last.current = { id: c.id, t }
    const pos = line.geometry.getAttribute('position') as Float32BufferAttribute
    const rel = line.geometry.getAttribute('aRel') as Float32BufferAttribute
    const sh = line.geometry.getAttribute('aShadow') as Float32BufferAttribute
    for (let k = 0; k <= N; k++) {
      const r = -0.5 + (1.5 * k) / N
      const tk = t + r * P
      const l = toEarthFrame(orbitFrame(c.orbit, tk).zenith, tk)
      pos.setXYZ(k, l[0] * LIFT, l[1] * LIFT, l[2] * LIFT)
      rel.setX(k, r)
      sh.setX(k, isEclipsed(c.orbit, tk) ? 1 : 0)
    }
    pos.needsUpdate = rel.needsUpdate = sh.needsUpdate = true
  })

  return (
    <>
      <primitive object={line} />
      <sprite ref={nadir} material={nadirMat} />
      {GROUND_STATIONS.map((g) => (
        <Station key={g.name} lat={g.lat} lon={g.lon} color={p.fg} />
      ))}
    </>
  )
}

function Station({ lat, lon, color }: { lat: number; lon: number; color: Color }) {
  const mat = useMemo(
    () => new SpriteMaterial({ map: glowTexture(), color: color.clone().multiplyScalar(0.9), blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    [color],
  )
  const l = localFromLatLon(lat, lon)
  return <sprite material={mat} position={[l[0] * 1.003, l[1] * 1.003, l[2] * 1.003]} scale={0.022} />
}
