'use client'

import { ArrowRight } from 'lucide-react'
import { useCanvasLoop } from '@vigil/components/scopes/useCanvasLoop'
import { useSnap, useStore } from '@vigil/components/sim/SimProvider'
import { DMA_HALF, DMA_LEN, FS } from '@vigil/lib/sim/config'
import { C, mono, paint, resolve, rgba } from '@vigil/lib/theme'
import { fmt } from '@vigil/lib/utils'

const STEPS = [
  { t: 'Sensor', d: 'Analog voltage, 0–3.3 V', c: C.steel2 },
  { t: 'TIM3', d: 'Update event every 390.6 µs triggers a conversion', c: C.rpm },
  { t: 'ADC1', d: '12-bit result, 0–4095 counts', c: C.vib },
  { t: 'DMA1', d: 'Writes each result into a circular buffer. No CPU involved', c: C.vib },
  { t: 'Interrupt', d: 'Half-full and full flags fire every 25 ms', c: C.forecast },
  { t: 'ACQ task', d: 'Counts become g, A and °C, then enter the sample ring', c: C.go },
]

function DmaView({ channel }: { channel: 'vib' | 'cur' }) {
  const store = useStore()
  const vib = channel === 'vib'
  const color = vib ? C.vib : C.cur
  const ref = useCanvasLoop((ctx, w, h) => {
    const fw = store.sim.fw
    const buf = vib ? fw.dmaVib : fw.dmaCur
    const pos = fw.dmaPos
    ctx.clearRect(0, 0, w, h)
    const mid = h / 2
    const span = vib ? 520 : 900
    const bw = w / DMA_LEN
    // half-buffer shading
    ctx.fillStyle = paint(C.forecast, 0.05)
    ctx.fillRect(0, 0, w / 2, h)
    ctx.strokeStyle = paint(C.bone, 0.07)
    ctx.beginPath()
    ctx.moveTo(0, mid + 0.5)
    ctx.lineTo(w, mid + 0.5)
    ctx.stroke()
    for (let i = 0; i < DMA_LEN; i++) {
      const age = (pos - 1 - i + DMA_LEN) % DMA_LEN
      const a = 1 - (age / DMA_LEN) * 0.82
      const v = (buf[i] - 2048) / span
      const y = mid - Math.max(-1, Math.min(1, v)) * (mid - 6)
      ctx.fillStyle = paint(color, a)
      ctx.fillRect(i * bw + 0.5, Math.min(y, mid), Math.max(1, bw - 1), Math.max(1.5, Math.abs(y - mid)))
    }
    // markers
    ctx.font = `500 9px ${mono()}`
    ctx.textBaseline = 'top'
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = paint(C.forecast, 0.7)
    ;[DMA_HALF, 0].forEach((idx) => {
      const x = Math.round((idx / DMA_LEN) * w) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    })
    ctx.setLineDash([])
    ctx.fillStyle = paint(C.forecast, 0.95)
    ctx.textAlign = 'left'
    ctx.fillText('HT ◂ half transfer', w / 2 + 4, 4)
    ctx.fillText('TC ▸ transfer complete', 4, 4)
    // write pointer
    const px = (pos / DMA_LEN) * w
    ctx.strokeStyle = resolve(C.bone)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, h)
    ctx.stroke()
    ctx.lineWidth = 1
    ctx.fillStyle = resolve(C.bone)
    ctx.textAlign = px > w - 90 ? 'right' : 'left'
    ctx.fillText(`write ▸ [${pos}]`, px + (px > w - 90 ? -5 : 5), h - 13)
  }, 30)
  return <canvas ref={ref} className="block h-full w-full" />
}

