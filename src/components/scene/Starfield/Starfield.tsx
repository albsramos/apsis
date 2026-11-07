import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial } from 'three'
import { mulberry32 } from '@/sim/rng'

const RADIUS = 180

const vert = /* glsl */ `
attribute float aSize;
attribute float aBright;
attribute vec3 aColor;
uniform float uPixelRatio;
varying float vBright;
varying vec3 vColor;
void main() {
  vBright = aBright;
  vColor = aColor;
  gl_PointSize = aSize * uPixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const frag = /* glsl */ `
varying float vBright;
varying vec3 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-r * r * 4.0) * vBright;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * a, a);
}
`

/**
 * A quiet, realistic sky: thousands of pinpoint stars, nearly all of them faint (brightness follows a
 * steep power law, as real magnitudes do), with slight colour temperature differences and a dim band of
 * the Milky Way. No twinkling, no size attenuation: stars are at infinity.
 */
export function Starfield() {
  const dpr = useThree((s) => s.viewport.dpr)
  const points = useMemo(() => {
    const rng = mulberry32(42)
    const pos: number[] = []
    const size: number[] = []
    const bright: number[] = []
    const color: number[] = []
    const warm = new Color('#ffe2bf')
    const cool = new Color('#c9d8ff')
    const white = new Color('#ffffff')
    const c = new Color()
    // Galactic plane: tilted ~60° to the scene's equator
    const tilt = 1.05

    const add = (x: number, y: number, z: number, band: boolean) => {
      const len = Math.hypot(x, y, z)
      pos.push((x / len) * RADIUS, (y / len) * RADIUS, (z / len) * RADIUS)
      const b = Math.pow(rng(), band ? 9 : 6)
      bright.push(band ? 0.05 + b * 0.35 : 0.07 + b * 0.85)
      size.push(band ? 1.1 + b * 1.2 : 1.1 + b * 2.6)
      const t = rng()
      c.copy(white).lerp(t < 0.3 ? cool : t > 0.8 ? warm : white, t < 0.3 ? 0.6 : 0.5)
      color.push(c.r, c.g, c.b)
    }

    for (let i = 0; i < 6500; i++) {
      // uniform on the sphere
      const u = rng() * 2 - 1
      const th = rng() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      add(s * Math.cos(th), u, s * Math.sin(th), false)
    }
    for (let i = 0; i < 9000; i++) {
      // concentrated near a great circle, gaussian spread
      const th = rng() * Math.PI * 2
      const g = (rng() + rng() + rng() - 1.5) * 0.16
      const x = Math.cos(th), z = Math.sin(th), y = g
      add(x, y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt), true)
    }

    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
    geo.setAttribute('aSize', new Float32BufferAttribute(size, 1))
    geo.setAttribute('aBright', new Float32BufferAttribute(bright, 1))
    geo.setAttribute('aColor', new Float32BufferAttribute(color, 3))
    const mat = new ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uPixelRatio: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    const p = new Points(geo, mat)
    p.raycast = () => {}
    p.frustumCulled = false
    return p
  }, [])
  ;(points.material as ShaderMaterial).uniforms.uPixelRatio.value = dpr
  return <primitive object={points} />
}
