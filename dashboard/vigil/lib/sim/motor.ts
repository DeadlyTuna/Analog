/**
 * Layer 1 — the virtual motor ("digital twin").
 *
 * A 1.5 kW, 4-pole induction motor driving a brake load. It exposes ground-truth analog
 * signals (vibration in g, phase current in A) sample by sample, plus slowly-varying
 * state (speed, temperature). Nothing here knows about the firmware — the MCU only ever
 * sees what the sensors + ADC give it.
 *
 * Calibrated so that
 *   nominal load  →  55 °C · 0.25 g · 4.2 A · 1480 rpm
 *   overload 100% →  78 °C · 0.40 g · 7.8 A · 1350 rpm
 */
import { BPFO_RATIO, FS, RATED, type FaultKey } from './config'
import { Rng } from './rng'

export type Faults = Record<FaultKey, number>
export const zeroFaults = (): Faults => ({
  overload: 0,
  bearing: 0,
  misalign: 0,
  imbalance: 0,
  cooling: 0,
  electrical: 0,
})

const TAU = Math.PI * 2
const SQRT2 = Math.SQRT2
export const W_RATED = (RATED.rpm * TAU) / 60
export const W_SYNC = (RATED.sync * TAU) / 60

export const MODEL = {
  tauThermal: 10, // s — time-compressed so heating is watchable (a real frame takes ~20 min)
  p0: 16.64, // constant losses (iron + friction + windage), K at unit thermal resistance
  pcu: 8.358, // copper losses at rated current
  pBearing: 9,
  pMisalign: 3.3,
  i0sq: 1.09, // magnetising current² (A²)
  ksq: 16.55, // load-current² per pu² (A²)
  slipA: 0.006619,
  slipB: 0.006714,
  lockedRotor: 4.6, // × rated current at standstill
  // vibration baseline (peak amplitude of each component, g)
  k1: 0.24,
  k2: 0.08,
  k3: 0.032,
  kLine: 0.21,
  kNoise: 0.095,
  resHz: 620, // structural resonance excited by bearing impacts
  resTau: 0.0013,
  bearingAmp: 2.4,
}

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)

/** Load torque in per-unit of rated, including the extra drag every mechanical fault adds. */
export function loadPu(f: Faults): number {
  return 1 + 0.9 * f.overload + 0.12 * f.bearing + 0.09 * f.misalign + 0.02 * f.imbalance + 0.03 * f.cooling + 0.05 * f.electrical
}

export function slipFor(L: number, f: Faults): number {
  return MODEL.slipA * L + MODEL.slipB * L ** 4 + 0.01 * f.electrical
}

export function runCurrent(L: number, f: Faults): number {
  return Math.sqrt(MODEL.i0sq + MODEL.ksq * L * L) * (1 + 0.28 * f.electrical)
}

export interface Truth {
  tempC: number
  rpm: number
  iRms: number
  load: number
  vibRms: number
  powered: boolean
  omega: number
  phi: number
}

export class MotorModel {
  readonly rng: Rng
  tMs = 0
  powered = false
  omega = 0
  phi = 0
  linePhase = 0
  tempC: number = RATED.ambient
  ambient: number = RATED.ambient
  iRms = 0
  load = 1
  rpmTarget = 0

  /** instantaneous analog outputs (set by fastStep) */
  vib = 0
  cur = 0
  /** time (ms) of the most recent tacho edge, or -1 */
  pulseAtMs = -1

  // vibration component amplitudes, peak g (refreshed every slow step)
  A1 = 0
  A2 = 0
  A3 = 0
  ALine = 0
  sigma = 0
  Ab = 0

  private supply = 1
  private huntNoise = 0
  private spike = 0
  private iMod = 1
  private eSev = 0
  private bPhase = 0
  private y1 = 0
  private y2 = 0
  private readonly ra1: number
  private readonly ra2: number
  private lastRev = 0
  private readonly th: number[]
  private readonly impEnergy: number
  private bearingSev = 0
  private huntOsc = 0

