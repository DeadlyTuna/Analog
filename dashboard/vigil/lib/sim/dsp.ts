/**
 * Signal-processing primitives used by the firmware's DSP task.
 * Everything here is written the way it would be on the MCU: in-place radix-2 FFT,
 * precomputed twiddles / window, and two real channels packed into one complex FFT.
 */

interface FftPlan {
  n: number
  rev: Uint16Array
  cos: Float64Array
  sin: Float64Array
}

const plans = new Map<number, FftPlan>()

function getPlan(n: number): FftPlan {
  let p = plans.get(n)
  if (p) return p
  const bits = Math.round(Math.log2(n))
  const rev = new Uint16Array(n)
  for (let i = 0; i < n; i++) {
    let r = 0
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b)
    rev[i] = r
  }
  const cos = new Float64Array(n / 2)
  const sin = new Float64Array(n / 2)
  for (let k = 0; k < n / 2; k++) {
    const a = (2 * Math.PI * k) / n
    cos[k] = Math.cos(a)
    sin[k] = Math.sin(a)
  }
  p = { n, rev, cos, sin }
  plans.set(n, p)
  return p
}

/** In-place forward FFT (X[k] = Σ x[n]·e^(-j2πkn/N)). */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  const { rev, cos, sin } = getPlan(n)
  for (let i = 0; i < n; i++) {
    const j = rev[i]
    if (j > i) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const step = n / size
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = cos[k]
        const wi = -sin[k]
        const a = i + j
        const b = a + half
        const tr = re[b] * wr - im[b] * wi
        const ti = re[b] * wi + im[b] * wr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
}

/** Periodic Hann window. Coherent gain = 0.5, so a tone's amplitude is recovered with 2/Σw = 4/N. */
export function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
  return w
}

/**
 * Amplitude spectra of two real signals from ONE complex FFT (a = real part, b = imaginary part).
 * Outputs are scaled so a sine of amplitude A shows up as ≈A at its bin. Bin 0 (DC) is zeroed.
 */
export function dualSpectrum(
  a: Float64Array,
  b: Float64Array,
  win: Float64Array,
  re: Float64Array,
  im: Float64Array,
  outA: Float32Array,
  outB: Float32Array,
) {
  const n = a.length
  for (let i = 0; i < n; i++) {
    re[i] = a[i] * win[i]
    im[i] = b[i] * win[i]
  }
  fft(re, im)
  const scale = 4 / n
  const half = n >> 1
  for (let k = 1; k < half; k++) {
    const m = n - k
    const zr = re[k]
    const zi = im[k]
    const wr = re[m]
    const wi = im[m]
    outA[k] = 0.5 * scale * Math.hypot(zr + wr, zi - wi)
    outB[k] = 0.5 * scale * Math.hypot(zr - wr, zi + wi)
  }
  outA[0] = 0
  outB[0] = 0
}

export interface WaveStats {
  mean: number
  rms: number
  peak: number
  crest: number
  kurt: number
}

/** Time-domain condition indicators on the first `n` samples (RMS about the mean). */
export function waveStats(x: ArrayLike<number>, n: number, out: WaveStats): WaveStats {
  let sum = 0
  for (let i = 0; i < n; i++) sum += x[i]
  const mean = sum / n
  let m2 = 0
  let m4 = 0
  let peak = 0
  for (let i = 0; i < n; i++) {
    const d = x[i] - mean
    const d2 = d * d
    m2 += d2
    m4 += d2 * d2
    const ad = Math.abs(d)
    if (ad > peak) peak = ad
  }
  m2 /= n
  m4 /= n
  const rms = Math.sqrt(m2)
  out.mean = mean
  out.rms = rms
  out.peak = peak
  out.crest = rms > 1e-9 ? peak / rms : 0
  out.kurt = m2 > 1e-12 ? m4 / (m2 * m2) : 0
  return out
}

/** Amplitude of a tone near `centerBin`, from the power in its Hann main lobe (Σmag² = 1.5·A²). */
export function toneAmp(mag: Float32Array, centerBin: number, halfWidth = 2): number {
  const c = Math.round(centerBin)
  let p = 0
  for (let k = Math.max(1, c - halfWidth); k <= Math.min(mag.length - 1, c + halfWidth); k++) p += mag[k] * mag[k]
  return Math.sqrt(p / 1.5)
}

/** Sum of squared magnitudes in [k0, k1]. */
export function bandPower(mag: Float32Array, k0: number, k1: number): number {
  let p = 0
  for (let k = Math.max(1, k0); k <= Math.min(mag.length - 1, k1); k++) p += mag[k] * mag[k]
  return p
}

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)

/** 0 below `a`, 1 above `b`, smooth in between. */
export function ramp(x: number, a: number, b: number): number {
  if (b === a) return x >= b ? 1 : 0
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Linear ramp (no smoothing). */
export function lin(x: number, a: number, b: number): number {
  return clamp((x - a) / (b - a), 0, 1)
}

/** Least-squares slope (units per second) of y over t (seconds). Returns slope and R². */
export function regress(t: ArrayLike<number>, y: ArrayLike<number>, n: number): { slope: number; r2: number; mean: number } {
  if (n < 3) return { slope: 0, r2: 0, mean: n ? y[0] : 0 }
  let st = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    st += t[i]
    sy += y[i]
  }
  const mt = st / n
  const my = sy / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dt = t[i] - mt
    const dy = y[i] - my
    sxx += dt * dt
    sxy += dt * dy
    syy += dy * dy
  }
  const slope = sxx > 1e-12 ? sxy / sxx : 0
  const r2 = sxx > 1e-12 && syy > 1e-12 ? (sxy * sxy) / (sxx * syy) : 0
  return { slope, r2, mean: my }
}
