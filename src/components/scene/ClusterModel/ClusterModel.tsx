import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Color, DoubleSide, Group, MeshStandardMaterial, ShaderMaterial } from 'three'
import { clusterById, SIM } from '@/sim/fleet'
import { sunAngleDeg } from '@/sim/orbit'
import type { ClusterSample, Lens, PartRef, Severity } from '@/sim/types'
import { actions, clock, telemetry, useApsis, useTelemetry } from '@/store'
import { heatColor, palette } from '@/lib/palette'
import { MODULE_SCALE, RADIATOR_SCALE } from '@/lib/heat'
import { radiatorTexture, solarTexture } from '@/lib/textures'
import { fmt } from '@/lib/format'
import { partName, samePart } from '@/lib/parts'
import { BUS, designOf, DISH_RADIUS, HUB, MAST_RADIUS, MODULE, PUMP_PACKAGE, TRUSS } from '@/sim/design'
import { clusterPose, dishMount, MODEL_SCALE, modulePos, partLocal, segmentZ, wingZ } from './layout'
import styles from './ClusterModel.module.css'

const flowVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`
/**
 * Neon flow: comet-like pulses (a bright head with a fading tail) racing along the pipe at the fluid's
 * speed, over a dim glowing core with brighter edges, so it reads as light inside a tube.
 */
const flowFrag = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform float uIntensity;
uniform float uDensity;
uniform vec3 uFrom;
uniform vec3 uTo;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  float s = fract(uTime * uSpeed - vUv.y * uDensity);
  float head = exp(-s * 7.0) + 0.6 * exp(-(1.0 - s) * 40.0);
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.4);
  vec3 c = mix(uFrom, uTo, vUv.y);
  gl_FragColor = vec4(c * (0.3 + 0.8 * rim + 5.0 * head) * uIntensity, 1.0);
}
`

const rad = (d: number) => (d * Math.PI) / 180
/** Coolant, data and power lines run just outside the truss, drawn about three times their true bore so they read. */
const LINE_Z = TRUSS.section / 2 + 0.2
/** The dish is a cap of this sphere, 0.9 rad wide */
const DISH_SPHERE = DISH_RADIUS / Math.sin(0.9)
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

type PartMat = { part: PartRef; mat: MeshStandardMaterial; base: Color }

/**
 * The cluster up close, to scale, as dimensioned in sim/design.ts (and drawn in docs/): a truss carrying six
 * small compute modules, a thermal control package aft and the bus forward, two sun-tracking solar wings and
 * two radiators held edge-on to the Sun. It grows out of the marker as the camera arrives (wings and
 * radiators unfold last). The lens drives every material: heat, throughput, or faults.
 */
