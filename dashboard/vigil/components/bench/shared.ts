import * as THREE from 'three'
import { ironRamp } from '@vigil/lib/theme'

/** The whole bench is shifted so its centre of mass sits near the camera target. */
export const WORLD_OFFSET: [number, number, number] = [-1.7, 0, -1.4]

/** Height of the motor axis above the platform. */
export const Y0 = 1.08

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const damp = (cur: number, target: number, lambda: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-lambda * dt))

/** Heat 0…1 from winding temperature: nothing visible below ~58 °C, white-hot near 108 °C. */
export const heatOf = (tempC: number) => clamp01((tempC - 58) / 50)

export function heatColor(u: number, out = new THREE.Color()): THREE.Color {
  const [r, g, b] = ironRamp(0.55 + 0.45 * u)
  return out.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
}

/** Fixed pseudo-random in [0,1) from an integer seed — stable across renders. */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Procedural canvas texture helper (client only). */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  draw(ctx, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}
