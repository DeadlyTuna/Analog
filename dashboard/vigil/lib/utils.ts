import clsx, { type ClassValue } from 'clsx'

export const cn = (...inputs: ClassValue[]) => clsx(inputs)

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const mix = lerp

/** Fixed-decimals number, em-dash for non-finite. */
export function fmt(x: number | null | undefined, dp = 1): string {
  return x == null || !Number.isFinite(x) ? '—' : x.toFixed(dp)
}

/** mm:ss.t from milliseconds. */
export function clock(ms: number, tenths = true): string {
  const t = Math.max(0, ms) / 1000
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return tenths ? `${base}.${Math.floor((t * 10) % 10)}` : base
}

/** "42 s", "3 min 05 s" */
export function span(sec: number): string {
  if (!Number.isFinite(sec)) return '—'
  if (sec < 90) return `${Math.max(0, Math.round(sec))} s`
  const m = Math.floor(sec / 60)
  return `${m} min ${String(Math.round(sec % 60)).padStart(2, '0')} s`
}

export function hex(n: number, width = 2): string {
  return n.toString(16).toUpperCase().padStart(width, '0')
}

/** Size in bytes → "12.4 KB". */
export function bytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${Math.round(n)} B`
}