  constructor(seed = 7) {
    this.rng = new Rng(seed)
    const r = Math.exp(-1 / (MODEL.resTau * FS))
    const theta = (TAU * MODEL.resHz) / FS
    this.ra1 = 2 * r * Math.cos(theta)
    this.ra2 = -r * r
    // energy of the resonator's response to a unit impulse (for the analytic RMS estimate)
    let a = 1
    let b = 0
    let e = 1
    for (let n = 1; n < 400; n++) {
      const y = this.ra1 * a + this.ra2 * b
      b = a
      a = y
      e += y * y
    }
    this.impEnergy = e
    this.th = Array.from({ length: 6 }, () => this.rng.range(0, TAU))
  }

  /** Called every 10 ms of simulated time. */
  slowStep(dt: number, f: Faults) {
    const rng = this.rng
    this.tMs += dt * 1000
    const tSec = this.tMs / 1000

    // ---- supply wander (Ornstein–Uhlenbeck, ~0.5 %)
    this.supply += (1 - this.supply) * (dt / 2) + 0.004 * Math.sqrt(dt) * rng.gauss()
    this.huntNoise += -this.huntNoise * (dt / 0.4) + 0.0015 * Math.sqrt(dt) * rng.gauss()

    // ---- mechanical side
    const L = loadPu(f)
    this.load = L
    const slipT = slipFor(L, f)
    this.rpmTarget = this.powered ? RATED.sync * (1 - slipT) : 0
    const wT = (this.rpmTarget * TAU) / 60
    const tauM = this.powered ? 0.9 : 3.5
    this.omega += (wT - this.omega) * (1 - Math.exp(-dt / tauM))
    if (this.omega < 0.01) this.omega = 0
    const u = this.omega / W_RATED

    // ---- electrical side
    this.eSev = f.electrical
    let iNow = 0
    if (this.powered) {
      const iRun = runCurrent(L, f)
      const slipInst = 1 - this.omega / W_SYNC
      iNow = iRun
      if (slipInst > slipT) {
        // direct-on-line start: inrush falls from locked-rotor current as the rotor accelerates
        const k = clamp((slipInst - slipT) / (1 - slipT), 0, 1)
        iNow = iRun + (MODEL.lockedRotor * RATED.current - iRun) * Math.pow(k, 0.9)
      }
      iNow *= this.supply
    }
    this.iRms += (iNow - this.iRms) * (1 - Math.exp(-dt / (this.powered ? 0.06 : 0.01)))
    if (!this.powered && this.iRms < 0.005) this.iRms = 0

    // electrical fault: amplitude modulation, hunting, random current spikes
    const e = f.electrical
    this.iMod = 1 + e * (0.1 * Math.sin(TAU * 3.7 * tSec + 0.9) + 0.05 * Math.sin(TAU * 1.3 * tSec))
    this.huntOsc = e * 0.012 * Math.sin(TAU * 3.7 * tSec + 0.4)
    if (this.powered && e > 0.02 && rng.next() < 6 * e * dt) this.spike += rng.range(0.35, 0.9)
    this.spike *= Math.exp(-dt / 0.03)

    // ---- thermal side (first-order, τ = R·C)
    const iRatio = this.iRms / RATED.current
    const losses = this.powered ? MODEL.p0 + MODEL.pcu * iRatio * iRatio + MODEL.pBearing * f.bearing + MODEL.pMisalign * f.misalign : 0
    let R = 1 / (0.4 + 0.6 * clamp(u, 0, 1.2))
    R *= 1 + 2.2 * f.cooling
    this.ambient = RATED.ambient + 1.2 * Math.sin((TAU * tSec) / 95)
    const tSs = this.ambient + R * losses
    const tau = MODEL.tauThermal * R
    this.tempC += (tSs - this.tempC) * (1 - Math.exp(-dt / tau))

    // ---- vibration spectrum for the next 10 ms
    const gl = 1 + 1.15 * Math.max(0, L - 1)
    const iF = this.iRms / RATED.current
    this.A1 = MODEL.k1 * u * gl + 0.5 * f.imbalance * u * u + 0.14 * f.misalign * u
    this.A2 = MODEL.k2 * u * gl + 0.4 * f.misalign * u
    this.A3 = MODEL.k3 * u + 0.1 * f.misalign * u
    this.ALine = this.powered ? MODEL.kLine * (0.85 + 0.15 * iF) + 0.34 * e : 0
    this.sigma = (MODEL.kNoise * (1 + 0.9 * Math.max(0, L - 1)) + 0.08 * f.bearing + 0.03 * e) * (0.25 + 0.75 * u)
    this.bearingSev = f.bearing
    this.Ab = MODEL.bearingAmp * Math.pow(f.bearing, 1.4) * u
  }

