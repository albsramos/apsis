import { useMemo } from 'react'
import { AdditiveBlending, Color, SpriteMaterial } from 'three'
import { glowTexture } from '@/lib/textures'

/** The Sun, far off on +x: a bright core and a wide soft bloom. */
export function SunGlow() {
  const [core, wide] = useMemo(
    () => [
      new SpriteMaterial({ map: glowTexture(), color: new Color(6, 5.6, 5), blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
      new SpriteMaterial({ map: glowTexture(), color: new Color(0.5, 0.45, 0.36), blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    ],
    [],
  )
  return (
    <group position={[60, 0, 0]}>
      <sprite material={core} scale={3.2} />
      <sprite material={wide} scale={22} />
    </group>
  )
}
