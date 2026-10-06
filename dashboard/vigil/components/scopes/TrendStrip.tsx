'use client'

import { useRef } from 'react'
import { useStore } from '@vigil/components/sim/SimProvider'
import { TREND_LEN } from '@vigil/lib/sim/firmware'
import { C, MONO, rgba } from '@vigil/lib/theme'
import { cn } from '@vigil/lib/utils'
import { useCanvasLoop } from './useCanvasLoop'

type Key = 'temp' | 'vib' | 'cur' | 'rpm' | 'hi'

interface Props {
  series: Key
  color: string
  min: number
  max: number
  warn?: number
  crit?: number
  /** limits are "bad when low" (health index, speed) */
  invert?: boolean
  unit: string
  dp?: number
  className?: string
}

/** One strip of the trend recorder: last 2 minutes at 10 Hz, limit lines, and a dashed forecast. */
export function TrendStrip({ series, color, min, max, warn, crit, invert, unit, dp = 1, className }: Props) {
  const store = useStore()
  const buf = useRef(new Float32Array(TREND_LEN))

  const ref = useCanvasLoop((ctx, w, h) => {
    const ring = store.sim.fw.trend[series]
    const n = ring.readLast(TREND_LEN, buf.current)
    const b = buf.current
    ctx.clearRect(0, 0, w, h)
    const futureW = Math.round(w * 0.16)
    const pw = w - futureW
    const padT = 5
    const padB = 5
    const ph = h - padT - padB
    const yOf = (v: number) => padT + ph - ((v - min) / (max - min)) * ph

    // grid
    ctx.strokeStyle = 'rgba(235,232,222,0.05)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = Math.round(padT + (i / 4) * ph) + 0.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
    for (let i = 0; i <= 6; i++) {
      const x = Math.round((i / 6) * pw) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    // future region
    ctx.fillStyle = 'rgba(92,157,255,0.045)'
    ctx.fillRect(pw, 0, futureW, h)
    ctx.strokeStyle = 'rgba(92,157,255,0.35)'
    ctx.setLineDash([2, 3])
    ctx.beginPath()
    ctx.moveTo(pw + 0.5, 0)
    ctx.lineTo(pw + 0.5, h)
    ctx.stroke()
    ctx.setLineDash([])

    // limit lines
    const limit = (v: number | undefined, col: string, label: string) => {
      if (v == null || v < min || v > max) return
      const y = yOf(v)
      ctx.strokeStyle = rgba(col, 0.55)
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(w, y + 0.5)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.font = `500 8.5px ${MONO}`
      ctx.fillStyle = rgba(col, 0.9)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.fillText(label, 4, y - 2)
    }
    limit(warn, C.caution, invert ? 'WARN <' : 'WARN')
    limit(crit, C.stop, invert ? 'CRIT <' : 'CRIT')

    if (n < 3) return
    const xi = (i: number) => pw - ((n - 1 - i) / (TREND_LEN - 1)) * pw

    // fill
    const g = ctx.createLinearGradient(0, padT, 0, padT + ph)
    g.addColorStop(0, rgba(color, 0.28))
    g.addColorStop(1, rgba(color, 0))
    ctx.beginPath()
    ctx.moveTo(xi(0), padT + ph)
    for (let i = 0; i < n; i++) ctx.lineTo(xi(i), Math.max(padT - 2, Math.min(h, yOf(b[i]))))
    ctx.lineTo(xi(n - 1), padT + ph)
    ctx.closePath()
    ctx.fillStyle = g
    ctx.fill()

    const trace = () => {
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const x = xi(i)
        const y = Math.max(padT - 2, Math.min(h, yOf(b[i])))
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
    }
    trace()
    ctx.strokeStyle = rgba(color, 0.25)
    ctx.lineWidth = 4
    ctx.lineJoin = 'round'
    ctx.stroke()
    trace()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()

    // forecast: straight-line extrapolation of the last ~12 s (smoothed), drawn into the shaded future region
    const m = Math.min(n, 120)
    let sx = 0
    let sy = 0
    let sxx = 0
    let sxy = 0
    for (let i = 0; i < m; i++) {
      const t = i / 10
      const v = b[n - m + i]
      sx += t
      sy += v
      sxx += t * t
      sxy += t * v
    }
    const den = m * sxx - sx * sx
    const slope = den > 1e-9 ? (m * sxy - sx * sy) / den : 0
    const last = b[n - 1]
    const secPerPx = TREND_LEN / 10 / pw
    const horizon = futureW * secPerPx // seconds visible in the future strip
    const rel = Math.abs(slope * 30) / (max - min)
    // only draw a forecast while the firmware itself has raised one (a sudden step is an event, not a trend)
    const showForecast = rel > 0.02 && store.getSnapshot().health.predicting
    if (showForecast) {
      const smoothLast = sy / m + slope * ((m - 1) / 20)
      const yEnd = smoothLast + slope * horizon
      ctx.setLineDash([5, 4])
      ctx.strokeStyle = C.forecast
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(pw, Math.max(padT, Math.min(padT + ph, yOf(last))))
      ctx.lineTo(w - 1, Math.max(padT, Math.min(padT + ph, yOf(yEnd))))
      ctx.stroke()
      ctx.setLineDash([])
    }

    // live dot
    const ly = Math.max(padT, Math.min(padT + ph, yOf(last)))
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(pw - 1, ly, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = rgba(color, 0.4)
    ctx.beginPath()
    ctx.arc(pw - 1, ly, 6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.font = `500 9px ${MONO}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillStyle = rgba(C.bone, 0.9)
    ctx.fillText(`${last.toFixed(dp)} ${unit}`, w - 5, 4)
    if (showForecast) {
      ctx.fillStyle = C.forecast
      ctx.textBaseline = 'bottom'
      ctx.fillText('forecast', w - 5, h - 3)
    }
  }, 20)

  return <canvas ref={ref} className={cn('block h-full w-full', className)} />
}