  /** Called once per ADC trigger. Advances shaft + mains phase and produces the analog samples. */
  fastStep(dt: number, tMs: number) {
    const rng = this.rng
    const wEff = this.omega * (1 + this.huntOsc + this.huntNoise)
    this.phi += wEff * dt
    this.linePhase += TAU * RATED.freq * dt
    if (this.linePhase > 1e6) this.linePhase -= TAU * Math.floor(this.linePhase / TAU)

    // tacho: one pulse per revolution; edge time interpolated inside the sample interval
    this.pulseAtMs = -1
    const rev = Math.floor(this.phi / TAU)
    if (rev > this.lastRev) {
      this.lastRev = rev
      const over = this.phi - rev * TAU
      this.pulseAtMs = tMs - (wEff > 1 ? (over / wEff) * 1000 : 0)
    }

    // bearing outer-race impacts ring a structural resonance
    let x = 0
    if (this.Ab > 0) {
      this.bPhase += (BPFO_RATIO * wEff * dt) / TAU
      if (this.bPhase >= 1) {
        this.bPhase -= 1
        this.bPhase += rng.gauss() * 0.02 // slip of the rolling elements
        x = this.Ab * rng.range(0.75, 1.25)
      }
    }
    const y = x + this.ra1 * this.y1 + this.ra2 * this.y2
    this.y2 = this.y1
    this.y1 = y

    const ph = this.phi
    const th = this.th
    this.vib =
      this.A1 * Math.sin(ph + th[0]) +
      this.A2 * Math.sin(2 * ph + th[1]) +
      this.A3 * Math.sin(3 * ph + th[2]) +
      this.ALine * Math.sin(2 * this.linePhase + th[3]) +
      this.sigma * rng.gauss() +
      y

    if (this.iRms > 0.001) {
      const lp = this.linePhase
      const amp = SQRT2 * this.iRms * this.iMod * (1 + this.spike)
      this.cur =
        amp *
        (Math.sin(lp - 0.2) +
          0.03 * Math.sin(5 * lp + th[4]) +
          0.015 * Math.sin(7 * lp + th[5]) +
          this.eSev * 0.1 * Math.sin(3 * lp + 0.4))
    } else {
      this.cur = 0
    }
  }

  /** Noise-free vibration RMS implied by the current component amplitudes. */
  analyticVibRms(): number {
    const tones = (this.A1 * this.A1 + this.A2 * this.A2 + this.A3 * this.A3 + this.ALine * this.ALine) / 2
    const fb = (BPFO_RATIO * this.omega) / TAU
    const imp = this.Ab > 0 ? this.Ab * this.Ab * 1.0208 * this.impEnergy * (fb / FS) : 0
    return Math.sqrt(tones + this.sigma * this.sigma + imp)
  }

  truth(): Truth {
    return {
      tempC: this.tempC,
      rpm: (this.omega * 60) / TAU,
      iRms: this.iRms,
      load: this.load,
      vibRms: this.analyticVibRms(),
      powered: this.powered,
      omega: this.omega,
      phi: this.phi,
    }
  }
}
