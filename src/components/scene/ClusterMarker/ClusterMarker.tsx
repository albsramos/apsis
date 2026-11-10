import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Color, Group, Mesh, Ray, Sphere, Sprite, SpriteMaterial, Vector3 } from 'three'
import type { ClusterConfig } from '@/sim/types'
import { scenePosition } from '@/sim/orbit'
import { actions, clock, telemetry, useApsis, useTelemetry } from '@/store'
import { glowTexture, ringTexture } from '@/lib/textures'
import { fmt } from '@/lib/format'
import { StatusDot } from '@/components/ui/StatusDot'
import { cx } from '@/lib/cx'
import { lensColor } from '../lensColor'
import styles from './ClusterMarker.module.css'

const EARTH = new Sphere(new Vector3(), 1)
const ray = new Ray()
const hit = new Vector3()

/** A cluster at fleet scale: a small glowing point, a faint pulse ring when something is wrong, and a label. */
export function ClusterMarker({ cluster }: { cluster: ClusterConfig }) {
  const group = useRef<Group>(null)
  const core = useRef<Sprite>(null)
  const halo = useRef<Sprite>(null)
  const label = useRef<HTMLDivElement>(null)
  const hitbox = useRef<Mesh>(null)
  const color = useMemo(() => new Color(), [])
  const target = useMemo(() => new Color(), [])
  const coreMat = useMemo(
    () => new SpriteMaterial({ map: glowTexture(), blending: AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
    [],
  )
  const haloMat = useMemo(
    () => new SpriteMaterial({ map: ringTexture(), blending: AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
    [],
  )

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const p = scenePosition(cluster.orbit, clock.view())
    g.position.set(p[0], p[1], p[2])

    const st = useApsis.getState()
    const s = telemetry(cluster.id)
    if (s) lensColor(st.lens, cluster, s, target)
    color.lerp(target, Math.min(1, dt * 6))

    const cam = state.camera.position
    const dist = cam.distanceTo(g.position)
    const selected = st.selectedId === cluster.id
    const hovered = st.hoverId === cluster.id
    // Fade the point out as the camera arrives and the 3D model takes over.
    const near = selected ? Math.min(1, Math.max(0, (dist - 0.12) / 0.5)) : 1
    const dim = st.selectedId && !selected ? 0.45 : 1
    const eclipse = s?.eclipse ? 0.55 : 1
    // Small on screen: a point of light, not a disc. It sits over a lit globe now, so it must not cover it.
    const size = Math.min(0.085, Math.max(0.004, dist * 0.01)) * (hovered ? 1.5 : 1)

    // A generous, constant-on-screen click target, larger than the point it surrounds.
    hitbox.current?.scale.setScalar(Math.min(0.09, Math.max(0.012, dist * 0.0105)) * (hovered ? 1.5 : 1))
    if (core.current) {
      core.current.scale.setScalar(size)
      coreMat.color.copy(color).multiplyScalar(2 * eclipse)
      coreMat.opacity = near * dim
    }
    if (halo.current) {
      const pulse = s && s.status !== 'nominal' ? (state.clock.elapsedTime * (s.status === 'critical' ? 1.1 : 0.6)) % 1 : 0
      // The pulse is a thin ring that opens a little way and fades: a quiet signal, not a target painted on the Earth.
      halo.current.scale.setScalar(size * (1.1 + pulse * 0.9))
      haloMat.color.copy(color)
      haloMat.opacity = s && s.status !== 'nominal' ? (1 - pulse) * (1 - pulse) * 0.5 * near * dim : selected ? 0.5 * near : 0
    }

    // Hide the label when the cluster is behind the Earth.
    if (label.current) {
      ray.origin.copy(cam)
      ray.direction.copy(g.position).sub(cam).normalize()
      const blocked = ray.intersectSphere(EARTH, hit) !== null && hit.distanceTo(cam) < dist
      label.current.dataset.hidden = blocked || near < 0.3 ? 'true' : 'false'
    }
  })

  const onOver = () => {
    actions.setHover(cluster.id)
    document.body.style.cursor = 'pointer'
  }
  const onOut = () => {
    actions.setHover(null)
    document.body.style.cursor = ''
  }

  return (
    <group ref={group}>
      <sprite ref={core} material={coreMat} />
      <sprite ref={halo} material={haloMat} />
      <mesh
        ref={hitbox}
        onPointerOver={(e) => (e.stopPropagation(), onOver())}
        onPointerOut={onOut}
        onClick={(e) => (e.stopPropagation(), actions.select(cluster.id))}
      >
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <Html zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={label} className={styles.anchor}>
          <MarkerLabel cluster={cluster} />
        </div>
      </Html>
    </group>
  )
}

function MarkerLabel({ cluster }: { cluster: ClusterConfig }) {
  const s = useTelemetry(cluster.id)
  const hovered = useApsis((st) => st.hoverId === cluster.id)
  const selected = useApsis((st) => st.selectedId === cluster.id)
  const dimmed = useApsis((st) => !!st.selectedId && st.selectedId !== cluster.id)
  if (!s) return null
  return (
    <div className={cx(styles.label, hovered && styles.open, dimmed && styles.dimmed, selected && styles.selected)}>
      <div className={styles.title}>
        <StatusDot status={s.status} size={6} />
        <span className={styles.code}>{cluster.code}</span>
        <span className={styles.name}>{cluster.name}</span>
      </div>
      <div className={styles.more}>
        <span>{fmt.pf(s.outputPf)}</span>
        <span>{fmt.temp(Math.max(...s.modulesC))}</span>
        <span className={styles.swap}>
          <span className={s.eclipse ? styles.off : undefined}>Sunlit</span>
          <span className={s.eclipse ? undefined : styles.off}>In shadow</span>
        </span>
      </div>
    </div>
  )
}
