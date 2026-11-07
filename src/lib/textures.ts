import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

/** Small textures drawn once on a canvas at runtime, so nothing is fetched. Client only. */
const cache = new Map<string, CanvasTexture>()

function make(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d')!, size)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  cache.set(key, t)
  return t
}

/** Soft round glow, white; tint with the material colour. */
export const glowTexture = () =>
  make('glow', 128, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(0.12, 'rgba(255,255,255,0.95)')
    r.addColorStop(0.3, 'rgba(255,255,255,0.32)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, s, s)
  })

/** Thin ring, for pulses and selection. */
export const ringTexture = () =>
  make('ring', 128, (g, s) => {
    g.strokeStyle = 'white'
    g.lineWidth = s * 0.035
    g.beginPath()
    g.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2)
    g.stroke()
  })

/** Solar cells: dark blue squares with silver gaps. */
export const solarTexture = () => {
  const t = make('solar', 256, (g, s) => {
    g.fillStyle = '#c8ccd4'
    g.fillRect(0, 0, s, s)
    const n = 8
    const cell = s / n
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const gr = g.createLinearGradient(x * cell, y * cell, (x + 1) * cell, (y + 1) * cell)
        gr.addColorStop(0, '#1d2b55')
        gr.addColorStop(1, '#0d1430')
        g.fillStyle = gr
        g.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4)
      }
  })
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

/** Radiator panel: white with fine tube lines. */
export const radiatorTexture = () => {
  const t = make('radiator', 128, (g, s) => {
    g.fillStyle = '#f4f4f5'
    g.fillRect(0, 0, s, s)
    g.strokeStyle = 'rgba(80,80,90,0.35)'
    g.lineWidth = 2
    for (let x = 8; x < s; x += 16) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, s)
      g.stroke()
    }
  })
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}
