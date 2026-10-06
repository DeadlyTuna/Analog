'use client'

import { useRef } from 'react'
import { useStore } from '@vigil/components/sim/SimProvider'
import { SPEC_BINS } from '@vigil/lib/sim/config'
import { SPEC_COLS } from '@vigil/lib/sim/firmware'
import { IRON_LUT, MONO } from '@vigil/lib/theme'
import { cn } from '@vigil/lib/utils'
import { useCanvasLoop } from './useCanvasLoop'

/**
 * Scrolling spectrogram ("waterfall"): time runs left → right (newest at the right edge), frequency runs
 * bottom → top, colour is amplitude on an infrared-camera ramp. Faults show up as new bright bands.
 */
export function Spectrogram({ className }: { className?: string }) {
  const store = useStore()
  const off = useRef<{ c: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData } | null>(null)
  const lastSeq = useRef(-1)
  const lastEpoch = useRef(-1)

  const ref = useCanvasLoop((ctx, w, h) => {
    const fw = store.sim.fw
    if (!off.current) {
      const c = document.createElement('canvas')
      c.width = SPEC_COLS
      c.height = SPEC_BINS
      const octx = c.getContext('2d')!
      off.current = { c, ctx: octx, img: octx.createImageData(SPEC_COLS, SPEC_BINS) }
    }
    const o = off.current
    const epoch = store.getSnapshot().epoch
    if (fw.specSeq !== lastSeq.current || epoch !== lastEpoch.current) {
      lastSeq.current = fw.specSeq
      lastEpoch.current = epoch
      const d = o.img.data
      const hist = fw.specHist
      for (let col = 0; col < SPEC_COLS; col++) {
        // oldest column first; the ring head points at the next slot to be overwritten (= oldest)
        const src = ((fw.specHead + col) % SPEC_COLS) * SPEC_BINS
        for (let bin = 0; bin < SPEC_BINS; bin++) {
          const v = hist[src + bin]
          const u = Math.sqrt(Math.min(1, v / 0.45))
          const li = Math.round(u * 255) * 3
          const row = SPEC_BINS - 1 - bin
          const p = (row * SPEC_COLS + col) * 4
          d[p] = IRON_LUT[li]
          d[p + 1] = IRON_LUT[li + 1]
          d[p + 2] = IRON_LUT[li + 2]
          d[p + 3] = 255
        }
      }
      o.ctx.putImageData(o.img, 0, 0)
    }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(o.c, 0, 0, w, h)

    // frequency ticks
    ctx.font = `500 9px ${MONO}`
    ctx.fillStyle = 'rgba(235,232,222,0.8)'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.strokeStyle = 'rgba(235,232,222,0.18)'
    for (const f of [0, 250, 500, 750, 1000, 1250]) {
      const y = h - (f / 1280) * h
      ctx.beginPath()
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(w, y + 0.5)
      ctx.stroke()
      ctx.fillText(f === 0 ? '0 Hz' : `${f}`, 5, Math.min(h - 7, Math.max(7, y - 6)))
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText('now', w - 5, h - 4)
    ctx.textAlign = 'left'
    ctx.fillText('−20 s', 36, h - 4)
  }, 30)

  return <canvas ref={ref} className={cn('block h-full w-full', className)} />
}
