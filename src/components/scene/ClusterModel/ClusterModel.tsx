import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Color, Group, MeshStandardMaterial, ShaderMaterial } from 'three'
import { clusterById, SIM } from '@/sim/fleet'
import { sunAngleDeg } from '@/sim/orbit'
import type { ClusterSample, Lens, PartRef, Severity } from '@/sim/types'
import { actions, clock, telemetry, useApsis, useTelemetry } from '@/store'
import { heatColor, palette } from '@/lib/palette'
import { MODULE_SCALE, RADIATOR_SCALE } from '@/lib/heat'
import { radiatorTexture, solarTexture } from '@/lib/textures'
import { fmt } from '@/lib/format'
import { partName, samePart } from '@/lib/parts'
import {
  clusterPose,
  DISH_X,
  MODEL_SCALE,
  modulePos,
  partLocal,
  RADIATOR_X,
  SEGMENT,
  segmentZ,
  TRUSS,
  WING,
  WING_X,
  wingZ,
} from './layout'
import styles from './ClusterModel.module.css'

const flowVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const flowFrag = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform float uIntensity;
uniform vec3 uFrom;
uniform vec3 uTo;
varying vec2 vUv;
void main() {
  float s = fract(vUv.y * 26.0 + uTime * uSpeed);
  float stripe = smoothstep(0.0, 0.25, s) * (1.0 - smoothstep(0.45, 0.7, s));
  vec3 c = mix(uFrom, uTo, vUv.y);
  gl_FragColor = vec4(c * (0.2 + stripe * 1.5) * uIntensity, 1.0);
}
`

const rad = (d: number) => (d * Math.PI) / 180
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

type PartMat = { part: PartRef; mat: MeshStandardMaterial; base: Color }

/**
 * The cluster up close: a truss of compute modules, two sun-tracking solar wings and two radiators
 * held edge-on to the Sun. It grows out of the marker as the camera arrives (wings and radiators
 * unfold last). The lens drives every material: heat, throughput, or faults.
 */
export function ClusterModel({ id }: { id: string }) {
  const cluster = clusterById(id)!
  const root = useRef<Group>(null)
  const wings = useRef<(Group | null)[]>([])
  const radiators = useRef<(Group | null)[]>([])
  const p = palette()

  const mats = useMemo(() => {
    const hull = (hex: string, metal = 0.75, rough = 0.32) =>
      new MeshStandardMaterial({ color: hex, metalness: metal, roughness: rough })
    const part = (part: PartRef, m: MeshStandardMaterial): PartMat => ({ part, mat: m, base: m.color.clone() })
    const solar = solarTexture()
    const radTex = radiatorTexture()
    const flow = (from: Color, to: Color) =>
      new ShaderMaterial({
        vertexShader: flowVert,
        fragmentShader: flowFrag,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: 1 },
          uIntensity: { value: 0 },
          uFrom: { value: from.clone() },
          uTo: { value: to.clone() },
        },
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      })
    return {
      truss: hull('#a1a1aa', 0.85, 0.35),
      modules: Array.from({ length: 6 }, (_, i) => part({ kind: 'module', index: i }, hull('#e4e4e7', 0.55, 0.4))),
      segments: Array.from({ length: 8 }, (_, k) =>
        part({ kind: 'radiator', index: k }, new MeshStandardMaterial({ color: '#ffffff', map: radTex, metalness: 0.1, roughness: 0.55 })),
      ),
      wings: [0, 1].map((w) =>
        part({ kind: 'wing', index: w }, new MeshStandardMaterial({ color: '#ffffff', map: solar, metalness: 0.4, roughness: 0.35 })),
      ),
      dish: part({ kind: 'dish' }, hull('#f4f4f5', 0.6, 0.3)),
      coolant: flow(p['heat-2'], p['heat-1']),
      data: flow(p['viz-active'], p.fg),
    }
  }, [p])

  const tmp = useMemo(() => ({ c: new Color(), e: new Color(), w: { output: 0, thermal: 1, faults: 0 } as Record<Lens, number> }), [])
  const dark = useMemo(() => p.border.clone(), [p])

  useFrame((state, dt) => {
    const g = root.current
    if (!g) return
    const t = clock.view()
    clusterPose(cluster.orbit, t, g.position, g.quaternion)

    const dist = state.camera.position.distanceTo(g.position)
    const f = smooth(0.62, 0.16, dist)
    g.visible = f > 0.002
    if (!g.visible) return
    g.scale.setScalar(MODEL_SCALE * (0.3 + 0.7 * f))
    const deployWings = Math.max(0.02, smooth(0.35, 1, f))
    const deployRads = Math.max(0.02, smooth(0.5, 1, f))

    const st = useApsis.getState()
    const s = telemetry(cluster.id)
    if (!s) return
    const k = Math.min(1, dt * 7)
    for (const l of ['output', 'thermal', 'faults'] as Lens[]) tmp.w[l] += ((st.lens === l ? 1 : 0) - tmp.w[l]) * k
    const { output: wO, thermal: wT, faults: wF } = tmp.w
    const time = state.clock.elapsedTime
    const pulse = 0.55 + 0.45 * Math.sin(time * 5)

    // Sun tracking: wings face the Sun, radiators stay edge-on to it.
    const sun = sunAngleDeg(cluster.orbit, t)
    wings.current.forEach((wg, w) => {
      if (!wg) return
      const stalled = s.wingErrDeg[w] > 12
      wg.rotation.x = 0
      wg.rotation.z = rad(stalled ? s.wingAngleDeg[w] : sun)
      wg.scale.z = deployWings
    })
    radiators.current.forEach((rg) => {
      if (!rg) return
      rg.rotation.z = rad(sun + 90)
      rg.scale.z = deployRads
    })

    const faults = faultMap(s)
    const hover = st.hoverPart?.clusterId === cluster.id ? st.hoverPart.part : null
    const picked = st.pickedPart?.clusterId === cluster.id ? st.pickedPart.part : null

    const apply = (pm: PartMat, thermal: Color | null, output: Color | null) => {
      const sev = faults.get(key(pm.part))
      tmp.e.setRGB(0, 0, 0)
      if (thermal) addScaled(tmp.e, thermal, wT)
      if (output) addScaled(tmp.e, output, wO)
      if (sev) addScaled(tmp.e, severityColor(sev), wF * (sev === 'info' ? 0.45 : pulse) * 0.9)
      if (samePart(pm.part, hover) || samePart(pm.part, picked)) tmp.e.addScalar(samePart(pm.part, picked) ? 0.22 : 0.14)
      pm.mat.emissive.lerp(tmp.e, k)
      tmp.c.copy(pm.base).lerp(dark, wF * (sev ? 0.4 : 0.85))
      pm.mat.color.lerp(tmp.c, k)
      pm.mat.wireframe = wF > 0.5 && !sev
    }

    mats.modules.forEach((pm, i) => {
      const heat = heatColor(s.modulesC[i], MODULE_SCALE, new Color()).multiplyScalar(0.5)
      const out = p['viz-active'].clone().multiplyScalar(0.05 + 0.8 * s.util * cluster.moduleShares[i] * 6 * s.throttle)
      apply(pm, heat, out)
    })
    mats.segments.forEach((pm, k2) => {
      const heat = heatColor(s.segmentsC[k2], RADIATOR_SCALE, new Color()).multiplyScalar(0.62)
      apply(pm, heat, null)
    })
    mats.wings.forEach((pm, w) => {
      const gen = Math.max(0, Math.cos(rad(s.wingErrDeg[w]))) * (s.eclipse ? 0 : 1)
      apply(pm, null, p['viz-active'].clone().multiplyScalar(0.3 * gen))
    })
    apply(mats.dish, null, p['viz-active'].clone().multiplyScalar(0.25 + 0.5 * pulse * s.util))
    mats.truss.color.lerp(tmp.c.set('#a1a1aa').lerp(dark, wF * 0.85), k)
    mats.truss.wireframe = wF > 0.5

    const pumpFault = faults.get('loop')
    const cu = mats.coolant.uniforms
    cu.uTime.value = time
    cu.uSpeed.value = 1.6 * s.flow
    cu.uIntensity.value = wT + (pumpFault ? wF * pulse : 0)
    const du = mats.data.uniforms
    du.uTime.value = time
    du.uSpeed.value = -0.6 - 2.4 * s.util
    du.uIntensity.value = wO
  })

  const handlers = (part: PartRef) => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      actions.setHoverPart({ clusterId: cluster.id, part })
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => {
      actions.setHoverPart(null)
      document.body.style.cursor = ''
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      actions.pickPart({ clusterId: cluster.id, part })
    },
  })

  return (
    <group ref={root} visible={false}>
      {/* Truss */}
      <mesh material={mats.truss} position={[(TRUSS.x0 + TRUSS.x1) / 2, 0, 0]}>
        <boxGeometry args={[TRUSS.length, 0.07, 0.07]} />
      </mesh>
      {/* Coolant and data lines along the truss */}
      <mesh material={mats.coolant} position={[-0.2, 0, 0.065]} rotation={[0, 0, Math.PI / 2]} {...handlers({ kind: 'loop' })}>
        <cylinderGeometry args={[0.022, 0.022, 1.6, 10, 1, true]} />
      </mesh>
      <mesh material={mats.data} position={[0.25, 0, -0.065]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.016, 0.016, 1.9, 10, 1, true]} />
      </mesh>

      {/* Compute modules */}
      {mats.modules.map((pm, i) => (
        <mesh key={i} material={pm.mat} position={modulePos(i)} {...handlers(pm.part)}>
          <capsuleGeometry args={[0.085, 0.17, 6, 16]} />
        </mesh>
      ))}

      {/* Solar wings, on a boom across the truss */}
      <mesh material={mats.truss} position={[WING_X, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 2 * (WING.offset + WING.length), 8]} />
      </mesh>
      {mats.wings.map((pm, w) => (
        <group key={w} position={[WING_X, 0, 0]} ref={(el) => void (wings.current[w] = el)}>
          <mesh material={pm.mat} position={[0, 0, wingZ(w)]} {...handlers(pm.part)}>
            <boxGeometry args={[0.012, WING.width, WING.length]} />
          </mesh>
        </group>
      ))}

      {/* Radiators, four segments each */}
      <mesh material={mats.truss} position={[RADIATOR_X, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 2 * (SEGMENT.offset + 4 * (SEGMENT.length + SEGMENT.gap)), 8]} />
      </mesh>
      {[0, 1].map((r) => (
        <group key={r} position={[RADIATOR_X, 0, 0]} ref={(el) => void (radiators.current[r] = el)}>
          {mats.segments.slice(r * 4, r * 4 + 4).map((pm, s) => (
            <mesh key={s} material={pm.mat} position={[0, 0, segmentZ(r * 4 + s)]} {...handlers(pm.part)}>
              <boxGeometry args={[0.012, SEGMENT.width, SEGMENT.length]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Comms dish, pointing at the ground */}
      <group position={[DISH_X, 0, 0]} {...handlers({ kind: 'dish' })}>
        <mesh material={mats.truss} position={[0, -0.06, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.12, 6]} />
        </mesh>
        <mesh material={mats.dish.mat} position={[0, -0.15, 0]} rotation={[Math.PI, 0, 0]}>
          <sphereGeometry args={[0.13, 24, 8, 0, Math.PI * 2, 0, 0.9]} />
        </mesh>
      </group>

      <PartTooltip clusterId={cluster.id} />
    </group>
  )
}

const addScaled = (out: Color, c: Color, s: number) => out.setRGB(out.r + c.r * s, out.g + c.g * s, out.b + c.b * s)

const key = (p: PartRef) => ('index' in p ? `${p.kind}-${p.index}` : p.kind)

function faultMap(s: ClusterSample) {
  const m = new Map<string, Severity>()
  for (const f of s.faults) if (!m.has(key(f.part))) m.set(key(f.part), f.severity)
  return m
}

function severityColor(sev: Severity) {
  const p = palette()
  return sev === 'critical' ? p.danger : sev === 'warn' ? p['viz-warn'] : p['viz-active']
}

/** What the part under the pointer is doing. */
function PartTooltip({ clusterId }: { clusterId: string }) {
  const hover = useApsis((s) => (s.hoverPart?.clusterId === clusterId ? s.hoverPart.part : null))
  const s = useTelemetry(clusterId)
  if (!hover || !s) return null
  const pos = partLocal(hover)
  const fault = s.faults.find((f) => samePart(f.part, hover))
  return (
    <Html position={[pos.x, pos.y + 0.25, pos.z]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
      <div className={styles.tip}>
        <div className={styles.tipTitle}>{partName(hover)}</div>
        <div className={styles.tipRow}>{partDetail(hover, s)}</div>
        {fault && <div className={styles[fault.severity]}>{fault.title}</div>}
      </div>
    </Html>
  )
}

function partDetail(p: PartRef, s: ClusterSample) {
  switch (p.kind) {
    case 'module': {
      const t = s.modulesC[p.index]
      return `${fmt.temp(t)} · ${(SIM.moduleLimitC - t).toFixed(1)}°C margin`
    }
    case 'radiator':
      return s.segmentAlive[p.index] ? fmt.temp(s.segmentsC[p.index]) : `No flow · ${fmt.temp(s.segmentsC[p.index])}`
    case 'wing':
      return `${s.wingErrDeg[p.index] > 12 ? 'Stalled' : 'Tracking'} · ${s.wingErrDeg[p.index].toFixed(0)}° off Sun`
    case 'loop':
      return `${fmt.temp(s.loopC)} · flow ${fmt.pct(s.flow)}`
    case 'dish':
      return `${fmt.pf(s.outputPf)} · battery ${fmt.pct(s.soc)}`
  }
}

