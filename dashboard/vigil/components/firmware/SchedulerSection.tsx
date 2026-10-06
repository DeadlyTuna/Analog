'use client'

import { useState } from 'react'
import { Segmented } from '@vigil/components/ui/Segmented'
import { useSnap, useStore } from '@vigil/components/sim/SimProvider'
import { CLOCK_OPTIONS, STRESS_SPEC } from '@vigil/lib/sim/config'
import { C, TASK_COLOR, rgba, tint } from '@vigil/lib/theme'
import { cn, fmt } from '@vigil/lib/utils'
import { Gantt } from './Gantt'

const STATE_STYLE = {
  RUNNING: { c: C.go, label: 'running' },
  READY: { c: C.caution, label: 'ready' },
  BLOCKED: { c: C.steel3, label: 'blocked' },
} as const

export function SchedulerSection() {
  const store = useStore()
  const [win, setWin] = useState(250)
  const clock = useSnap((s) => s.cfg.clockMHz)
  const stress = useSnap((s) => s.cfg.stressLoad)
  const tasks = useSnap((s) => s.rtos.tasks)
  const cpu = useSnap((s) => s.rtos.cpuLoad)
  const isr = useSnap((s) => s.rtos.isrLoad)
  const ctx = useSnap((s) => s.rtos.ctxSwitches)
  const pre = useSnap((s) => s.rtos.preemptions)
  const boots = useSnap((s) => s.rtos.bootCount)

  const stressNote =
    stress >= 0.92
      ? 'HEALTH is starved, so the watchdog is resetting the MCU.'
      : stress >= 0.88
        ? 'HEALTH now misses its deadline; COMM is barely running.'
        : stress >= 0.5
          ? 'Low-priority tasks are slowing down. Acquisition, DSP and detection are untouched.'
          : 'Add a rogue workload and watch priorities protect the important tasks.'

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-3.5" role="group" aria-label="Scheduler experiments">
        <div className="flex items-center gap-3">
          <span className="label">Core clock</span>
          <Segmented label="Core clock" value={clock} onChange={(v) => store.setConfig({ clockMHz: v })} options={CLOCK_OPTIONS.map((c) => ({ value: c, label: `${c} MHz` }))} />
        </div>
        <div className="flex min-w-[260px] flex-1 items-center gap-3">
          <label htmlFor="stress" className="label shrink-0 !text-stop">
            CPU stress
          </label>
          <input
            id="stress"
            type="range"
            min={0}
            max={98}
            step={1}
            value={Math.round(stress * 100)}
            className="fader"
            style={{ '--p': `${(stress / 0.98) * 100}%`, '--fc': C.stop } as React.CSSProperties}
            onChange={(e) => store.setConfig({ stressLoad: Number(e.target.value) / 100 })}
          />
          <span className="readout w-[48px] text-right text-[18px]">{Math.round(stress * 100)}%</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="label">Trace window</span>
          <Segmented
            label="Trace window"
            value={win}
            onChange={setWin}
            options={[
              { value: 100, label: '100 ms' },
              { value: 250, label: '250 ms' },
              { value: 500, label: '500 ms' },
              { value: 1000, label: '1 s' },
            ]}
          />
        </div>
        <p className="w-full text-[13.5px] leading-snug text-steel-300">
          <span className={cn(stress >= 0.88 ? 'text-stop' : 'text-steel-200')}>{stressNote}</span>
          {boots > 1 && <span className="mono ml-3 text-stop">MCU has rebooted {boots - 1}×</span>}
        </p>
      </div>

      <section className="panel">
        <div className="panel-head">
          <span className="label">Scheduler trace · {win} ms</span>
          <span className="mono text-[11px] text-steel-200">
            {ctx.toLocaleString('en-US')} context switches · {pre.toLocaleString('en-US')} preemptions
          </span>
        </div>
        <div className="p-2.5">
          <div className="screen h-[290px]">
            <Gantt windowMs={win} />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1">
            <span className="mono text-[10.5px] text-steel-300">
              A lane lights up when its task owns the CPU. A short bar in a lower lane that stops and restarts has been <span className="text-bone">preempted</span> by a higher-priority task.
            </span>
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="panel-head">
          <span className="label">Tasks</span>
          <div className="flex w-[min(360px,55%)] items-center gap-3">
            <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-ink-600" title={`CPU ${fmt(cpu * 100, 1)} %`}>
              {tasks.map((t) => (
                <span key={t.id} style={{ width: `${Math.min(100, t.load * 100)}%`, background: TASK_COLOR[t.id] }} />
              ))}
              <span style={{ width: `${isr * 100}%`, background: C.forecast }} />
            </div>
            <span className="mono shrink-0 text-[11px] text-bone">CPU {fmt(cpu * 100, 1)} %</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left [&_td]:whitespace-nowrap">
            <thead>
              <tr className="border-b border-ink-600/70">
                {['Prio', 'Task', 'Released by', 'Period', 'Exec time', 'State', 'CPU', 'Response avg / max', 'Deadline', 'Missed', 'Stack'].map((h, i) => (
                  <th key={h} scope="col" className={cn('label px-3 py-2.5 font-medium', i >= 3 && i !== 5 && 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const st = STATE_STYLE[t.state]
                const slack = t.respMax / t.deadlineMs
                return (
                  <tr key={t.id} className="border-b border-ink-700/70 last:border-0">
                    <td className="px-3 py-3">
                      <span className="stencil text-[28px] leading-none" style={{ color: tint(TASK_COLOR[t.id]) }}>
                        {t.prio}
                      </span>
                    </td>
                    <th scope="row" className="px-3 py-3 font-normal">
                      <p className="text-[15px] font-semibold text-bone">{t.name}</p>
                      <p className="mono text-[10px] tracking-[0.08em] text-steel-300">{t.id === STRESS_SPEC.id ? 'injected' : t.id}</p>
                    </th>
                    <td className="px-3 py-3 text-[13.5px] text-steel-200">{t.trigger}</td>
                    <td className="mono px-3 py-3 text-right text-[12px] text-steel-200">{t.periodMs} ms</td>
                    <td className="mono px-3 py-3 text-right text-[12px] text-steel-200">{fmt(t.wcetMs, 2)} ms</td>
                    <td className="px-3 py-3">
                      <span className="mono inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: st.c, background: rgba(st.c, 0.09) }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.c }} />
                        {st.label}
                      </span>
                    </td>
                    <td className="mono px-3 py-3 text-right text-[12px] text-bone">{fmt(t.load * 100, 1)} %</td>
                    <td className="px-3 py-3 text-right">
                      <p className="mono text-[12px] text-bone">
                        {fmt(t.respAvg, 2)} / {fmt(t.respMax, 2)} ms
                      </p>
                      <div className="ml-auto mt-1.5 h-[3px] w-24 overflow-hidden rounded-full bg-ink-600" title={`worst case uses ${fmt(slack * 100, 0)} % of the deadline`}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, slack * 100)}%`, background: slack > 1 ? C.stop : slack > 0.6 ? C.caution : C.go }} />
                      </div>
                    </td>
                    <td className="mono px-3 py-3 text-right text-[12px] text-steel-200">{t.deadlineMs} ms</td>
                    <td className={cn('mono px-3 py-3 text-right text-[12px]', t.misses ? 'text-stop' : 'text-steel-200')}>{t.misses}</td>
                    <td className="mono px-3 py-3 text-right text-[12px] text-steel-200">
                      {t.stackUsed}/{t.stackWords}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-ink-600/70 px-4 py-3 text-[13.5px] leading-snug text-steel-300">
          Priority 6 beats priority 1. A task only runs when nothing more important is ready, so when the CPU is overloaded the cheap, urgent work (sampling) is protected and the slow, patient work (logging, telemetry) waits.
        </p>
      </section>
    </div>
  )
}