export function ClusterModel({ id }: { id: string }) {
  const cluster = clusterById(id)!
  const d = designOf(cluster)
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
    const flow = (from: Color, to: Color, density: number) =>
      new ShaderMaterial({
        vertexShader: flowVert,
        fragmentShader: flowFrag,
        uniforms: {
          uTime: { value: 0 },
          uSpeed: { value: 1 },
          uIntensity: { value: 0 },
          uDensity: { value: density },
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
      pumps: part({ kind: 'loop' }, hull('#d4d4d8', 0.6, 0.35)),
      // Coolant, cool (pale) at the radiators to warm (blue) at the modules; one material per pipe length so
      // the pulse spacing looks the same on every pipe.
      coolant: flow(p['heat-2'], p['viz-active'], 9),
      branch: flow(p['viz-active'], p['heat-2'], 1),
      boom: flow(p['heat-2'], p['viz-active'], 8),
      segPipes: Array.from({ length: 8 }, () => flow(p['heat-2'], p['viz-active'], 2)),
      // Output: data from each module into the line along the truss, out of the dish as a downlink beam;
      // power from the wing tips inwards.
      data: flow(p['viz-active'], p.fg, 10),
      dataBranch: flow(p['viz-active'], p['viz-active'], 1),
      downlink: Object.assign(flow(p['viz-active'], new Color(0, 0, 0), 4), { side: DoubleSide }),
      power: [0, 1].map(() => flow(p.fg, p['heat-2'], 6)),
    }
  }, [p])

  const tmp = useMemo(() => ({ c: new Color(), e: new Color(), w: { output: 0, thermal: 1, faults: 0 } as Record<Lens, number> }), [])
  const dark = useMemo(() => p.border.clone(), [p])

  useFrame((state, dt) => {
    const g = root.current
    if (!g) return
    const t = clock.view()
    clusterPose(cluster, t, g.position, g.quaternion)

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
      // To scale, a faulted part can be a small thing on a big structure: keep the rest faintly lit around it.
      else addScaled(tmp.e, p['fg-subtle'], wF * 0.4)
      if (samePart(pm.part, hover) || samePart(pm.part, picked)) tmp.e.addScalar(samePart(pm.part, picked) ? 0.22 : 0.14)
      pm.mat.emissive.lerp(tmp.e, k)
      tmp.c.copy(pm.base).lerp(dark, Math.min(1, wF * (sev ? 0.4 : 0.85) + (wT + wO) * 0.9))
      pm.mat.color.lerp(tmp.c, k)
      // Every lens draws the structure as lines that glow with what the lens is about (heat, work, faults);
      // only a faulted part in the Faults lens is drawn solid, so it stands out.
      pm.mat.wireframe = !(wF > 0.5 && sev)
    }

    mats.modules.forEach((pm, i) => {
      const heat = heatColor(s.modulesC[i], MODULE_SCALE, new Color()).multiplyScalar(0.75)
      const out = p['viz-active'].clone().multiplyScalar(0.12 + 1.1 * s.util * cluster.moduleShares[i] * 6 * s.throttle)
      apply(pm, heat, out)
    })
    mats.segments.forEach((pm, k2) => {
      const heat = heatColor(s.segmentsC[k2], RADIATOR_SCALE, new Color()).multiplyScalar(s.segmentAlive[k2] ? 0.55 : 0.7)
      apply(pm, heat, p['fg-subtle'].clone().multiplyScalar(0.22))
    })
    mats.wings.forEach((pm, w) => {
      const gen = Math.max(0, Math.cos(rad(s.wingErrDeg[w]))) * (s.eclipse ? 0 : 1)
      apply(pm, p['fg-subtle'].clone().multiplyScalar(0.35), p['fg-subtle'].clone().multiplyScalar(0.18).add(p['heat-2'].clone().multiplyScalar(0.75 * gen)))
      const pu = mats.power[w].uniforms
      pu.uTime.value = time
      pu.uSpeed.value = 0.5 + 0.7 * gen
      pu.uIntensity.value = wO * gen
    })
    apply(mats.dish, p['fg-subtle'].clone().multiplyScalar(0.35), p['viz-active'].clone().multiplyScalar(0.5 + 0.8 * s.util))
    apply(mats.pumps, heatColor(s.loopC, RADIATOR_SCALE, new Color()).multiplyScalar(0.55), p['fg-subtle'].clone().multiplyScalar(0.22))
    mats.truss.color.lerp(tmp.c.set('#a1a1aa').lerp(dark, Math.min(1, wF * 0.85 + (wT + wO) * 0.75)), k)
    // The structure keeps a faint glow of its own, so its lines do not vanish in Earth's shadow.
    mats.truss.emissive.copy(p['fg-subtle']).multiplyScalar(0.22 + 0.18 * wF)
    mats.truss.wireframe = true

    const pumpFault = faults.get('loop')
    // Coolant glows in Thermal; in Faults it glows only if the pump is the fault, in that fault's colour.
    const coolantOn = wT + (pumpFault ? wF * pulse : 0)
    const warnTint = pumpFault ? severityColor(pumpFault) : null
    const pipes = [mats.coolant, mats.branch, mats.boom, ...mats.segPipes]
    pipes.forEach((m, i) => {
      const u = m.uniforms
      u.uTime.value = time
      u.uSpeed.value = 0.9 * s.flow
      const seg = i - 3
      const alive = seg < 0 || s.segmentAlive[seg]
      u.uIntensity.value = alive ? coolantOn : 0
      if (warnTint) {
        u.uFrom.value.copy(p['heat-2']).lerp(warnTint, wF)
        u.uTo.value.copy(p['viz-active']).lerp(warnTint, wF)
      }
    })
    const du = mats.data.uniforms
    du.uTime.value = time
    du.uSpeed.value = 0.4 + 1.4 * s.util
    du.uIntensity.value = wO
    for (const m of [mats.dataBranch, mats.downlink]) {
      m.uniforms.uTime.value = time
      m.uniforms.uSpeed.value = 0.4 + 1.4 * s.util
      m.uniforms.uIntensity.value = wO * (m === mats.downlink ? 0.2 + 0.4 * s.util : 1)
    }
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

  const dish = dishMount(d)
  const blanket = d.wing.chord / 2 - MAST_RADIUS
  const stub = MODULE.standoff + 0.6
  const coolant = { from: PUMP_PACKAGE.x + PUMP_PACKAGE.length / 2, to: MODULE.x0 + 5 * MODULE.pitch }
  const data = { from: MODULE.x0, to: BUS.x - BUS.length / 2 }

  return (
    <group ref={root} visible={false}>
      {/* Truss, with the thermal control package (pumps) aft and the bus module forward */}
      <mesh material={mats.truss}>
        <boxGeometry args={[TRUSS.length, TRUSS.section, TRUSS.section, TRUSS.bays, 1, 1]} />
      </mesh>
      <mesh material={mats.pumps.mat} position={[PUMP_PACKAGE.x, 0, 0]} {...handlers({ kind: 'loop' })}>
        <boxGeometry args={[PUMP_PACKAGE.length, PUMP_PACKAGE.section, PUMP_PACKAGE.section]} />
      </mesh>
      {[0.6, -0.6].map((z) => (
        <mesh key={z} material={mats.truss} position={[PUMP_PACKAGE.x - PUMP_PACKAGE.length / 2 - 0.2, 0, z]} rotation={[0, 0, Math.PI / 2]} raycast={() => null}>
          <cylinderGeometry args={[0.3, 0.15, 0.4, 8, 1, true]} />
        </mesh>
      ))}
      <mesh material={mats.dish.mat} position={[BUS.x, 0, 0]} {...handlers({ kind: 'dish' })}>
        <boxGeometry args={[BUS.length, BUS.section, BUS.section]} />
      </mesh>

      {/* Main coolant line (flows from the radiators towards the modules), a branch to each module */}
      <mesh material={mats.coolant} position={[(coolant.from + coolant.to) / 2, 0, LINE_Z]} rotation={[0, 0, -Math.PI / 2]} {...handlers({ kind: 'loop' })}>
        <cylinderGeometry args={[0.22, 0.22, coolant.to - coolant.from, 12, 1, true]} />
      </mesh>
      {/* Data line: from the modules (branches) along the truss to the bus */}
      <mesh material={mats.data} position={[(data.from + data.to) / 2, 0, -LINE_Z]} rotation={[0, 0, -Math.PI / 2]} raycast={() => null}>
        <cylinderGeometry args={[0.18, 0.18, data.to - data.from, 10, 1, true]} />
      </mesh>

      {/* Compute modules: canisters standing off the truss on alternate sides */}
      {mats.modules.map((pm, i) => {
        const [x, y] = modulePos(d, i)
        const side = Math.sign(y)
        const collar = MODULE.standoff - TRUSS.section / 2
        return (
          <group key={i} position={[x, 0, 0]}>
            <mesh material={mats.truss} position={[0, side * (TRUSS.section / 2 + collar / 2), 0]} raycast={() => null}>
              <cylinderGeometry args={[0.5, 0.5, collar, 8, 1, true]} />
            </mesh>
            <mesh material={pm.mat} position={[0, y, 0]} raycast={() => null}>
              <capsuleGeometry args={[MODULE.radius, MODULE.length - 2 * MODULE.radius, 4, 12]} />
            </mesh>
            {/* To scale a module is small, so it gets a generous invisible target */}
            <mesh position={[0, y, 0]} {...handlers(pm.part)}>
              <capsuleGeometry args={[MODULE.radius * 1.7, MODULE.length - 2 * MODULE.radius, 2, 8]} />
              <meshBasicMaterial visible={false} />
            </mesh>
            <mesh material={mats.branch} position={[0, (side * stub) / 2, LINE_Z]} rotation={[side > 0 ? 0 : Math.PI, 0, 0]} raycast={() => null}>
              <cylinderGeometry args={[0.14, 0.14, stub, 8, 1, true]} />
            </mesh>
            <mesh material={mats.dataBranch} position={[0, (side * stub) / 2, -LINE_Z]} rotation={[side > 0 ? Math.PI : 0, 0, 0]} raycast={() => null}>
              <cylinderGeometry args={[0.12, 0.12, stub, 8, 1, true]} />
            </mesh>
          </group>
        )
      })}

      {/* Solar wings: two blankets either side of a mast, turning about it to face the Sun */}
      <mesh material={mats.truss} position={[HUB.wingX, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[MAST_RADIUS, MAST_RADIUS, d.height, 8, 8]} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh key={`wd${side}`} material={mats.truss} position={[HUB.wingX, 0, side * (TRUSS.section / 2 + 0.45)]} raycast={() => null}>
          <boxGeometry args={[1.2, 1.2, 0.9]} />
        </mesh>
      ))}
      {/* Power from each wing tip in to the truss */}
      {[0, 1].map((w) => (
        <mesh key={`p${w}`} material={mats.power[w]} position={[HUB.wingX, 0, ((w === 0 ? 1 : -1) * d.height) / 4]} rotation={[w === 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0]} raycast={() => null}>
          <cylinderGeometry args={[0.18, 0.18, d.height / 2, 8, 1, true]} />
        </mesh>
      ))}
      {mats.wings.map((pm, w) => (
        <group key={w} position={[HUB.wingX, 0, 0]} ref={(el) => void (wings.current[w] = el)}>
          {[1, -1].map((side) => (
            <mesh key={side} material={pm.mat} position={[0, side * (MAST_RADIUS + blanket / 2), wingZ(d, w)]} {...handlers(pm.part)}>
              <boxGeometry args={[0.08, blanket, d.wing.length, 1, 2, Math.round(d.wing.length / 4)]} />
            </mesh>
          ))}
          {[d.wing.root, d.wing.root + d.wing.length].map((z) => (
            <mesh key={z} material={mats.truss} position={[0, 0, (w === 0 ? 1 : -1) * z]} raycast={() => null}>
              <boxGeometry args={[0.2, d.wing.chord, 0.2]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Radiators, four segments each, on a boom that carries the coolant out and back */}
      <mesh material={mats.truss} position={[HUB.radiatorX, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 2 * d.boom, 8, 8]} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh key={`rj${side}`} material={mats.truss} position={[HUB.radiatorX, 0, side * (TRUSS.section / 2 + 0.45)]} raycast={() => null}>
          <boxGeometry args={[1, 1, 0.9]} />
        </mesh>
      ))}
      {[0, 1].map((r) => (
        <mesh key={`boom-${r}`} material={mats.boom} position={[HUB.radiatorX, 0, ((r === 0 ? 1 : -1) * d.boom) / 2]} rotation={[r === 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0]} raycast={() => null}>
          <cylinderGeometry args={[0.15, 0.15, d.boom, 8, 1, true]} />
        </mesh>
      ))}
      {[0, 1].map((r) => (
        <group key={r} position={[HUB.radiatorX, 0, 0]} ref={(el) => void (radiators.current[r] = el)}>
          {mats.segments.slice(r * 4, r * 4 + 4).map((pm, s) => (
            <group key={s} position={[0, 0, segmentZ(d, r * 4 + s)]}>
              <mesh material={pm.mat} {...handlers(pm.part)}>
                <boxGeometry args={[0.1, d.segment.chord, d.segment.span, 1, 6, 4]} />
              </mesh>
              {/* Coolant crossing the panel */}
              <mesh material={mats.segPipes[r * 4 + s]} raycast={() => null}>
                <cylinderGeometry args={[0.12, 0.12, d.segment.chord * 0.96, 6, 1, true]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* Ground-link dish on its gimbal, pointing at the ground (in a tower, on an arm off the bus's shaded side) */}
      {d.attitude === 'tower' && (
        <mesh material={mats.truss} position={[BUS.x, -d.sunSide * (BUS.section / 2 + 0.8), dish.position[2]]} raycast={() => null}>
          <boxGeometry args={[0.2, 1.6, 0.2]} />
        </mesh>
      )}
      <group position={dish.position} rotation={[dish.tilt, 0, 0]} {...handlers({ kind: 'dish' })}>
        <mesh material={mats.truss} position={[0, -0.3, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.6, 6]} />
        </mesh>
        <mesh material={mats.dish.mat} position={[0, -0.6 - DISH_SPHERE, 0]}>
          <sphereGeometry args={[DISH_SPHERE, 16, 5, 0, Math.PI * 2, 0, 0.9]} />
        </mesh>
        {/* Downlink beam towards the ground (Output lens) */}
        <mesh material={mats.downlink} position={[0, -1.2 - 7, 0]} rotation={[Math.PI, 0, 0]} raycast={() => null}>
          <cylinderGeometry args={[4, 0.4, 14, 24, 1, true]} />
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
  const pos = partLocal(hover, designOf(clusterById(clusterId)!))
  const fault = s.faults.find((f) => samePart(f.part, hover))
  return (
    <Html position={[pos.x, pos.y, pos.z]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
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

