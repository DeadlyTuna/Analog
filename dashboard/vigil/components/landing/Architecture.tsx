'use client'

import { Pipeline } from '@vigil/components/diagnosis/Pipeline'
import { useSnap } from '@vigil/components/sim/SimProvider'
import { TASK_SPECS } from '@vigil/lib/sim/config'
import { fmt } from '@vigil/lib/utils'
import { Reveal } from './Reveal'

function Layer({ tag, title, children }: { tag: string; title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <p className="label">{tag}</p>
      <h3 className="display mt-1.5 text-[30px] text-bone">{title}</h3>
      <p className="mt-2 max-w-[62ch] text-[16px] leading-snug text-steel-200 text-pretty">{children}</p>
    </section>
  )
}

function Tasks() {
  const rows = useSnap((s) => s.rtos.tasks)
  const load = (id: string) => rows.find((r) => r.id === id)?.load ?? 0
  return (
    <section className="panel overflow-hidden">
      <div className="panel-head">
        <span className="label">Five tasks, one CPU</span>
        <span className="label hidden sm:inline">higher priority number wins</span>
      </div>
      <ul>
        {TASK_SPECS.map((t) => (
          <li key={t.id} className="grid grid-cols-[44px_1fr_86px] items-center gap-4 border-b border-ink-700/70 px-4 py-3 last:border-0">
            <span className="stencil text-[40px] leading-none" style={{ color: t.color }} aria-label={`priority ${t.prio}`}>
              {t.prio}
            </span>
            <div className="min-w-0">
              <p className="text-[16px] font-semibold text-bone">
                {t.name} <span className="mono ml-1 text-[10px] font-medium tracking-[0.1em] text-steel-300">{t.id}</span>
              </p>
              <p className="mt-0.5 text-[13.5px] leading-snug text-steel-300">{t.blurb}</p>
              <p className="mono mt-1 text-[10.5px] text-steel-300">
                released by {t.trigger} · deadline {t.deadlineMs} ms
              </p>
            </div>
            <div>
              <p className="readout text-right text-[18px]">{fmt(load(t.id) * 100, 1)}%</p>
              <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-ink-600">
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, load(t.id) * 100 * 4)}%`, background: t.color }} />
              </div>
              <p className="label mt-1 text-right !text-[9px]">cpu</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Architecture() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <Reveal className="lg:col-span-5">
        <Pipeline />
      </Reveal>
      <div className="space-y-4 lg:col-span-7">
        <Reveal>
          <Layer tag="Layer 1" title="The motor">
            A calibrated digital twin: a 1.5 kW, four-pole induction motor on a brake dynamometer. Load sets current, slip and heat. Faults change the physics, not just the numbers: bearing impacts ring a resonance, misalignment adds a 2× tone, blocked airflow lets the winding run away.
          </Layer>
        </Reveal>
        <Reveal delay={0.06}>
          <Layer tag="Layer 2" title="The firmware">
            Real code, not a script: a DMA-fed ADC chain, a preemptive priority scheduler, an FFT, a rule-based classifier and a CRC-protected protocol. It sees only ADC counts, exactly like a controller on a real bench, so noise and quantisation are part of the problem.
          </Layer>
        </Reveal>
        <Reveal delay={0.12}>
          <Tasks />
        </Reveal>
      </div>
    </div>
  )
}
