'use client'

import { useRef } from 'react'
import { useStore } from '@vigil/components/sim/SimProvider'
import { ADC_DT_MS } from '@vigil/lib/sim/config'
import { C, mono, paint, resolve, rgba } from '@vigil/lib/theme'
import { cn } from '@vigil/lib/utils'
import { graticule, useCanvasLoop } from './useCanvasLoop'

interface Props {
  channel: 'vib' | 'cur'
  className?: string
}

/**
 * Time-domain oscilloscope fed by the MCU's own sample buffer (post-ADC, post-calibration).
 * Vibration is triggered once per revolution by the tacho pulse (a "keyphasor"), so the 1× component
 * holds still while bearing impacts drift across the screen. Current triggers on a rising zero crossing.
 */
export function Scope({ channel, className }: Props) {
  const store = useStore()
  const vib = channel === 'vib'
  const win = vib ? 1024 : 256
  const extra = vib ? 280 : 140
  const buf = useRef(new Float32Array(2560))
  const yMax = useRef(vib ? 0.8 : 9)
  const color = vib ? C.vib : C.cur
  const unit = vib ? 'g' : 'A'

  const ref = useCanvasLoop((ctx, w, h) => {
    const fw = store.sim.fw
    const ring = vib ? fw.vibEu : fw.curEu
    const b = buf.current
    const m = ring.readLast(win + extra, b)
    ctx.clearRect(0, 0, w, h)
    graticule(ctx, w, h, 10, 6)

    let start = Math.max(0, m - win)
    let trig = false
    if (m >= win + 24) {
      if (vib) {
        const period = fw.tachoPeriodUs / 1000 / ADC_DT_MS
        if (fw.rpm > 200 && period > 20 && fw.lastPulseMs > 0) {
          const base = ring.total - m
          let a = fw.lastPulseMs / ADC_DT_MS
          const maxStart = ring.total - win
          if (a > maxStart) a -= Math.ceil((a - maxStart) / period) * period
          const off = Math.round(a - base)
          if (off >= 0 && off + win <= m) {
            start = off
            trig = true
          }
        }
      } else {
        for (let i = m - win; i > 0; i--) {
          if (b[i - 1] < 0 && b[i] >= 0) {
            start = i
            trig = true
            break
          }
        }
      }
    }
    const n = Math.min(win, m - start)
    if (n < 4) return

    // auto-range (slow attack, slower release)
    let peak = 0
    for (let i = 0; i < n; i++) {
      const a = Math.abs(b[start + i])
      if (a > peak) peak = a
    }
    const floor = vib ? 0.6 : 9
    const target = Math.max(floor, peak * 1.2)
    yMax.current += (target - yMax.current) * (target > yMax.current ? 0.3 : 0.04)
    const ym = yMax.current
    const mid = h / 2
    const sy = (v: number) => mid - (v / ym) * (h / 2 - 6)

    const px = Math.floor(w)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    const path = () => {
      ctx.beginPath()
      if (n > px * 1.4) {
        // peak-detect: keep every impact visible when there are more samples than pixels
        for (let x = 0; x < px; x++) {
          const i0 = start + Math.floor((x * n) / px)
          const i1 = Math.max(i0 + 1, start + Math.floor(((x + 1) * n) / px))
          let mn = Infinity
          let mx = -Infinity
          for (let i = i0; i < i1; i++) {
            const v = b[i]
            if (v < mn) mn = v
            if (v > mx) mx = v
          }
          if (x === 0) ctx.moveTo(x, sy(mn))
          else ctx.lineTo(x, sy(mn))
          ctx.lineTo(x + 0.5, sy(mx))
        }
      } else {
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * (w - 1)
          const y = sy(b[start + i])
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
      }
    }
    path()
    ctx.strokeStyle = paint(color, 0.2)
    ctx.lineWidth = 5
    ctx.stroke()
    path()
    ctx.strokeStyle = resolve(color)
    ctx.lineWidth = 1.4
    ctx.stroke()

    // labels
    ctx.font = `500 9.5px ${mono()}`
    ctx.fillStyle = paint(C.steel2, 0.75)
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(`+${ym.toFixed(vib ? 2 : 1)} ${unit}`, 6, 5)
    ctx.textBaseline = 'bottom'
    ctx.fillText(`−${ym.toFixed(vib ? 2 : 1)} ${unit}`, 6, h - 4)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    const ms = (n * ADC_DT_MS).toFixed(0)
    ctx.fillText(`${ms} ms · ${(n / 1).toFixed(0)} smp`, w - 6, 5)
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = trig ? paint(C.go, 0.9) : paint(C.steel2, 0.6)
    ctx.fillText(trig ? (vib ? 'TRIG ● tacho 1/rev' : 'TRIG ● zero-cross ↑') : 'TRIG ○ free-run', w - 6, h - 4)
  }, 60)

  return <canvas ref={ref} className={cn('block h-full w-full', className)} />
}
