'use client'

import { Cog, Fan, Scale, Unlink, Weight, Wrench, Zap } from 'lucide-react'
import { useRef, useState, type ComponentType } from 'react'
import { Segmented } from '@vigil/components/ui/Segmented'
import { useSnap, useStore } from '@vigil/components/sim/SimProvider'
import { FAULT_KEYS, FAULT_META, type FaultKey } from '@vigil/lib/sim/config'
import { cn } from '@vigil/lib/utils'

const ICON: Record<FaultKey, ComponentType<{ size?: number; className?: string }>> = {
  overload: Weight,
  bearing: Cog,
  misalign: Unlink,
  imbalance: Scale,
  cooling: Fan,
  electrical: Zap,
}

type FaultRow = { key: FaultKey; current: number; target: number }
const sameFaults = (a: FaultRow[], b: FaultRow[]) =>
  a.every((x, i) => Math.abs(x.current - b[i].current) < 0.004 && Math.abs(x.target - b[i].target) < 0.004)

/** Fault injection console. Several faults can be active at once; the slider edits the selected one. */
export function FaultDeck({ className }: { className?: string }) {
  const store = useStore()
  const faults = useSnap((s) => s.faults, sameFaults)
  const [sel, setSel] = useState<FaultKey>('bearing')
  const [gradual, setGradual] = useState(false)
  const [dur, setDur] = useState(45)
  const dragFrom = useRef(0)
  const gradualSec = gradual ? dur : 0
  const row = (k: FaultKey) => faults.find((f) => f.key === k)!
  const anyActive = faults.some((f) => f.target > 0.001 || f.current > 0.001)
  const selRow = row(sel)

  const clickChip = (k: FaultKey) => {
    const r = row(k)
    if (r.target <= 0.001) {
      setSel(k)
      store.setFault(k, FAULT_META[k].preset, gradualSec)
    } else if (sel !== k) {
      setSel(k)
    } else {
      store.setFault(k, 0)
    }
  }

  return (
    <section className={cn('panel relative overflow-hidden', className)} aria-label="Fault injection">
      <div className="hazard absolute inset-y-0 left-0 w-[7px]" aria-hidden />
      <div className="pl-[7px]">
        <div className="panel-head">
          <div className="flex items-baseline gap-3">
            <span className="label !text-caution">Fault injection</span>
            <span className="hidden text-[13px] text-steel-300 sm:inline">Break the motor — the firmware has to notice.</span>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => store.maintenance()} disabled={!anyActive}>
            <Wrench size={14} aria-hidden /> Repair
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-6">
          {FAULT_KEYS.map((k) => {
            const m = FAULT_META[k]
            const r = row(k)
            const active = r.target > 0.001
            const Icon = ICON[k]
            return (
              <button
                key={k}
                type="button"
                onClick={() => clickChip(k)}
                aria-pressed={active}
                title={m.signature}
                className={cn(
                  'group relative flex h-[58px] flex-col justify-between overflow-hidden rounded-lg border px-2.5 py-2 text-left transition-colors',
                  active ? 'bg-ink-700' : 'bg-ink-850 hover:bg-ink-700',
                  sel === k && active ? 'border-bone' : active ? 'border-ink-400' : 'border-ink-600 hover:border-ink-400',
                )}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Icon size={14} className={active ? 'text-caution' : 'text-steel-300 group-hover:text-bone'} aria-hidden />
                    <span className={cn('truncate text-[13.5px] font-semibold leading-none', active ? 'text-bone' : 'text-steel-200')}>{m.label}</span>
                  </span>
                  {active && <span className="mono text-[10px] text-caution">{Math.round(r.current * 100)}%</span>}
                </span>
                <span className="relative h-[3px] w-full overflow-hidden rounded-full bg-ink-600">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
                    style={{ width: `${r.current * 100}%`, background: `color-mix(in oklab, var(--warning), var(--critical) ${Math.round(r.current * 100)}%)` }}
                  />
                  {Math.abs(r.target - r.current) > 0.01 && <span className="absolute inset-y-0 w-px bg-bone" style={{ left: `${r.target * 100}%` }} />}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink-600/70 px-3.5 py-2.5">
          <div className="flex min-w-[220px] flex-1 items-center gap-3">
            <label htmlFor="sev" className="label shrink-0">
              Severity · {FAULT_META[sel].label}
            </label>
            <input
              id="sev"
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(selRow.target * 100)}
              className="fader"
              style={{ '--p': `${selRow.target * 100}%`, '--fc': 'var(--warning)' } as React.CSSProperties}
              onPointerDown={() => (dragFrom.current = selRow.target)}
              onKeyDown={() => (dragFrom.current = selRow.target)}
              onChange={(e) => store.setFault(sel, Number(e.target.value) / 100, gradualSec, true)}
              onPointerUp={() => store.noteInjection(sel, dragFrom.current, row(sel).target, gradualSec)}
              onKeyUp={() => store.noteInjection(sel, dragFrom.current, row(sel).target, gradualSec)}
            />
            <span className="readout w-[44px] text-right text-[18px]">{Math.round(selRow.target * 100)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="label">Onset</span>
            <Segmented
              label="Fault onset"
              value={gradual ? 'gradual' : 'sudden'}
              onChange={(v) => setGradual(v === 'gradual')}
              options={[
                { value: 'sudden', label: 'Sudden' },
                { value: 'gradual', label: 'Gradual' },
              ]}
            />
            {gradual && (
              <Segmented
                label="Build-up time"
                size="md"
                value={dur}
                onChange={setDur}
                options={[
                  { value: 20, label: '20 s' },
                  { value: 45, label: '45 s' },
                  { value: 90, label: '90 s' },
                ]}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
