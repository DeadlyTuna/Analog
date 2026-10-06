'use client'

import { useEffect, useRef } from 'react'
import { C, paint } from '@vigil/lib/theme'

export type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number, now: number) => void

/**
 * Runs `draw` on requestAnimationFrame for a <canvas>, handling DPR scaling, resize, and pausing while the
 * canvas is off-screen or the tab is hidden. `fps` caps the redraw rate (default: every frame).
 */
export function useCanvasLoop(draw: DrawFn, fps = 60) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
  })

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let w = 1
    let h = 1
    let raf = 0
    let visible = true
    let last = 0
    const interval = fps >= 60 ? 0 : 1000 / fps - 2

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, r.width)
      h = Math.max(1, r.height)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    const io = new IntersectionObserver((e) => {
      visible = e[0]?.isIntersecting ?? true
    })
    io.observe(canvas)

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (!visible || document.hidden) return
      if (interval && t - last < interval) return
      last = t
      drawRef.current(ctx, w, h, t)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [fps])

  return ref
}

/** Draws an oscilloscope-style graticule. */
export function graticule(ctx: CanvasRenderingContext2D, w: number, h: number, divX: number, divY: number, alpha = 1) {
  ctx.save()
  ctx.lineWidth = 1
  for (let i = 0; i <= divX; i++) {
    const x = Math.round((i / divX) * (w - 1)) + 0.5
    ctx.strokeStyle = paint(C.bone, (i === divX / 2 ? 0.12 : 0.05) * alpha)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  }
  for (let j = 0; j <= divY; j++) {
    const y = Math.round((j / divY) * (h - 1)) + 0.5
    ctx.strokeStyle = paint(C.bone, (j === divY / 2 ? 0.14 : 0.05) * alpha)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  // minor ticks on the centre axes
  ctx.strokeStyle = paint(C.bone, 0.1 * alpha)
  const cy = Math.round(h / 2) + 0.5
  for (let i = 0; i <= divX * 5; i++) {
    const x = Math.round((i / (divX * 5)) * (w - 1)) + 0.5
    ctx.beginPath()
    ctx.moveTo(x, cy - 2)
    ctx.lineTo(x, cy + 2)
    ctx.stroke()
  }
  ctx.restore()
}
