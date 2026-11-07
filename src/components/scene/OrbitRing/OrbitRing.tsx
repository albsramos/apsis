import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Line, ShaderMaterial } from 'three'
import type { ClusterConfig } from '@/sim/types'
import { meanMotion, scenePosition } from '@/sim/orbit'
import { clock, telemetry, useApsis } from '@/store'
import { lensColor } from '../lensColor'

const N = 384

const vert = /* glsl */ `
attribute float aPhase;
attribute float aShadow;
uniform float uPhase;
varying float vTail;
varying float vShadow;
void main() {
  vShadow = aShadow;
  float behind = fract(uPhase - aPhase);
  vTail = 1.0 - smoothstep(0.0, 0.32, behind);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const frag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vTail;
varying float vShadow;
void main() {
  // Stretches inside Earth's shadow are drawn dimmer: that is where the cluster runs on battery.
  float a = uOpacity * (0.22 + 0.78 * vTail * vTail) * (1.0 - 0.62 * vShadow);
  gl_FragColor = vec4(uColor * (1.0 + vTail * 1.6), a);
}
`

/** One orbit, with a bright comet tail behind the cluster, coloured by the active lens. */
export function OrbitRing({ cluster }: { cluster: ClusterConfig }) {
  const { orbit } = cluster
  const line = useMemo(() => {
    const n = meanMotion(orbit)
    const phase0 = (orbit.phaseDeg * Math.PI) / 180
    const pos: number[] = []
    const ph: number[] = []
    const sh: number[] = []
    for (let k = 0; k <= N; k++) {
      const u = (2 * Math.PI * k) / N
      const p = scenePosition(orbit, (u - phase0) / n)
      pos.push(...p)
      ph.push(k / N)
      // The Sun is on +x, so the shadow is the cylinder behind the Earth along −x.
      sh.push(p[0] < 0 && p[1] * p[1] + p[2] * p[2] < 1 ? 1 : 0)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('aPhase', new Float32BufferAttribute(ph, 1))
    g.setAttribute('aShadow', new Float32BufferAttribute(sh, 1))
    const m = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uPhase: { value: 0 }, uColor: { value: new Color() }, uOpacity: { value: 0.6 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    const l = new Line(g, m)
    l.raycast = () => {}
    return l
  }, [orbit])

  const target = useMemo(() => new Color(), [])

  useFrame((state, dt) => {
    const m = line.material as ShaderMaterial
    const t = clock.view()
    const u = (orbit.phaseDeg * Math.PI) / 180 + meanMotion(orbit) * t
    m.uniforms.uPhase.value = (((u / (2 * Math.PI)) % 1) + 1) % 1

    const st = useApsis.getState()
    const s = telemetry(cluster.id)
    if (s) lensColor(st.lens, cluster, s, target)
    const k = Math.min(1, dt * 6)
    m.uniforms.uColor.value.lerp(target, k)
    const selected = st.selectedId === cluster.id
    const hovered = st.hoverId === cluster.id
    // Up close the ring would cut straight through the model; let it fade back.
    const p = scenePosition(orbit, t)
    const near = Math.hypot(state.camera.position.x - p[0], state.camera.position.y - p[1], state.camera.position.z - p[2])
    const opacity = selected ? 0.7 * Math.min(1, Math.max(0.12, (near - 0.05) / 0.6)) : hovered ? 0.95 : st.selectedId ? 0.12 : 0.55
    m.uniforms.uOpacity.value += (opacity - m.uniforms.uOpacity.value) * k
  })

  return <primitive object={line} />
}
