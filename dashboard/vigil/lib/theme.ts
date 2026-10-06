import type { FsmState } from '@vigil/lib/sim/config'

/**
 * Colours as CSS references to the site tokens (app/globals.css), so DOM and SVG follow light and dark by themselves.
 * Canvas and WebGL cannot read var(): pass a colour through resolve() (or paint() for an alpha) first.
 */
export const C = {
  bg: 'var(--page)',
  ink950: 'var(--page)',
  ink800: 'var(--surface)',
  ink700: 'var(--surface-2)',
  ink600: 'var(--grid)',
  ink500: 'var(--axis)',
  ink400: 'var(--muted)',
  steel3: 'var(--muted)',
  steel2: 'var(--ink-2)',
  bone: 'var(--ink)',
  go: 'var(--good)',
  caution: 'var(--warning)',
  stop: 'var(--critical)',
  forecast: 'var(--series)',
  vib: 'var(--ch-vib)',
  temp: 'var(--ch-temp)',
  cur: 'var(--ch-cur)',
  rpm: 'var(--ch-rpm)',
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

/** RTOS task colours, keyed by task id (the hex in lib/sim/config.ts is tuned for a dark page only). */
export const TASK_COLOR: Record<string, string> = { ACQ: C.vib, DSP: C.cur, FDT: C.temp, HLTH: C.go, COMM: C.forecast, STRESS: C.stop }

// current token values, re-read after a light/dark switch
let cache: Record<string, string> = {}
if (typeof window !== 'undefined') matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => (cache = {}))
const cssVar = (name: string, fallback: string) =>
  typeof window === 'undefined' ? fallback : (cache[name] ??= getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback)

/** A concrete colour for canvas / WebGL: `var(--x)` becomes its current value, anything else passes through. */
export function resolve(c: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(c)
  return m ? cssVar(m[1], '#898781') : c
}

/** Colour at an alpha. Hex gives rgba(); a token gives color-mix(), which only DOM/SVG understand — canvas uses paint(). */
export function rgba(c: string, a: number): string {
  if (!c.startsWith('#')) return `color-mix(in srgb, ${c} ${+(a * 100).toFixed(1)}%, transparent)`
  const h = c.slice(1)
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h.slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** rgba() for canvas: resolves the token first. */
export const paint = (c: string, a = 1) => rgba(resolve(c), a)

/** A status or channel colour pulled toward the text colour, so words stay readable on light and dark pages. */
export const tint = (c: string) => `color-mix(in oklab, ${c} 55%, var(--ink))`

/** Canvas font stack (canvas cannot read var(--font-geist-mono) either). */
export const mono = () => `${cssVar('--font-geist-mono', 'ui-monospace')}, ui-monospace, monospace`

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
