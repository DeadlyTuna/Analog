/* Headless calibration of the motor model: steady-state values + feature signatures per fault. */
import { BPFO_RATIO, DSP_N, FS, RATED, type FaultKey } from '../lib/sim/config'
import { MotorModel, zeroFaults, type Faults } from '../lib/sim/motor'
import { Sensors, countsToAmps, countsToG } from '../lib/sim/adc'
import { bandPower, dualSpectrum, hannWindow, toneAmp, waveStats, type WaveStats } from '../lib/sim/dsp'

const win = hannWindow(DSP_N)
const re = new Float64Array(DSP_N)
const im = new Float64Array(DSP_N)
const magV = new Float32Array(DSP_N / 2)
const magC = new Float32Array(DSP_N / 2)

function run(label: string, set: Partial<Faults>, settleSec = 200) {
  const m = new MotorModel(11)
  const s = new Sensors(m.rng)
  const f = { ...zeroFaults(), ...set }
  m.powered = true
  for (let i = 0; i < settleSec * 100; i++) m.slowStep(0.01, f)

  // collect a few windows
  const rows: number[][] = []
  const v = new Float64Array(DSP_N)
  const c = new Float64Array(DSP_N)
  const st: WaveStats = { mean: 0, rms: 0, peak: 0, crest: 0, kurt: 0 }
  const sc: WaveStats = { mean: 0, rms: 0, peak: 0, crest: 0, kurt: 0 }
  let tMs = settleSec * 1000
  for (let w = 0; w < 12; w++) {
    for (let n = 0; n < DSP_N; n++) {
      // 10 ms slow step every 25.6 samples
      if (n % 26 === 0) m.slowStep(0.01, f)
      m.fastStep(1 / FS, tMs)
      tMs += 1000 / FS
      v[n] = countsToG(s.vibCounts(m.vib))
      c[n] = countsToAmps(s.curCounts(m.cur))
    }
    waveStats(v, DSP_N, st)
    // current rms about zero (mean should be ~0)
    waveStats(c, DSP_N, sc)
    for (let n = 0; n < DSP_N; n++) {
      v[n] -= st.mean
      c[n] -= sc.mean
    }
    dualSpectrum(v, c, win, re, im, magV, magC)
    const fr = (m.omega / (2 * Math.PI))
    const frBin = fr / (FS / DSP_N)
    const a1 = toneAmp(magV, frBin)
    const a2 = toneAmp(magV, frBin * 2)
    const aL = toneAmp(magV, 100 / (FS / DSP_N))
    const total = bandPower(magV, 1, 255)
    const hf = bandPower(magV, 80, 255) / total
    // current ripple: per-cycle rms spread
    const seg = 51
    let mn = 1e9
    let mx = 0
    for (let k = 0; k + seg <= DSP_N; k += seg) {
      let a = 0
      for (let i = 0; i < seg; i++) a += c[k + i] * c[k + i]
      const r = Math.sqrt(a / seg)
      mn = Math.min(mn, r)
      mx = Math.max(mx, r)
    }
    const ripple = (mx - mn) / sc.rms
    const h1 = toneAmp(magC, 10)
    const h3 = toneAmp(magC, 30)
    const h5 = toneAmp(magC, 50)
    const h7 = toneAmp(magC, 70)
    const thd = Math.sqrt(h3 * h3 + h5 * h5 + h7 * h7) / Math.max(h1, 1e-6)
    rows.push([st.rms, st.kurt, st.crest, a1, a2, aL, hf, sc.rms, sc.crest, ripple * 100, thd * 100])
  }
  const avg = rows[0].map((_, i) => rows.reduce((a, r) => a + r[i], 0) / rows.length)
  const rpm = (m.omega * 60) / (2 * Math.PI)
  const t = m.truth()
  console.log(
    label.padEnd(22),
    `T=${m.tempC.toFixed(1).padStart(5)}  N=${rpm.toFixed(0).padStart(4)}  Itrue=${t.iRms.toFixed(2)}  vibTrue=${t.vibRms.toFixed(3)} |`,
    `vib=${avg[0].toFixed(3)} kurt=${avg[1].toFixed(2)} crest=${avg[2].toFixed(2)} a1x=${avg[3].toFixed(3)} a2x=${avg[4].toFixed(3)} aLine=${avg[5].toFixed(3)} hf=${avg[6].toFixed(2)} |`,
    `I=${avg[7].toFixed(2)} cCrest=${avg[8].toFixed(2)} ripple=${avg[9].toFixed(1)}% thd=${avg[10].toFixed(1)}%`,
  )
}

console.log(`rated: ${RATED.rpm} rpm, ${RATED.current} A, BPFO ${(BPFO_RATIO * (RATED.rpm / 60)).toFixed(1)} Hz\n`)
run('NORMAL', {})
run('OVERLOAD 100%', { overload: 1 })
run('overload 50%', { overload: 0.5 })
for (const k of ['bearing', 'misalign', 'imbalance', 'cooling', 'electrical'] as FaultKey[]) {
  run(`${k} 40%`, { [k]: 0.4 })
  run(`${k} 70%`, { [k]: 0.7 })
  run(`${k} 100%`, { [k]: 1 })
}
