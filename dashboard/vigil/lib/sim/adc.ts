/**
 * Sensor front-ends + 12-bit ADC. The firmware never sees "real" values — only counts —
 * so quantisation and electrical noise are part of the simulation.
 *
 *  accelerometer : 1.65 V + 0.33 V/g          (analog MEMS, ±5 g)
 *  current       : 1.65 V + 0.05 V/A          (hall sensor + divider, ±33 A peak)
 *  temperature   : 10 mV/°C                    (analog RTD amplifier)
 */
import { Rng } from './rng'

export const ADC_MAX = 4095
export const VREF = 3.3
const LSB = VREF / ADC_MAX

const VIB_GAIN = 0.33
const CUR_GAIN = 0.05
const MID = 1.65
const TEMP_GAIN = 0.01

const clampCount = (c: number) => (c < 0 ? 0 : c > ADC_MAX ? ADC_MAX : Math.round(c))

export class Sensors {
  constructor(private rng: Rng) {}

  vibCounts(g: number): number {
    return clampCount((MID + VIB_GAIN * g + this.rng.gauss() * 0.0011) / LSB)
  }

  curCounts(amps: number): number {
    return clampCount((MID + CUR_GAIN * amps + this.rng.gauss() * 0.0013) / LSB)
  }

  tempCounts(celsius: number): number {
    return clampCount((TEMP_GAIN * celsius + this.rng.gauss() * 0.0009) / LSB)
  }
}

/* Firmware-side conversion: counts → engineering units. */
export const countsToG = (c: number) => (c * LSB - MID) / VIB_GAIN
export const countsToAmps = (c: number) => (c * LSB - MID) / CUR_GAIN
export const countsToCelsius = (c: number) => (c * LSB) / TEMP_GAIN
