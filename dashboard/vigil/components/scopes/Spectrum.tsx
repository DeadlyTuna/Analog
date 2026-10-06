'use client'

import { useRef } from 'react'
import { useStore } from '@vigil/components/sim/SimProvider'
import { BIN_HZ, BPFO_RATIO, SPEC_BINS } from '@vigil/lib/sim/config'
import { C, mono, paint, resolve, rgba } from '@vigil/lib/theme'
import { cn } from '@vigil/lib/utils'
import { graticule, useCanvasLoop } from './useCanvasLoop'

interface Props {
  className?: string
  /** show only 0–320 Hz */
  zoom?: boolean
}

/** Amplitude spectrum of the vibration channel with the diagnostic frequencies marked. */
export function Spectrum({ className, zoom = false }: Props) {
  const store = useStore()
  const hold = useRef(new Float32Array(SPEC_BINS))
  const yMax = useRef(0.4)

  const ref = useCanvasLoop((ctx, w, h) => {
    const fw = store.sim.fw
    const snap = store.getSnapshot()
    const mag = fw.specV
    const nBins = zoom ? 64 : SPEC_BINS
    const padL = 34
    const padB = 16
    const pw = w - padL - 6
    const ph = h - padB - 6
    const top = 6
    ctx.clearRect(0, 0, w, h)
    ctx.save()
    ctx.translate(padL, top)
    graticule(ctx, pw, ph, zoom ? 8 : 8, 4, 0.9)
    ctx.restore()

    const hd = hold.current
    let mx = 0
    for (let k = 1; k < nBins; k++) {
      hd[k] = Math.max(mag[k], hd[k] * 0.992)
      if (mag[k] > mx) mx = mag[k]
    }
    const target = Math.max(0.3, mx * 1.2)
    yMax.current += (target - yMax.current) * (target > yMax.current ? 0.3 : 0.05)
    const ym = yMax.current
    // square-root amplitude scale: keeps the 1× peak and the faint bearing resonance on one screen
    const yOf = (v: number) => top + ph - Math.sqrt(Math.min(1, Math.max(0, v) / ym)) * ph
    const xOf = (k: number) => padL + (k / (nBins - 1)) * pw

    // y ticks
    ctx.font = `500 9px ${mono()}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = paint(C.steel2, 0.7)
    for (const v of [0.02, 0.05, 0.1, 0.2, 0.4, 0.8]) {
      if (v >= ym) continue
      const y = yOf(v)
      ctx.fillText(v < 0.1 ? v.toFixed(2) : v.toFixed(1), padL - 5, y)
      ctx.strokeStyle = paint(C.bone, 0.04)
      ctx.beginPath()
      ctx.moveTo(padL, y + 0.5)
      ctx.lineTo(padL + pw, y + 0.5)
      ctx.stroke()
    }
    // x ticks
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const fMax = nBins * BIN_HZ
    const step = zoom ? 40 : 160
    for (let f = 0; f <= fMax; f += step) {
      ctx.fillText(`${f}`, xOf(f / BIN_HZ), top + ph + 4)
    }
    ctx.textAlign = 'right'
    ctx.fillText('Hz', w - 2, top + ph + 4)

    // peak-hold ghost
    ctx.beginPath()
    for (let k = 1; k < nBins; k++) {
      const x = xOf(k)
      const y = yOf(hd[k])
      if (k === 1) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = paint(C.vib, 0.22)
    ctx.lineWidth = 1
    ctx.stroke()

    // filled spectrum
    const grad = ctx.createLinearGradient(0, top, 0, top + ph)
    grad.addColorStop(0, paint(C.vib, 0.55))
    grad.addColorStop(1, paint(C.vib, 0.02))
    ctx.beginPath()
    ctx.moveTo(xOf(1), top + ph)
    for (let k = 1; k < nBins; k++) ctx.lineTo(xOf(k), yOf(mag[k]))
    ctx.lineTo(xOf(nBins - 1), top + ph)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
    ctx.beginPath()
    for (let k = 1; k < nBins; k++) {
      const x = xOf(k)
      const y = yOf(mag[k])
      if (k === 1) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = resolve(C.vib)
    ctx.lineWidth = 1.3
    ctx.stroke()

    // diagnostic frequency markers
    const fr = fw.rpm / 60
    if (fr > 5) {
      const ev = snap.evidence
      const marks: { f: number; label: string; hot: number; color: string }[] = [
        { f: fr, label: '1×', hot: ev.imbalance, color: C.caution },
        { f: fr * 2, label: '2×', hot: ev.misalign, color: C.caution },
        { f: fr * BPFO_RATIO, label: 'BPFO', hot: ev.bearing, color: C.stop },
        { f: 100, label: '100 Hz', hot: ev.electrical, color: C.cur },
      ]
      ctx.font = `600 9px ${mono()}`
      ctx.textBaseline = 'top'
      const sorted = marks.filter((m) => m.f <= fMax).sort((p, q) => p.f - q.f)
      sorted.forEach((m, i) => {
        const x = padL + (m.f / fMax) * pw
        const row = i % 2
        const ly = top + 3 + row * 11
        const hot = m.hot > 0.3
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = paint(hot ? m.color : C.steel2, hot ? 0.8 : 0.28)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x + 0.5, ly + 10)
        ctx.lineTo(x + 0.5, top + ph)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = paint(hot ? m.color : C.steel2, Math.min(1, 0.55 + 0.45 * m.hot))
        ctx.textAlign = x > padL + pw - 40 ? 'right' : 'left'
        ctx.fillText(m.label, x + (ctx.textAlign === 'left' ? 3 : -3), ly)
      })
    }
  }, 30)

  return <canvas ref={ref} className={cn('block h-full w-full', className)} />
}
