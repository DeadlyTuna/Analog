'use client'

import { useState, type ReactNode } from 'react'
import { Scope } from '@vigil/components/scopes/Scope'
import { Spectrogram } from '@vigil/components/scopes/Spectrogram'
import { Spectrum } from '@vigil/components/scopes/Spectrum'
import { TrendStrip } from '@vigil/components/scopes/TrendStrip'
import { useSnap } from '@vigil/components/sim/SimProvider'
import { Segmented } from '@vigil/components/ui/Segmented'
import { INDICATORS } from '@vigil/lib/sim/config'
import { C, IRON_LUT } from '@vigil/lib/theme'
import { cn, fmt } from '@vigil/lib/utils'

function ScopePanel({ title, meta, children, className, right }: { title: string; meta?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={cn('panel flex flex-col', className)}>
      <div className="panel-head">
        <span className="label !text-bone/90">{title}</span>
        <div className="flex items-center gap-3">
          {meta && <span className="mono text-[11px] text-steel-200">{meta}</span>}
          {right}
        </div>
      </div>
      <div className="p-2.5">{children}</div>
    </section>
  )
}

function VibMeta() {
  const rms = useSnap((s) => s.meas.vibRms)
  const crest = useSnap((s) => s.meas.crest)
  return (
    <>
      <span className="text-vib">{fmt(rms, 3)} g</span> rms · crest {fmt(crest, 1)}
    </>
  )
}

function CurMeta() {
  const rms = useSnap((s) => s.meas.curRms)
  return <span className="text-cur">{fmt(rms, 2)} A rms · 50 Hz</span>
}

const ind = (k: string) => INDICATORS.find((i) => i.key === k)!

export function SignalsSection() {
  const [zoom, setZoom] = useState(false)
  const lut = Array.from({ length: 12 }, (_, i) => {
    const j = Math.round((i / 11) * 255) * 3
    return `rgb(${IRON_LUT[j]},${IRON_LUT[j + 1]},${IRON_LUT[j + 2]})`
  }).join(',')

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <ScopePanel title="CH1 · Vibration — time domain" meta={<VibMeta />} className="lg:col-span-4">
        <div className="screen h-[230px]">
          <Scope channel="vib" />
        </div>
      </ScopePanel>

      <ScopePanel
        title="CH1 · Vibration — spectrum"
        className="lg:col-span-4"
        right={
          <Segmented
            label="Frequency span"
            size="sm"
            value={zoom ? 'z' : 'f'}
            onChange={(v) => setZoom(v === 'z')}
            options={[
              { value: 'f', label: '1280 Hz' },
              { value: 'z', label: '320 Hz' },
            ]}
          />
        }
      >
        <div className="screen h-[230px]">
          <Spectrum zoom={zoom} />
        </div>
      </ScopePanel>

      <ScopePanel title="CH1 · Vibration — spectrogram" meta="last 20 s" className="lg:col-span-4">
        <div className="screen h-[230px]">
          <Spectrogram />
        </div>
        <div className="mt-2 flex items-center gap-2 px-0.5">
          <span className="label">0</span>
          <span className="h-1.5 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${lut})` }} />
          <span className="label">0.45 g</span>
        </div>
      </ScopePanel>

      <ScopePanel title="CH3 · Phase current" meta={<CurMeta />} className="lg:col-span-4">
        <div className="screen h-[230px]">
          <Scope channel="cur" />
        </div>
      </ScopePanel>

      <ScopePanel title="Trend recorder — last 2 minutes" meta="10 Hz" className="lg:col-span-8">
        <div className="space-y-1.5">
          {(
            [
              { key: 'temp', label: 'Temperature', unit: '°C', color: C.temp, min: 30, max: 110, d: ind('temp'), dp: 1 },
              { key: 'vib', label: 'Vibration', unit: 'g', color: C.vib, min: 0, max: 0.8, d: ind('vib'), dp: 3 },
              { key: 'cur', label: 'Current', unit: 'A', color: C.cur, min: 0, max: 10, d: ind('cur'), dp: 2 },
              { key: 'rpm', label: 'Speed', unit: 'rpm', color: C.rpm, min: 1200, max: 1520, d: null, dp: 0 },
              { key: 'hi', label: 'Health index', unit: '', color: C.go, min: 0, max: 100, d: null, dp: 0 },
            ] as const
          ).map((r) => (
            <div key={r.key} className="grid grid-cols-[88px_1fr] items-center gap-3 sm:grid-cols-[110px_1fr]">
              <div>
                <p className="label !text-bone/85">{r.label}</p>
                <p className="label mt-0.5 !text-[9px]" style={{ color: r.color }}>
                  {r.unit || 'of 100'}
                </p>
              </div>
              <div className="screen h-[58px]">
                <TrendStrip
                  series={r.key}
                  color={r.color}
                  min={r.min}
                  max={r.max}
                  warn={r.d ? r.d.warn : r.key === 'hi' ? 70 : r.key === 'rpm' ? 1440 : undefined}
                  crit={r.d ? r.d.crit : r.key === 'hi' ? 30 : r.key === 'rpm' ? 1320 : undefined}
                  invert={r.key === 'hi' || r.key === 'rpm'}
                  unit={r.unit}
                  dp={r.dp}
                />
              </div>
            </div>
          ))}
        </div>
      </ScopePanel>
    </div>
  )
}
