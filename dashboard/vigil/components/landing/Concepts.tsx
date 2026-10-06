'use client'

import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { shallowEqual, useSnap } from '@vigil/components/sim/SimProvider'
import { fmt } from '@vigil/lib/utils'
import { Reveal } from './Reveal'

export const CONCEPTS: { id: string; section: string; name: string; text: string }[] = [
  { id: 'acq', section: 'acquisition', name: 'Real-time data acquisition', text: 'Two channels sampled 2,560 times a second, paced by a timer and moved by DMA with no CPU involved.' },
  { id: 'isr', section: 'interrupts', name: 'Interrupts', text: 'DMA, tacho and UART interrupts steal a few microseconds, then hand the CPU straight back.' },
  { id: 'adc', section: 'acquisition', name: 'ADC', text: '12-bit, 3.3 V reference. One count is 2.4 mg of vibration, 20 mA of current, 0.8 °C of temperature.' },
  { id: 'tim', section: 'interrupts', name: 'Timers', text: 'TIM3 paces the ADC, TIM2 times every shaft revolution, SysTick ticks the RTOS at 1 kHz.' },
  { id: 'rtos', section: 'scheduler', name: 'RTOS', text: 'Five tasks on a preemptive, fixed-priority scheduler with queues and task notifications.' },
  { id: 'sched', section: 'scheduler', name: 'Task scheduling', text: 'Periodic and event-driven tasks. Every deadline is measured, not assumed.' },
  { id: 'prio', section: 'scheduler', name: 'Priority', text: 'Acquisition outranks analysis outranks housekeeping, so overload hurts the right thing first.' },
  { id: 'comm', section: 'comms', name: 'Communication protocols', text: 'A UART telemetry frame and a Modbus RTU register map, both CRC-16 protected.' },
  { id: 'dsp', section: 'dsp', name: 'Signal processing', text: 'Hann window, 512-point FFT, RMS, crest factor and kurtosis, every 100 ms.' },
  { id: 'fdt', section: 'detection', name: 'Fault detection', text: 'Limits, debounce and hysteresis feed a state machine. A classifier weighs the evidence.' },
  { id: 'mem', section: 'memory', name: 'Memory and logging', text: 'A 128 KB SRAM budget, stack high-water marks and a 256-entry flash event log.' },
  { id: 'resp', section: 'latency', name: 'Response time', text: 'Fault injection to alarm, measured on every run against the task deadlines.' },
]

export function Concepts() {
  const v = useSnap(
    (s) => ({
      adc: s.adc.vib,
      lat: s.rtos.isrs.find((i) => i.name === 'DMA1_Stream0')?.latencyUs ?? 0,
      tick: s.rtos.tick,
      ctx: s.rtos.ctxSwitches,
      miss: s.rtos.tasks.reduce((a, t) => a + t.misses, 0),
      cpu: s.rtos.cpuLoad,
      rx: s.host.rxOk,
      feats: s.rtos.featureCount,
      state: s.state,
      log: s.flash.writes,
      sram: s.mem.sramUsed / s.mem.sramTotal,
      detect: s.detect?.mode === 'instant' ? s.detect.ms : null,
      over: s.rtos.dmaOverruns,
    }),
    shallowEqual,
  )
  const live: Record<string, string> = {
    acq: `${v.over} samples lost`,
    isr: `DMA latency ${fmt(v.lat, 2)} µs`,
    adc: `last vib count ${v.adc}`,
    tim: `${v.tick.toLocaleString('en-US')} ticks`,
    rtos: `${v.ctx.toLocaleString('en-US')} context switches`,
    sched: `${v.miss} deadline misses`,
    prio: `CPU ${fmt(v.cpu * 100, 1)} %`,
    comm: `${v.rx} frames accepted`,
    dsp: `${v.feats.toLocaleString('en-US')} feature sets`,
    fdt: v.state === 'STARTUP' ? 'STARTING' : v.state,
    mem: `SRAM ${fmt(v.sram * 100, 0)} % used · ${v.log} log writes`,
    resp: v.detect != null ? `last fault caught in ${fmt(v.detect / 1000, 2)} s` : 'inject a fault to measure',
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {CONCEPTS.map((c, i) => (
        <Reveal key={c.id} delay={(i % 4) * 0.05}>
          <Link
            href={`/vigil/firmware#${c.section}`}
            className="panel spot group flex h-full flex-col p-4 transition-colors hover:border-ink-400"
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
              e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="display text-[26px] leading-[0.95] text-bone">{c.name}</h3>
              <ArrowUpRight size={18} className="mt-1 shrink-0 text-steel-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-bone" aria-hidden />
            </div>
            <p className="mt-2.5 flex-1 text-[15px] leading-snug text-steel-200 text-pretty">{c.text}</p>
            <p className="mono mt-4 flex items-center gap-2 border-t border-ink-600/70 pt-3 text-[11px] text-bone">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--state)]" style={{ boxShadow: '0 0 8px var(--state)' }} />
              {live[c.id]}
            </p>
          </Link>
        </Reveal>
      ))}
    </div>
  )
}
