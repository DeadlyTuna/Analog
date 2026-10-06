'use client'

import { useSnap } from '@vigil/components/sim/SimProvider'
import { Sparkline } from '@vigil/components/scopes/Sparkline'
import { INDICATORS, RATED, type IndicatorKey } from '@vigil/lib/sim/config'
import { C, LEVEL_COLOR, rgba } from '@vigil/lib/theme'
import { cn, fmt } from '@vigil/lib/utils'

type Ch = 'vib' | 'temp' | 'cur' | 'rpm'

const META: Record<Ch, { n: number; name: string; unit: string; color: string; part: string; ind: IndicatorKey[]; series: Ch }> = {
  vib: { n: 1, name: 'Vibration', unit: 'g RMS', color: C.vib, part: 'MEMS accelerometer · ADC ch0', ind: ['vib', 'kurt', 'a1x', 'a2x'], series: 'vib' },
  temp: { n: 2, name: 'Temperature', unit: '°C', color: C.temp, part: 'RTD amplifier · ADC ch4', ind: ['temp'], series: 'temp' },
  cur: { n: 3, name: 'Phase current', unit: 'A RMS', color: C.cur, part: 'Hall sensor · ADC ch1', ind: ['cur', 'ripple'], series: 'cur' },
  rpm: { n: 4, name: 'Shaft speed', unit: 'rpm', color: C.rpm, part: 'Hall tacho · TIM2 capture', ind: ['slip'], series: 'rpm' },
}

/** Limit bar: green until the warning limit, amber until the critical limit, red beyond. */
export function LimitBar({ k, value, invertLabel }: { k: IndicatorKey; value: number; invertLabel?: string }) {
  const d = INDICATORS.find((i) => i.key === k)!
  const lo = k === 'temp' ? 30 : 0
  const hi = d.fail
  const pos = (v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100
  const level = value >= d.crit ? 2 : value >= d.warn ? 1 : 0
  return (
    <div className="relative h-[26px]" aria-hidden>
      <div className="absolute left-0 right-0 top-[5px] h-[5px] overflow-hidden rounded-full">
        <div className="absolute inset-y-0 left-0 bg-go/45" style={{ width: `${pos(d.warn)}%` }} />
        <div className="absolute inset-y-0 bg-caution/55" style={{ left: `${pos(d.warn)}%`, width: `${pos(d.crit) - pos(d.warn)}%` }} />
        <div className="absolute inset-y-0 right-0 bg-stop/60" style={{ left: `${pos(d.crit)}%` }} />
      </div>
      {/* marker */}
      <div
        className="absolute top-0 -translate-x-1/2 transition-[left] duration-300 ease-out"
        style={{ left: `${pos(value)}%` }}
      >
        <div className="mx-auto h-[15px] w-[3px] rounded-sm" style={{ background: LEVEL_COLOR[level], boxShadow: `0 0 8px ${LEVEL_COLOR[level]}` }} />
      </div>
      <span className="mono absolute top-[16px] -translate-x-1/2 text-[9px] text-caution/90" style={{ left: `${pos(d.warn)}%` }}>
        {invertLabel ?? ''}
        {d.warn}
      </span>
      <span className="mono absolute top-[16px] -translate-x-1/2 text-[9px] text-stop/90" style={{ left: `${pos(d.crit)}%` }}>
        {d.crit}
      </span>
    </div>
  )
}

export function SensorCard({ ch }: { ch: Ch }) {
  const m = META[ch]
  const meas = useSnap((s) => s.meas)
  const inds = useSnap((s) => s.indicators)
  const state = useSnap((s) => s.state)

  const level = Math.max(...m.ind.map((k) => inds.find((i) => i.def.key === k)!.level)) as 0 | 1 | 2
  const live = state === 'HEALTHY' || state === 'WARNING' || state === 'CRITICAL'

  let value = ''
  let barKey: IndicatorKey = m.ind[0]
  let barVal = 0
  let stats: [string, string][] = []
  switch (ch) {
    case 'vib':
      value = fmt(meas.vibRms, 3)
      barVal = meas.vibRms
      stats = [
        ['kurtosis', fmt(meas.kurt, 1)],
        ['crest', fmt(meas.crest, 1)],
        ['1×', `${fmt(meas.a1x, 2)} g`],
        ['2×', `${fmt(meas.a2x, 2)} g`],
      ]
      break
    case 'temp':
      value = fmt(meas.tempC, 1)
      barVal = meas.tempC
      stats = [
        ['ambient', '30 °C'],
        ['limit', '70 / 85'],
      ]
      break
    case 'cur':
      value = fmt(meas.curRms, 2)
      barVal = meas.curRms
      stats = [
        ['of rated', `${fmt((meas.curRms / RATED.current) * 100, 0)} %`],
        ['ripple', `${fmt(meas.ripple * 100, 1)} %`],
        ['THD', `${fmt(meas.thd * 100, 1)} %`],
      ]
      break
    case 'rpm':
      value = fmt(meas.rpm, 0)
      barKey = 'slip'
      barVal = meas.slipPct
      stats = [
        ['slip', `${fmt(meas.slipPct, 1)} %`],
        ['shaft', `${fmt(meas.rpm / 60, 1)} Hz`],
        ['sync', '1500 rpm'],
      ]
      break
  }

  const tone = level === 2 ? 'border-stop/60' : level === 1 ? 'border-caution/50' : 'border-ink-600'
  return (
    <section
      className={cn('panel relative overflow-hidden p-3.5 transition-colors', tone)}
      aria-label={`${m.name} channel`}
      style={level ? { boxShadow: `0 0 0 1px ${rgba(LEVEL_COLOR[level], 0.13)}, 0 0 28px -8px ${rgba(LEVEL_COLOR[level], 0.33)}` } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-[18px] w-[18px] place-items-center rounded-[4px] font-mono text-[10px] font-bold text-ink-950" style={{ background: m.color }}>
            {m.n}
          </span>
          <span className="label !text-bone/90">{m.name}</span>
        </div>
        {level > 0 && (
          <span className="chip !h-5" style={{ color: LEVEL_COLOR[level], borderColor: rgba(LEVEL_COLOR[level], 0.47) }}>
            {level === 2 ? 'critical' : 'warning'}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div>
          <div className="readout text-[40px]" style={{ color: live || state === 'STARTUP' ? C.bone : C.steel3 }}>
            {value}
          </div>
          <div className="label mt-1.5 !tracking-[0.1em]" style={{ color: m.color }}>
            {m.unit}
          </div>
        </div>
        <div className="h-[46px] w-[46%] min-w-[96px]">
          <Sparkline series={m.series} color={m.color} seconds={30} />
        </div>
      </div>

      <div className="mt-2.5">
        <LimitBar k={barKey} value={barVal} />
      </div>

      <dl className="mono mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[10.5px] text-steel-200">
        {stats.map(([k, v]) => (
          <div key={k} className="flex gap-1.5">
            <dt className="text-steel-300">{k}</dt>
            <dd className="text-bone">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="label mt-2 !text-[9px] !tracking-[0.1em] text-ink-400">{m.part}</p>
    </section>
  )
}
