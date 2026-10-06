'use client'

import { useRef } from 'react'
import { useStore } from '@vigil/components/sim/SimProvider'
import { TREND_LEN } from '@vigil/lib/sim/firmware'
import { paint, resolve, rgba } from '@vigil/lib/theme'
import { cn } from '@vigil/lib/utils'
import { useCanvasLoop } from './useCanvasLoop'

interface Props {
  series: 'temp' | 'vib' | 'cur' | 'rpm' | 'hi'
  color: string
  /** seconds of history (max 120) */
  seconds?: number
  className?: string
}

/** Tiny axis-less trace of the last few seconds, auto-scaled to its own min/max. */
export function Sparkline({ series, color, seconds = 30, className }: Props) {
  const store = useStore()
  const buf = useRef(new Float32Array(TREND_LEN))
  const lo = useRef<number | null>(null)
  const hi = useRef<number | null>(null)

  const ref = useCanvasLoop((ctx, w, h) => {
    const ring = store.sim.fw.trend[series]
    const want = Math.min(TREND_LEN, seconds * 10)
    const n = ring.readLast(want, buf.current)
    ctx.clearRect(0, 0, w, h)
    if (n < 3) return
    const b = buf.current
    let mn = Infinity
    let mx = -Infinity
    for (let i = 0; i < n; i++) {
      if (b[i] < mn) mn = b[i]
      if (b[i] > mx) mx = b[i]
    }
    const pad = Math.max((mx - mn) * 0.25, Math.abs(mx) * 0.01 + 1e-6)
    mn -= pad
    mx += pad
    lo.current = lo.current == null ? mn : lo.current + (mn - lo.current) * 0.1
    hi.current = hi.current == null ? mx : hi.current + (mx - hi.current) * 0.1
    const a = lo.current
    const z = hi.current
    const x = (i: number) => w - ((n - 1 - i) / (want - 1)) * w
    const y = (v: number) => h - 2 - ((v - a) / (z - a || 1)) * (h - 4)

    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, paint(color, 0.25))
    g.addColorStop(1, paint(color, 0))
    ctx.beginPath()
    ctx.moveTo(x(0), h)
    for (let i = 0; i < n; i++) ctx.lineTo(x(i), y(b[i]))
    ctx.lineTo(x(n - 1), h)
    ctx.closePath()
    ctx.fillStyle = g
    ctx.fill()

    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(x(i), y(b[i]))
      else ctx.lineTo(x(i), y(b[i]))
    }
    ctx.strokeStyle = resolve(color)
    ctx.lineWidth = 1.4
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x(n - 1) - 1, y(b[n - 1]), 2.2, 0, Math.PI * 2)
    ctx.fillStyle = resolve(color)
    ctx.fill()
  }, 20)

  return <canvas ref={ref} className={cn('block h-full w-full', className)} />
}
