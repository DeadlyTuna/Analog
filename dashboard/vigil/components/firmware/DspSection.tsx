'use client'

import { ArrowRight } from 'lucide-react'
import { Spectrum } from '@vigil/components/scopes/Spectrum'
import { shallowEqual, useSnap } from '@vigil/components/sim/SimProvider'
import { BIN_HZ, DSP_N, FS } from '@vigil/lib/sim/config'
import { C } from '@vigil/lib/theme'
import { fmt } from '@vigil/lib/utils'

const STAGES = [
  { t: 'Window', d: `Last ${DSP_N} samples of both channels (200 ms), copied when the task starts` },
  { t: 'Remove mean', d: 'Subtract the DC level so offsets do not leak into every bin' },
  { t: 'Hann', d: 'Taper the window edges to keep strong tones from smearing' },
  { t: 'One FFT, two signals', d: 'Vibration in the real part, current in the imaginary part; split afterwards' },
  { t: 'Features', d: 'Tone amplitudes, band energy, RMS, crest factor, kurtosis, ripple, THD' },
  { t: 'Queue', d: 'The feature set goes to the fault-detection task' },
]

function Row({ k, v, u, c, note }: { k: string; v: string; u?: string; c?: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-700/60 py-[7px] last:border-0">
      <dt className="text-[14px] text-steel-200">
        {k}
        {note && <span className="mono ml-2 text-[10px] text-steel-300">{note}</span>}
      </dt>
      <dd className="mono text-[13px] font-medium" style={{ color: c ?? C.bone }}>
        {v}
        {u && <span className="ml-1 text-[10px] font-normal text-steel-300">{u}</span>}
      </dd>
    </div>
  )
}

export function DspSection() {
  const m = useSnap((s) => s.meas, shallowEqual)
  const dsp = useSnap((s) => s.rtos.tasks.find((t) => t.id === 'DSP'))
  const feats = useSnap((s) => s.rtos.featureCount)

  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((s, i) => (
          <li key={s.t} className="panel relative p-3.5">
            <p className="mono text-[10px] tracking-[0.1em] text-steel-300">{String(i + 1).padStart(2, '0')}</p>
            <p className="display mt-1 text-[21px] leading-[1] text-bone">{s.t}</p>
            <p className="mt-1.5 text-[13px] leading-snug text-steel-300">{s.d}</p>
            {i < STAGES.length - 1 && <ArrowRight size={14} className="absolute -right-[11px] top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-ink-900 text-steel-300 xl:block" aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="panel lg:col-span-7">
          <div className="panel-head">
            <span className="label">Spectrum the DSP task just computed</span>
            <span className="mono text-[11px] text-steel-200">
              {BIN_HZ} Hz per bin · {feats.toLocaleString('en-US')} windows
            </span>
          </div>
          <div className="p-2.5">
            <div className="screen h-[250px]">
              <Spectrum zoom />
            </div>
            <p className="mt-3 px-1 text-[13.5px] leading-snug text-steel-300">
              {DSP_N} points at {FS} Hz gives 5 Hz resolution up to 1,280 Hz. Running speed (1×) and twice running speed (2×) are tracked from the tacho; the 100 Hz line is the mains-frequency magnetic hum. DSP task: <span className="mono text-bone">{fmt(dsp?.respAvg ?? 0, 2)} ms</span> per window, deadline 100 ms.
            </p>
          </div>
        </section>

        <section className="panel lg:col-span-5">
          <div className="panel-head">
            <span className="label">Features, right now</span>
          </div>
          <div className="grid grid-cols-1 gap-x-8 px-4 pb-3 pt-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <dl>
              <p className="label !text-vib pb-1 pt-3">Vibration</p>
              <Row k="RMS" v={fmt(m.vibRms, 3)} u="g" />
              <Row k="Crest factor" v={fmt(m.crest, 2)} />
              <Row k="Kurtosis" v={fmt(m.kurt, 2)} note="3 = smooth" />
              <Row k="1× running speed" v={fmt(m.a1x, 3)} u="g" note={`${fmt(m.frHz, 1)} Hz`} />
              <Row k="2× running speed" v={fmt(m.a2x, 3)} u="g" note={`${fmt(m.frHz * 2, 1)} Hz`} />
              <Row k="Mains hum" v={fmt(m.aLine, 3)} u="g" note="100 Hz" />
              <Row k="Bearing band" v={fmt(m.aBpfo, 3)} u="g" note={`${fmt(m.frHz * 3.58, 0)} Hz`} />
              <Row k="Energy above 400 Hz" v={fmt(m.hfRatio * 100, 0)} u="%" />
            </dl>
            <dl>
              <p className="label !text-cur pb-1 pt-3">Current</p>
              <Row k="RMS" v={fmt(m.curRms, 2)} u="A" />
              <Row k="Cycle-to-cycle ripple" v={fmt(m.ripple * 100, 1)} u="%" />
              <Row k="Harmonic distortion" v={fmt(m.thd * 100, 1)} u="%" />
              <p className="label !text-temp pb-1 pt-4">Slow channels</p>
              <Row k="Temperature" v={fmt(m.tempC, 1)} u="°C" note="IIR α 0.35" />
              <Row k="Speed" v={fmt(m.rpm, 0)} u="rpm" note="median of 3" />
              <Row k="Slip" v={fmt(m.slipPct, 2)} u="%" />
            </dl>
          </div>
        </section>
      </div>
    </div>
  )
}
