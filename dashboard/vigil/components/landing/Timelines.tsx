'use client'

import { animate, useInView } from 'motion/react'
import { RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { C } from '@vigil/lib/theme'
import { cn } from '@vigil/lib/utils'

type Tone = 'mute' | 'bad' | 'warn' | 'pred' | 'ok'
const TONE: Record<Tone, string> = { mute: C.steel3, bad: C.stop, warn: C.caution, pred: C.forecast, ok: C.go }

interface Ev {
  at: number
  label: string
  sub: string
  tone: Tone
  side: 'up' | 'down'
}
interface Block {
  from: number
  to: number
  label: string
  kind: 'down' | 'planned'
}

const LANES: { title: string; tag: string; events: Ev[]; blocks: Block[] }[] = [
  {
    title: 'Run to failure',
    tag: 'Fix it when it breaks.',
    events: [
      { at: 0.15, label: 'Bearing starts to wear', sub: 'Nothing looks wrong yet.', tone: 'mute', side: 'up' },
      { at: 0.52, label: 'Bearing seizes', sub: 'The motor stops mid-shift.', tone: 'bad', side: 'up' },
      { at: 0.86, label: 'Back online', sub: 'After diagnosis, parts and repair.', tone: 'ok', side: 'down' },
    ],
    blocks: [{ from: 0.52, to: 0.86, label: 'Line down · unplanned', kind: 'down' }],
  },
  {
    title: 'Watch while it runs',
    tag: 'Fix it when it asks.',
    events: [
      { at: 0.15, label: 'Bearing starts to wear', sub: 'Same wear, same day.', tone: 'mute', side: 'up' },
      { at: 0.27, label: 'Forecast', sub: 'Kurtosis is climbing toward a limit.', tone: 'pred', side: 'down' },
      { at: 0.4, label: 'Warning', sub: 'Bearing flagged, work order raised.', tone: 'warn', side: 'up' },
      { at: 0.64, label: 'Back online', sub: 'New bearing, scheduled slot.', tone: 'ok', side: 'down' },
    ],
    blocks: [{ from: 0.58, to: 0.64, label: 'Planned', kind: 'planned' }],
  },
]

const SEIZE = 0.52

export function Timelines() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-140px' })
  const [t, setT] = useState(0)
  const [run, setRun] = useState(0)

  // animate() calls onUpdate from its own frame loop, so no state is set synchronously in the effect body
  useEffect(() => {
    if (!inView) return
    const c = animate(0, 1, { duration: 8, ease: 'linear', onUpdate: setT })
    return () => c.stop()
  }, [inView, run])

  const play = useCallback(() => {
    setT(0)
    setRun((r) => r + 1)
  }, [])

  return (
    <div ref={ref} className="panel overflow-hidden">
      <div className="panel-head">
        <span className="label">The same worn bearing, two outcomes</span>
        <button type="button" className="btn btn-ghost btn-sm !h-7" onClick={play}>
          <RotateCcw size={13} aria-hidden /> Replay
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="relative min-w-[700px] px-5 pb-5 pt-3 sm:px-6">
          {/* shared markers */}
          <div className="pointer-events-none absolute inset-y-3 left-[calc(124px+1rem+1.25rem)] right-5 sm:left-[calc(170px+1.25rem+1.5rem)] sm:right-6" aria-hidden>
            <div className="absolute inset-y-0 w-px bg-bone/50" style={{ left: `${t * 100}%`, opacity: t < 1 ? 1 : 0, transition: 'opacity 400ms' }} />
            <div
              className="absolute inset-y-0 border-l border-dashed border-stop/50 transition-opacity duration-500"
              style={{ left: `${SEIZE * 100}%`, opacity: t >= SEIZE ? 1 : 0 }}
            />
          </div>

          {LANES.map((lane, li) => (
            <div key={lane.title} className={cn('grid grid-cols-[124px_1fr] items-center gap-4 sm:grid-cols-[170px_1fr] sm:gap-5', li > 0 && 'border-t border-ink-600/70')}>
              <div>
                <h3 className="display text-[22px] text-bone sm:text-[26px]">{lane.title}</h3>
                <p className="mt-1 text-[13px] text-steel-300">{lane.tag}</p>
              </div>
              <div className="relative h-[190px]">
                <div className="absolute inset-x-0 top-1/2 h-px bg-ink-500" />
                {/* time ticks */}
                {Array.from({ length: 21 }, (_, i) => (
                  <span key={i} className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-ink-500" style={{ left: `${(i / 20) * 100}%` }} />
                ))}
                {lane.blocks.map((b) => {
                  const shown = t >= b.from
                  const w = Math.max(0, Math.min(t, b.to) - b.from) / (b.to - b.from)
                  return (
                    <div
                      key={b.label}
                      className={cn('absolute top-1/2 h-[26px] -translate-y-1/2 overflow-hidden rounded-[4px] border', b.kind === 'down' ? 'border-caution/70' : 'border-go/70 bg-go/80')}
                      style={{ left: `${b.from * 100}%`, width: `${(b.to - b.from) * 100}%`, opacity: shown ? 1 : 0, transition: 'opacity 300ms' }}
                    >
                      <div className={cn('h-full', b.kind === 'down' && 'hazard')} style={{ width: `${w * 100}%` }} />
                      {b.kind === 'down' && <span className="mono absolute inset-0 grid place-items-center bg-ink-900/55 text-[10px] font-medium uppercase tracking-[0.12em] text-caution">{b.label}</span>}
                    </div>
                  )
                })}
                {lane.events.map((e) => {
                  const shown = t >= e.at
                  const col = TONE[e.tone]
                  return (
                    <div key={e.label} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${e.at * 100}%` }}>
                      <span
                        className="block h-3.5 w-3.5 rounded-full border-2 border-ink-900 transition-all duration-500"
                        style={{ background: col, boxShadow: shown ? `0 0 14px ${col}` : 'none', transform: shown ? 'scale(1)' : 'scale(0.2)', opacity: shown ? 1 : 0.25 }}
                      />
                      <div
                        className={cn('absolute left-1/2 w-[132px] -translate-x-1/2 transition-all duration-500', e.side === 'up' ? 'bottom-6' : 'top-6')}
                        style={{ opacity: shown ? 1 : 0, transform: `translate(-50%, ${shown ? 0 : e.side === 'up' ? 8 : -8}px)` }}
                      >
                        <p className="mono text-center text-[10px] font-medium uppercase tracking-[0.1em]" style={{ color: col }}>
                          {e.label}
                        </p>
                        <p className="mt-0.5 text-center text-[12.5px] leading-snug text-steel-200">{e.sub}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          <p className="mono mt-1 text-right text-[10px] uppercase tracking-[0.12em] text-ink-400">time → · illustrative timeline, not measured data</p>
        </div>
      </div>
    </div>
  )
}
