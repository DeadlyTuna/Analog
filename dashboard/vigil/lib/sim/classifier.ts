/**
 * Rule-based fault classifier — the "fault classification" box of the pipeline.
 * Deliberately small and explainable: every score is a smooth ramp over a feature a technician
 * would recognise, so it runs in microseconds on a Cortex-M and can be explained at a viva.
 *
 * Evidence is 0…1 per class. Several classes can be non-zero at once (combined faults).
 */
import { BPFO_RATIO, CLASS_ORDER, RATED, type ClassId } from './config'
import { clamp, ramp } from './dsp'

export interface ClassifierInput {
  vibRms: number
  kurt: number
  crest: number
  a1x: number
  a2x: number
  aLine: number
  hfRatio: number
  curRms: number
  ripple: number // fraction
  thd: number // fraction
  tempC: number
  rpm: number
}

export type Evidence = Record<ClassId, number>

export const emptyEvidence = (): Evidence => ({
  healthy: 1,
  overload: 0,
  bearing: 0,
  misalign: 0,
  imbalance: 0,
  cooling: 0,
  electrical: 0,
})

/** Temperature the winding should have for the measured current and fan speed (steady state). */
export function expectedTemp(curRms: number, rpm: number): number {
  const iR = curRms / RATED.current
  const u = clamp(rpm / RATED.rpm, 0.3, 1.2)
  const R = 1 / (0.4 + 0.6 * u)
  return RATED.ambient + R * (16.64 + 8.358 * iR * iR)
}

export function classify(i: ClassifierInput): Evidence {
  const iR = i.curRms / RATED.current
  const slipPct = clamp((1 - i.rpm / RATED.sync) * 100, 0, 100)

  const electrical = 0.45 * ramp(i.ripple, 0.05, 0.2) + 0.3 * ramp(i.thd, 0.05, 0.12) + 0.25 * ramp(i.aLine, 0.26, 0.5)

  let overload = ramp(iR, 1.15, 1.5) * (0.6 + 0.4 * ramp(slipPct, 1.8, 6))
  overload *= 1 - 0.7 * electrical

  const ratio = i.a1x / Math.max(i.a2x, 0.05)
  let imbalance = ramp(i.a1x, 0.33, 0.6) * ramp(ratio, 3.6, 5.2)
  imbalance *= 1 - 0.8 * overload

  const misalign = ramp(i.a2x, 0.13, 0.32) * ramp(i.a2x / Math.max(i.a1x, 0.1), 0.45, 0.85)

  const bearing = 0.5 * ramp(i.kurt, 3.2, 7) + 0.3 * ramp(i.hfRatio, 0.2, 0.55) + 0.2 * ramp(i.crest, 3.4, 5)

  const excess = i.tempC - expectedTemp(i.curRms, i.rpm)
  const cooling = ramp(excess, 5, 18)

  const ev: Evidence = {
    healthy: 0,
    overload: clamp(overload, 0, 1),
    bearing: clamp(bearing, 0, 1),
    misalign: clamp(misalign, 0, 1),
    imbalance: clamp(imbalance, 0, 1),
    cooling: clamp(cooling, 0, 1),
    electrical: clamp(electrical, 0, 1),
  }
  let worst = 0
  for (const c of CLASS_ORDER) if (c !== 'healthy' && ev[c] > worst) worst = ev[c]
  ev.healthy = 1 - worst
  return ev
}

export interface DiagnosisText {
  cls: ClassId
  evidence: number
  detail: string
  /** Other fault classes that are also strongly present (combined faults). */
  also: ClassId[]
}

export function diagnose(ev: Evidence, i: ClassifierInput): DiagnosisText {
  let cls: ClassId = 'healthy'
  let best = 0.25
  for (const c of CLASS_ORDER) {
    if (c === 'healthy') continue
    if (ev[c] > best) {
      best = ev[c]
      cls = c
    }
  }
  const iR = i.curRms / RATED.current
  const drop = clamp((1 - i.rpm / RATED.rpm) * 100, -50, 100)
  let detail = 'All four channels are inside their normal band.'
  switch (cls) {
    case 'overload':
      detail = `Current is ${(iR * 100).toFixed(0)}% of rated (${i.curRms.toFixed(1)} A) and the shaft is ${drop.toFixed(1)}% below rated speed.`
      break
    case 'bearing': {
      const hz = (BPFO_RATIO * i.rpm) / 60
      detail = `Kurtosis ${i.kurt.toFixed(1)}, crest factor ${i.crest.toFixed(1)}, impacts repeating near ${hz.toFixed(0)} Hz.`
      break
    }
    case 'misalign':
      detail = `2× component is ${i.a2x.toFixed(2)} g, ${((i.a2x / Math.max(i.a1x, 0.01)) * 100).toFixed(0)}% of the 1× component.`
      break
    case 'imbalance':
      detail = `1× component is ${i.a1x.toFixed(2)} g while 2× is only ${i.a2x.toFixed(2)} g.`
      break
    case 'cooling':
      detail = `${i.tempC.toFixed(0)} °C is ${(i.tempC - expectedTemp(i.curRms, i.rpm)).toFixed(0)} °C above what ${i.curRms.toFixed(1)} A of load explains.`
      break
    case 'electrical':
      detail = `Current ripple ${(i.ripple * 100).toFixed(0)}%, distortion ${(i.thd * 100).toFixed(0)}%, 100 Hz hum ${i.aLine.toFixed(2)} g.`
      break
  }
  const also = CLASS_ORDER.filter((k) => k !== 'healthy' && k !== cls && ev[k] >= 0.5)
  return { cls, evidence: cls === 'healthy' ? ev.healthy : best, detail, also }
}
