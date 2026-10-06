import type { FsmState } from '@vigil/lib/sim/config'

/** Hex mirrors of the CSS tokens, for canvas and WebGL code that cannot read CSS variables. */
export const C = {
  bg: '#0f1112',
  ink950: '#0a0c0d',
  ink800: '#171a1c',
  ink700: '#1e2225',
  ink600: '#292e32',
  ink500: '#394045',
  ink400: '#556067',
  steel3: '#87939a',
  steel2: '#a9b2b7',
  bone: '#ebe8de',
  go: '#2ee67c',
  caution: '#ffb21e',
  stop: '#ff4338',
  forecast: '#5c9dff',
  vib: '#44d9ff',
  temp: '#ff8a4c',
  cur: '#b79cff',
  rpm: '#ebe8de',
} as const

export const STATE_COLOR: Record<FsmState, string> = {
  HEALTHY: C.go,
  WARNING: C.caution,
  CRITICAL: C.stop,
  TRIPPED: C.stop,
  STARTUP: C.forecast,
  OFF: C.ink400,
}

export const LEVEL_COLOR = [C.go, C.caution, C.stop] as const

export const CHANNEL_COLOR = { vib: C.vib, temp: C.temp, cur: C.cur, rpm: C.rpm } as const

export function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** Infrared-camera style colour ramp used for heat and for the spectrogram. 0…1 → rgb. */
const IRON: [number, number, number, number][] = [
  [0.0, 6, 5, 12],
  [0.12, 32, 12, 74],
  [0.28, 88, 16, 112],
  [0.45, 164, 32, 98],
  [0.6, 226, 72, 48],
  [0.75, 250, 142, 22],
  [0.9, 253, 222, 82],
  [1.0, 255, 255, 226],
]

export function ironRamp(t: number): [number, number, number] {
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  for (let i = 1; i < IRON.length; i++) {
    if (x <= IRON[i][0]) {
      const a = IRON[i - 1]
      const b = IRON[i]
      const u = (x - a[0]) / (b[0] - a[0])
      return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u]
    }
  }
  return [255, 255, 226]
}

export const IRON_LUT: Uint8ClampedArray = (() => {
  const lut = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = ironRamp(i / 255)
    lut[i * 3] = r
    lut[i * 3 + 1] = g
    lut[i * 3 + 2] = b
  }
  return lut
})()

export const MONO = '"Martian Mono Variable", ui-monospace, Consolas, monospace'
