'use client'

import { useRef } from 'react'
import { useCanvasLoop } from '@vigil/components/scopes/useCanvasLoop'
import { shallowEqual, useSnap, useStore } from '@vigil/components/sim/SimProvider'
import { C, TASK_COLOR, mono, paint, resolve, rgba, tint } from '@vigil/lib/theme'
import { cn, fmt } from '@vigil/lib/utils'

/** Jitter plot: every recent job's response time as a tick on a log axis, with the task deadline marked. */
function RespScatter() {
  const store = useStore()
  const buf = useRef(new Float32Array(160))
  const ref = useCanvasLoop((ctx, w, h) => {
    const tasks = store.sim.fw.rtos.tasks.filter((t) => t.def.id !== 'STRESS')
    const labelW = 52
    const axisH = 18
    const pw = w - labelW - 10
    const rowH = (h - axisH) / tasks.length
    const lo = Math.log10(0.1)
    const hi = Math.log10(3000)
    const x = (ms: number) => labelW + ((Math.log10(Math.max(0.1, ms)) - lo) / (hi - lo)) * pw
    ctx.clearRect(0, 0, w, h)
    ctx.font = `500 8.5px ${mono()}`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'center'
    for (const v of [0.1, 1, 10, 100, 1000]) {
      const xx = Math.round(x(v)) + 0.5
      ctx.strokeStyle = paint(C.bone, 0.08)
      ctx.beginPath()
      ctx.moveTo(xx, 0)
      ctx.lineTo(xx, h - axisH)
      ctx.stroke()
      ctx.fillStyle = paint(C.steel3, 0.9)
      ctx.fillText(v >= 1 ? `${v} ms` : `${v}`, xx, h - axisH + 4)
    }
    tasks.forEach((t, i) => {
      const y = i * rowH
      const spec = TASK_COLOR[t.def.id] ?? C.bone
      ctx.fillStyle = resolve(spec)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.font = `600 10px ${mono()}`
      ctx.fillText(t.def.id, 8, y + rowH / 2)
      const n = t.resp.readLast(160, buf.current)
      ctx.fillStyle = paint(spec, 0.35)
      for (let k = 0; k < n; k++) ctx.fillRect(Math.round(x(buf.current[k])), y + rowH * 0.28, 2, rowH * 0.44)
      // deadline
      const dx = Math.round(x(t.def.deadlineMs)) + 0.5
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = paint(C.stop, 0.85)
      ctx.beginPath()
      ctx.moveTo(dx, y + 3)
      ctx.lineTo(dx, y + rowH - 3)
      ctx.stroke()
      ctx.setLineDash([])
      if (t.stats.jobs > 0) {
        const ax = Math.round(x(t.stats.respSum / t.stats.jobs))
        ctx.fillStyle = resolve(C.bone)
        ctx.fillRect(ax - 1, y + rowH * 0.18, 2.5, rowH * 0.64)
      }
    })
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillStyle = paint(C.stop, 0.9)
    ctx.font = `500 8.5px ${mono()}`
    ctx.fillText('┆ deadline', w - 4, 3)
  }, 15)
  return <canvas ref={ref} className="block h-full w-full" />
}


