'use client'

import { useSnap } from '@vigil/components/sim/SimProvider'
import { C } from '@vigil/lib/theme'
import { clock, cn, fmt } from '@vigil/lib/utils'

export function InterruptSection() {
  const isrs = useSnap((s) => s.rtos.isrs)
  const up = useSnap((s) => Math.max(1, s.rtos.uptimeMs) / 1000)
  const tick = useSnap((s) => s.rtos.tick)
  const adc = useSnap((s) => s.rtos.adcCount)
  const pulses = useSnap((s) => s.rtos.pulseCount)
  const rpm = useSnap((s) => s.meas.rpm)
  const wdg = useSnap((s) => s.rtos.wdgRemainMs)
  const wdgT = useSnap((s) => s.rtos.wdgTimeoutMs)
  const boots = useSnap((s) => s.rtos.bootCount)
  const reason = useSnap((s) => s.rtos.resetReason)
  const upMs = useSnap((s) => s.rtos.uptimeMs)
  const isrLoad = useSnap((s) => s.rtos.isrLoad)
  const period = useSnap((s) => (s.meas.rpm > 0 ? 6e7 / s.meas.rpm : 0))

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <section className="panel overflow-hidden lg:col-span-8">
        <div className="panel-head">
          <span className="label">Interrupt vector table (in use)</span>
          <span className="mono text-[11px] text-steel-200">ISR time {fmt(isrLoad * 100, 2)} % of CPU</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-ink-600/70">
                {['', 'Vector', 'Source', 'NVIC prio', 'Rate', 'Count', 'Latency', 'Worst', 'Cost'].map((h, i) => (
                  <th key={i} scope="col" className={cn('label px-3 py-2.5 font-medium', i >= 3 && 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isrs.map((i) => {
                const hot = i.lastAgoMs >= 0 && i.lastAgoMs < 120
                return (
                  <tr key={i.name} className="border-b border-ink-700/70 last:border-0">
                    <td className="w-8 px-3 py-3">
                      <span className={cn('lamp lamp-b', hot && 'on')} />
                    </td>
                    <th scope="row" className="mono px-3 py-3 text-[12px] font-medium text-bone">
                      {i.name}
                    </th>
                    <td className="px-3 py-3 text-[14px] text-steel-200">{i.source}</td>
                    <td className="mono px-3 py-3 text-right text-[12px] text-steel-200">{i.nvic}</td>
                    <td className="mono px-3 py-3 text-right text-[12px] text-bone">{fmt(i.count / up, i.count / up > 100 ? 0 : 1)} Hz</td>
                    <td className="mono px-3 py-3 text-right text-[12px] text-steel-200">{i.count.toLocaleString('en-US')}</td>
                    <td className="mono px-3 py-3 text-right text-[12px] text-bone">{fmt(i.latencyUs, 1)} µs</td>
                    <td className="mono px-3 py-3 text-right text-[12px] text-steel-200">{fmt(i.maxLatencyUs, 1)} µs</td>
                    <td className="mono px-3 py-3 text-right text-[12px] text-steel-200">{fmt(i.costUs, 1)} µs</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-ink-600/70 px-4 py-3 text-[13.5px] leading-snug text-steel-300">
          Latency is the delay between the event and the first ISR instruction. It grows when a higher-priority interrupt is already running — watch SysTick wait behind the DMA interrupt every 25 ms.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:col-span-4 lg:grid-cols-1">
        <section className="panel p-4">
          <p className="label">TIM3 · ADC trigger</p>
          <p className="readout mt-2 text-[28px]">2,560 Hz</p>
          <p className="mono mt-1.5 text-[11px] text-steel-300">{adc.toLocaleString('en-US')} update events · hardware only</p>
        </section>
        <section className="panel p-4">
          <p className="label">TIM2 · input capture (1 MHz)</p>
          <p className="readout mt-2 text-[28px]">{period ? fmt(period / 1000, 2) : '—'} ms</p>
          <p className="mono mt-1.5 text-[11px] text-steel-300">
            {pulses.toLocaleString('en-US')} pulses · {fmt(rpm, 0)} rpm
          </p>
        </section>
        <section className="panel p-4">
          <p className="label">SysTick · RTOS tick</p>
          <p className="readout mt-2 text-[28px]">{tick.toLocaleString('en-US')}</p>
          <p className="mono mt-1.5 text-[11px] text-steel-300">1 kHz · uptime {clock(upMs)}</p>
        </section>
        <section className="panel p-4">
          <p className="label">IWDG · independent watchdog</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="readout text-[28px]" style={{ color: wdg < 700 ? C.stop : C.bone }}>
              {fmt(wdg / 1000, 2)} s
            </p>
            <span className="mono text-[11px] text-steel-300">of {fmt(wdgT / 1000, 0)} s</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-600">
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(wdg / wdgT) * 100}%`, background: wdg < 700 ? C.stop : C.go }} />
          </div>
          <p className="mono mt-2 text-[11px] text-steel-300">
            boot #{boots} · last reset: {reason}
          </p>
          <p className="mt-2 text-[13px] leading-snug text-steel-300">The HEALTH task kicks it every 500 ms. Starve that task and the MCU reboots.</p>
        </section>
      </div>
    </div>
  )
}
