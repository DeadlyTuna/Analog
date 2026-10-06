'use client'

import { Sparkline } from '@vigil/components/scopes/Sparkline'
import { useSnap } from '@vigil/components/sim/SimProvider'
import { FAULT_KEYS, FAULT_META, type FaultKey } from '@vigil/lib/sim/config'
import { C } from '@vigil/lib/theme'
import { cn, fmt } from '@vigil/lib/utils'
import { Reveal } from './Reveal'

type Ch = 'vib' | 'temp' | 'cur' | 'rpm'

const CHANNELS: { ch: Ch; n: number; name: string; unit: string; color: string; catches: string[]; normal: string; over: string }[] = [
  { ch: 'vib', n: 1, name: 'Vibration', unit: 'g RMS', color: C.vib, catches: ['Bearing problems', 'Shaft imbalance', 'Misalignment'], normal: '0.25 g', over: '0.40 g' },
  { ch: 'temp', n: 2, name: 'Temperature', unit: '°C', color: C.temp, catches: ['Overheating', 'Cooling failure', 'Excessive load'], normal: '55 °C', over: '78 °C' },
  { ch: 'cur', n: 3, name: 'Current', unit: 'A RMS', color: C.cur, catches: ['Overload', 'Electrical abnormalities', 'Rising mechanical resistance'], normal: '4.2 A', over: '7.8 A' },
  { ch: 'rpm', n: 4, name: 'Speed', unit: 'rpm', color: C.rpm, catches: ['Speed reduction', 'Abnormal operating conditions', 'Load changes'], normal: '1480 rpm', over: '1350 rpm' },
]

function Live({ ch }: { ch: Ch }) {
  const v = useSnap((s) => (ch === 'vib' ? s.meas.vibRms : ch === 'temp' ? s.meas.tempC : ch === 'cur' ? s.meas.curRms : s.meas.rpm))
  const dp = ch === 'vib' ? 3 : ch === 'temp' ? 1 : ch === 'cur' ? 2 : 0
  return <>{fmt(v, dp)}</>
}

/** Arrow strength: +3 … −3 */
const MATRIX: Record<FaultKey, Record<Ch, [number, string]>> = {
  overload: { vib: [1, '0.25 → 0.40 g'], temp: [2, '55 → 78 °C'], cur: [3, '4.2 → 7.8 A'], rpm: [-2, '1480 → 1350'] },
  bearing: { vib: [3, 'impacts, kurtosis 3 → 8'], temp: [1, '+ friction heat'], cur: [1, 'slightly higher'], rpm: [0, 'unchanged'] },
  misalign: { vib: [2, 'strong 2× tone'], temp: [1, 'a little extra heat'], cur: [1, 'slightly higher'], rpm: [0, 'unchanged'] },
  imbalance: { vib: [2, 'strong 1× tone'], temp: [0, 'unchanged'], cur: [0, 'unchanged'], rpm: [0, 'unchanged'] },
  cooling: { vib: [0, 'unchanged'], temp: [3, 'runs away to 110 °C'], cur: [0, 'unchanged'], rpm: [0, 'unchanged'] },
  electrical: { vib: [1, '100 Hz hum'], temp: [1, 'a little extra heat'], cur: [3, 'ripple and spikes'], rpm: [-1, 'hunting'] },
}

const COLS: { ch: Ch; label: string; color: string }[] = [
  { ch: 'vib', label: 'Vibration', color: C.vib },
  { ch: 'temp', label: 'Temperature', color: C.temp },
  { ch: 'cur', label: 'Current', color: C.cur },
  { ch: 'rpm', label: 'Speed', color: C.rpm },
]

function Arrows({ n, color }: { n: number; color: string }) {
  if (n === 0) return <span className="mono text-ink-400">—</span>
  const up = n > 0
  return (
    <span className="inline-flex gap-[2px]" style={{ color }} aria-label={`${up ? 'rises' : 'falls'} ${Math.abs(n)} of 3`}>
      {[1, 2, 3].map((i) => (
        <svg key={i} width="9" height="11" viewBox="0 0 9 11" style={{ opacity: i <= Math.abs(n) ? 1 : 0.16, transform: up ? undefined : 'scaleY(-1)' }}>
          <path d="M4.5 0 9 8H0z" fill="currentColor" />
        </svg>
      ))}
    </span>
  )
}

export function Channels() {
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CHANNELS.map((c, i) => (
          <Reveal key={c.ch} delay={i * 0.07}>
            <article className="panel spot h-full p-4" onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
              e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
            }}>
              <div className="flex items-center gap-2.5">
                <span className="grid h-[22px] w-[22px] place-items-center rounded-[5px] font-mono text-[12px] font-bold text-ink-950" style={{ background: c.color }}>
                  {c.n}
                </span>
                <h3 className="display text-[26px] text-bone">{c.name}</h3>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="readout text-[40px]">
                    <Live ch={c.ch} />
                  </p>
                  <p className="label mt-1.5" style={{ color: c.color }}>
                    {c.unit} · live
                  </p>
                </div>
                <div className="h-[52px] w-[48%]">
                  <Sparkline series={c.ch} color={c.color} seconds={30} />
                </div>
              </div>
              <p className="label mt-5">Catches</p>
              <ul className="mt-2 space-y-1.5">
                {c.catches.map((t) => (
                  <li key={t} className="flex items-start gap-2 text-[15px] text-bone/90">
                    <span className="mt-[9px] h-px w-3 shrink-0" style={{ background: c.color }} />
                    {t}
                  </li>
                ))}
              </ul>
              <p className="mono mt-4 border-t border-ink-600/70 pt-3 text-[11px] text-steel-300">
                normal <span className="text-bone">{c.normal}</span> · overloaded <span className="text-bone">{c.over}</span>
              </p>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-4">
        <section className="panel overflow-hidden" aria-label="What each fault looks like on each channel">
          <div className="panel-head">
            <span className="label">What each fault looks like</span>
            <span className="label hidden sm:inline">arrows show how far a channel moves</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-ink-600/70">
                  <th scope="col" className="label px-4 py-2.5 font-medium">
                    Fault
                  </th>
                  {COLS.map((c) => (
                    <th key={c.ch} scope="col" className="label px-3 py-2.5 font-medium" style={{ color: c.color }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FAULT_KEYS.map((k) => (
                  <tr key={k} className="group border-b border-ink-700/70 last:border-0 hover:bg-ink-700/30">
                    <th scope="row" className="px-4 py-3 align-top font-normal">
                      <p className="text-[16px] font-semibold text-bone">{FAULT_META[k].label}</p>
                      <p className="mt-0.5 max-w-[34ch] text-[13px] leading-snug text-steel-300">{FAULT_META[k].signature}</p>
                    </th>
                    {COLS.map((c) => {
                      const [n, note] = MATRIX[k][c.ch]
                      return (
                        <td key={c.ch} className="px-3 py-3 align-top">
                          <Arrows n={n} color={c.color} />
                          <p className={cn('mono mt-1.5 text-[10.5px]', n === 0 ? 'text-ink-400' : 'text-steel-200')}>{note}</p>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </Reveal>
    </div>
  )
}