export function AcquisitionSection() {
  const adc = useSnap((s) => s.adc)
  const over = useSnap((s) => s.rtos.dmaOverruns)
  const total = useSnap((s) => s.rtos.adcCount)
  const v = (c: number) => (c * 3.3) / 4095
  const rows = [
    { ch: 'Vibration', color: C.vib, raw: adc.vib, volts: v(adc.vib), eng: `${fmt((v(adc.vib) - 1.65) / 0.33, 3)} g`, rule: '(V − 1.65) ÷ 0.33 V/g', lsb: '2.44 mg' },
    { ch: 'Current', color: C.cur, raw: adc.cur, volts: v(adc.cur), eng: `${fmt((v(adc.cur) - 1.65) / 0.05, 2)} A`, rule: '(V − 1.65) ÷ 0.05 V/A', lsb: '16.1 mA' },
    { ch: 'Temperature', color: C.temp, raw: adc.temp, volts: v(adc.temp), eng: `${fmt(v(adc.temp) / 0.01, 1)} °C`, rule: 'V ÷ 10 mV/°C', lsb: '0.081 °C' },
  ]

  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-[repeat(6,1fr)]">
        {STEPS.map((s, i) => (
          <li key={s.t} className="panel relative p-3.5">
            <p className="mono text-[10px] tracking-[0.1em] text-steel-300">{String(i + 1).padStart(2, '0')}</p>
            <p className="display mt-1 text-[22px]" style={{ color: s.c }}>
              {s.t}
            </p>
            <p className="mt-1 text-[13.5px] leading-snug text-steel-200">{s.d}</p>
            {i < STEPS.length - 1 && <ArrowRight size={14} className="absolute -right-[11px] top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-ink-900 text-steel-300 xl:block" aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="panel lg:col-span-7">
          <div className="panel-head">
            <span className="label">DMA circular buffer · {DMA_LEN} × u16 per channel</span>
            <span className="mono text-[11px] text-steel-200">
              {total.toLocaleString('en-US')} conversions · <span className={over ? 'text-stop' : 'text-go'}>{over} overruns</span>
            </span>
          </div>
          <div className="space-y-2 p-3">
            <div>
              <p className="label mb-1.5 !text-vib">Channel 0 · vibration</p>
              <div className="screen h-[120px]">
                <DmaView channel="vib" />
              </div>
            </div>
            <div>
              <p className="label mb-1.5 !text-cur">Channel 1 · current</p>
              <div className="screen h-[120px]">
                <DmaView channel="cur" />
              </div>
            </div>
            <p className="text-[13.5px] leading-snug text-steel-300">
              The bright edge is the newest sample; older data fades. When the pointer crosses the dashed line the DMA controller raises an interrupt, and the acquisition task has 25 ms to copy that half out before it is overwritten.
            </p>
          </div>
        </section>

        <section className="panel lg:col-span-5">
          <div className="panel-head">
            <span className="label">One conversion, step by step</span>
            <span className="mono text-[11px] text-steel-200">
              fs {FS} Hz · Nyquist {FS / 2} Hz
            </span>
          </div>
          <div className="divide-y divide-ink-700/70">
            {rows.map((r) => (
              <div key={r.ch} className="p-4">
                <p className="label" style={{ color: r.color }}>
                  {r.ch}
                </p>
                <div className="mt-2 flex items-baseline gap-2 font-mono">
                  <span className="readout text-[26px]">{r.raw}</span>
                  <span className="text-[11px] text-steel-300">counts</span>
                  <ArrowRight size={13} className="text-ink-400" aria-hidden />
                  <span className="text-[14px] text-bone">{fmt(r.volts, 3)} V</span>
                  <ArrowRight size={13} className="text-ink-400" aria-hidden />
                  <span className="text-[14px] font-medium" style={{ color: r.color }}>
                    {r.eng}
                  </span>
                </div>
                <p className="mono mt-2 text-[10.5px] text-steel-300">
                  {r.rule} · 1 count = <span className="text-bone">{r.lsb}</span>
                </p>
              </div>
            ))}
            <div className="p-4">
              <p className="label">Why it matters</p>
              <p className="mt-1.5 text-[13.5px] leading-snug text-steel-200 text-pretty">
                One count of vibration is 2.4 mg. That is small next to the 250 mg RMS signal, but a faint bearing defect lives in the last few counts, which is why the sensor noise and the ADC step size are both simulated.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

