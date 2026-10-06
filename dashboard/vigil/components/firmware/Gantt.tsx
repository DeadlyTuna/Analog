'use client'

import { useCanvasLoop } from '@vigil/components/scopes/useCanvasLoop'
import { useStore } from '@vigil/components/sim/SimProvider'
import { ISR_LANE } from '@vigil/lib/sim/rtos'
import { C, TASK_COLOR, mono, paint, resolve, rgba } from '@vigil/lib/theme'

// scheduler lane index → display
const LANES = [
  { lane: ISR_LANE, label: 'ISR', sub: '', color: C.forecast },
  { lane: 0, label: 'ACQ', sub: 'P6', color: TASK_COLOR.ACQ },
  { lane: 1, label: 'DSP', sub: 'P5', color: TASK_COLOR.DSP },
  { lane: 2, label: 'FDT', sub: 'P4', color: TASK_COLOR.FDT },
  { lane: 5, label: 'STRESS', sub: 'P3', color: TASK_COLOR.STRESS },
  { lane: 3, label: 'HLTH', sub: 'P2', color: TASK_COLOR.HLTH },
  { lane: 4, label: 'COMM', sub: 'P1', color: TASK_COLOR.COMM },
]

/** Scheduler trace in the style of a logic analyser / SystemView: one lane per task, newest at the right. */
export function Gantt({ windowMs }: { windowMs: number }) {
  const store = useStore()
  const ref = useCanvasLoop((ctx, w, h) => {
    const rt = store.sim.fw.rtos
    const stress = store.getSnapshot().cfg.stressLoad > 0
    const lanes = LANES.filter((l) => l.lane !== 5 || stress)
    const labelW = 62
    const axisH = 18
    const pw = w - labelW - 6
    const laneH = (h - axisH) / lanes.length
    const t1 = rt.now
    const t0 = t1 - windowMs
    const x = (t: number) => labelW + ((t - t0) / windowMs) * pw
    ctx.clearRect(0, 0, w, h)

    // lane backgrounds + labels
    ctx.font = `600 10px ${mono()}`
    ctx.textBaseline = 'middle'
    lanes.forEach((l, i) => {
      const y = i * laneH
      if (i % 2 === 0) {
        ctx.fillStyle = paint(C.bone, 0.025)
        ctx.fillRect(0, y, w, laneH)
      }
      ctx.fillStyle = resolve(l.color)
      ctx.textAlign = 'left'
      ctx.fillText(l.label, 8, y + laneH / 2 - 0.5)
      if (l.sub) {
        ctx.fillStyle = paint(C.steel3, 0.8)
        ctx.font = `500 8.5px ${mono()}`
        ctx.fillText(l.sub, 8 + ctx.measureText(l.label).width + 5, y + laneH / 2 + 0.5)
        ctx.font = `600 10px ${mono()}`
      }
    })

    // time grid
    const step = windowMs <= 120 ? 10 : windowMs <= 300 ? 25 : windowMs <= 600 ? 50 : 100
    const first = Math.ceil(t0 / step) * step
    ctx.font = `500 8.5px ${mono()}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let t = first; t <= t1; t += step) {
      const xx = Math.round(x(t)) + 0.5
      ctx.strokeStyle = paint(C.bone, t % (step * 5) === 0 ? 0.12 : 0.05)
      ctx.beginPath()
      ctx.moveTo(xx, 0)
      ctx.lineTo(xx, h - axisH)
      ctx.stroke()
      ctx.fillStyle = paint(C.steel3, 0.85)
      ctx.fillText(`${Math.round((t - t1) / 5) * 5}`, xx, h - axisH + 4)
    }
    ctx.textAlign = 'right'
    ctx.fillText('ms', w - 4, h - axisH + 4)

    // 1 kHz tick marks when zoomed in
    if (windowMs <= 250) {
      ctx.strokeStyle = paint(C.forecast, 0.22)
      const t00 = Math.ceil(t0)
      for (let t = t00; t <= t1; t++) {
        const xx = Math.round(x(t)) + 0.5
        ctx.beginPath()
        ctx.moveTo(xx, h - axisH - 4)
        ctx.lineTo(xx, h - axisH)
        ctx.stroke()
      }
    }

    // segments
    const idx = new Map(lanes.map((l, i) => [l.lane, i]))
    rt.segs.forEach(t0 - 1, (a, b, lane) => {
      const i = idx.get(lane)
      if (i === undefined || b < t0 || a > t1) return
      const xa = Math.max(labelW, x(a))
      const xb = Math.min(labelW + pw, x(b))
      const wd = Math.max(1.5, xb - xa)
      const y = i * laneH + 3
      const hh = laneH - 6
      const col = lanes[i].color
      ctx.fillStyle = paint(col, lane === ISR_LANE ? 0.95 : 0.88)
      ctx.fillRect(xa, y, wd, hh)
      ctx.fillStyle = 'rgba(255,255,255,0.28)'
      ctx.fillRect(xa, y, wd, 1.5)
    })

    // now marker
    ctx.strokeStyle = resolve(C.bone)
    ctx.lineWidth = 1.2
    const nx = labelW + pw
    ctx.beginPath()
    ctx.moveTo(nx + 0.5, 0)
    ctx.lineTo(nx + 0.5, h - axisH)
    ctx.stroke()
    ctx.lineWidth = 1
  }, 30)

  return <canvas ref={ref} className="block h-full w-full" />
}