export function LatencySection() {
  const detect = useSnap((s) => s.detect, shallowEqual)
  const cfg = useSnap((s) => s.cfg, shallowEqual)
  const dsp = useSnap((s) => s.rtos.tasks.find((t) => t.id === 'DSP')?.respAvg ?? 0)
  const tasks = useSnap((s) => s.rtos.tasks.filter((t) => t.id !== 'STRESS'))
  const sum = useSnap((s) => s.summary, shallowEqual)

  const chain = [
    { k: 'Wait for the next DMA half-buffer', ms: 25, c: C.vib },
    { k: 'Window fills with fault data', ms: 200, c: C.cur },
    { k: 'DSP computes features', ms: dsp, c: C.cur },
    { k: 'Smoothing over two windows', ms: 100, c: C.rpm },
    { k: `Debounce: ${cfg.warnDebounce} agreeing cycles`, ms: cfg.warnDebounce * 100, c: C.caution },
  ]
  const total = chain.reduce((a, c) => a + c.ms, 0)
  const measured = detect?.mode === 'instant' && detect.ms != null ? detect.ms : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="panel lg:col-span-8">
          <div className="panel-head">
            <span className="label">From fault to alarm · worst-case budget</span>
            <span className="mono text-[11px] text-steel-200">
              {fmt(total, 0)} ms {total < 1000 ? '< 1 s requirement' : '> 1 s requirement'}
            </span>
          </div>
          <div className="p-4">
            <div className="flex h-9 overflow-hidden rounded-md bg-ink-700">
              {chain.map((c) => (
                <div key={c.k} title={`${c.k}: ${fmt(c.ms, 0)} ms`} className="grid place-items-center border-r border-ink-900/60 last:border-0" style={{ width: `${(c.ms / total) * 100}%`, background: c.c }}>
                  <span className="mono text-[10px] font-medium text-ink-950">{c.ms >= 40 ? `${fmt(c.ms, 0)}` : ''}</span>
                </div>
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {chain.map((c) => (
                <li key={c.k} className="flex items-center gap-2.5 text-[14px] text-steel-200">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: c.c }} />
                  <span className="flex-1 truncate">{c.k}</span>
                  <span className="mono text-[11px] text-bone">{fmt(c.ms, c.ms < 10 ? 1 : 0)} ms</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[13.5px] leading-snug text-steel-300 text-pretty">
              This is the ceiling. A big fault crosses its limit well before the window is full, so real detections land sooner. Lower the debounce count on the previous section and the budget shrinks with it.
            </p>
          </div>
        </section>

        <section className="panel lg:col-span-4">
          <div className="panel-head">
            <span className="label">Measured on the last fault</span>
          </div>
          <div className="p-4">
            <p className="readout text-[44px]" style={{ color: measured != null ? C.go : C.steel3 }}>
              {measured != null ? `${fmt(measured / 1000, 2)} s` : '—'}
            </p>
            <p className="mt-2 text-[14px] leading-snug text-steel-200 text-pretty">
              {measured != null
                ? 'from the moment the fault was injected to the first non-healthy state.'
                : detect?.mode === 'gradual'
                  ? `Gradual fault: caught at ${fmt((detect.severityAtDetect ?? 0) * 100, 0)} % severity.`
                  : 'Inject a sudden fault in the control room to measure the response.'}
            </p>
            <dl className="mono mt-4 space-y-1.5 border-t border-ink-600/70 pt-3 text-[11px]">
              <div className="flex justify-between">
                <dt className="text-steel-300">Warned before critical</dt>
                <dd className="text-bone">{sum.warnLeadSec != null ? `${fmt(sum.warnLeadSec, 1)} s` : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-steel-300">Forecast before critical</dt>
                <dd className="text-forecast">{sum.predLeadSec != null ? `${fmt(sum.predLeadSec, 1)} s` : '—'}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="panel lg:col-span-8">
          <div className="panel-head">
            <span className="label">Task response times · last 160 jobs each</span>
            <span className="mono text-[11px] text-steel-200">log scale · white bar = average</span>
          </div>
          <div className="p-2.5">
            <div className="screen h-[210px]">
              <RespScatter />
            </div>
          </div>
        </section>

        <section className="panel lg:col-span-4">
          <div className="panel-head">
            <span className="label">Deadline slack</span>
          </div>
          <ul className="space-y-3.5 p-4">
            {tasks.map((t) => {
              const used = t.respMax / t.deadlineMs
              const col = used > 1 ? C.stop : used > 0.6 ? C.caution : C.go
              return (
                <li key={t.id}>
                  <div className="flex items-baseline justify-between">
                    <span className="mono text-[11px] font-medium" style={{ color: tint(TASK_COLOR[t.id]) }}>
                      {t.id}
                    </span>
                    <span className={cn('mono text-[11px]', used > 1 ? 'text-stop' : 'text-steel-200')}>
                      worst {fmt(t.respMax, 2)} of {t.deadlineMs} ms
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-600">
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, used * 100)}%`, background: col }} />
                  </div>
                </li>
              )
            })}
            <li className="text-[13px] leading-snug text-steel-300">Every bar should stay short. Raise the CPU stress on the scheduler section and watch the two lowest-priority bars fill first.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
