import { OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Suspense, useEffect, useRef, useState } from 'react'
import { DirectionalLight, PerspectiveCamera } from 'three'
import { clusterById, FLEET } from '@/sim/fleet'
import { telemetry, useApsis } from '@/store'
import { MOBILE, useMediaQuery } from '@/lib/useMediaQuery'
import { Earth } from '../Earth'
import { OrbitRing } from '../OrbitRing'
import { ClusterMarker } from '../ClusterMarker'
import { Starfield } from '../Starfield'
import { GroundTrack } from '../GroundTrack'
import { ClusterModel } from '../ClusterModel'
import { CameraRig, OVERVIEW_DISTANCE } from '../CameraRig'
import styles from './Scene.module.css'

/** The 3D view: Earth, the fleet's orbits, and the focused cluster. Fills its container. */
export function Scene() {
  const [dpr, setDpr] = useState(1.75)
  return (
    <div className={styles.scene} data-testid="scene">
      <Canvas
        dpr={[1, dpr]}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 42, near: 0.002, far: 400, position: [OVERVIEW_DISTANCE * 0.52, OVERVIEW_DISTANCE * 0.3, OVERVIEW_DISTANCE * 0.8] }}
        onCreated={({ gl }) => gl.setClearColor(getComputedStyle(document.documentElement).getPropertyValue('--space').trim() || '#050507')}
      >
        <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.75)} />
        <ViewOffset />
        <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08} zoomSpeed={0.7} />
        <CameraRig />
        <Lights />
        <Starfield />
        <Suspense fallback={null}>
          <Earth>
            <GroundTrack />
          </Earth>
        </Suspense>
        {FLEET.map((c) => (
          <OrbitRing key={c.id} cluster={c} />
        ))}
        {FLEET.map((c) => (
          <ClusterMarker key={c.id} cluster={c} />
        ))}
        <FocusedModel />
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur intensity={0.8} luminanceThreshold={0.78} luminanceSmoothing={0.18} radius={0.7} />
          <Vignette eskil={false} offset={0.22} darkness={0.72} />
        </EffectComposer>
      </Canvas>
    </div>
  )
}

/** Keep the last selected cluster's model mounted while the camera pulls away, so it shrinks instead of popping. */
function FocusedModel() {
  const selected = useApsis((s) => s.selectedId)
  const [id, setId] = useState<string | null>(selected)
  useEffect(() => {
    if (selected) setId(selected)
  }, [selected])
  return id && clusterById(id) ? <ClusterModel key={id} id={id} /> : null
}

/** Sunlight; dims when the focused cluster is in Earth's shadow, so you see the eclipse up close. */
function Lights() {
  const sun = useRef<DirectionalLight>(null)
  useFrame((_, dt) => {
    const id = useApsis.getState().selectedId
    const s = id ? telemetry(id) : undefined
    const target = s?.eclipse ? 0.06 : 2.6
    if (sun.current) sun.current.intensity += (target - sun.current.intensity) * Math.min(1, dt * 2)
  })
  return (
    <>
      <directionalLight ref={sun} position={[30, 0, 0]} intensity={2.6} />
      <hemisphereLight args={['#1d2233', '#0b2a4a', 0.35]} />
      <ambientLight intensity={0.05} />
    </>
  )
}

/**
 * Shift the projection so the Earth is centred in the part of the screen the sheet doesn't cover:
 * right of the left sheet on desktop, above the drawer on phones.
 */
function ViewOffset() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const mobile = useMediaQuery(MOBILE)
  useEffect(() => {
    const css = getComputedStyle(document.documentElement)
    const sheet = parseFloat(css.getPropertyValue('--sheet-width')) || 380
    const peek = parseFloat(css.getPropertyValue('--drawer-peek')) || 196
    const x = mobile ? 0 : -(sheet + 16) / 2
    const y = mobile ? peek / 2 - 20 : 0
    camera.setViewOffset(size.width, size.height, x, y, size.width, size.height)
    camera.updateProjectionMatrix()
  }, [camera, size, mobile])
  return null
}
