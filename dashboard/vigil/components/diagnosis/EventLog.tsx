'use client'

import { Download } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useSnap, useStore } from '@vigil/components/sim/SimProvider'
import type { LogEntry } from '@vigil/lib/sim/firmware'
import { C } from '@vigil/lib/theme'
import { clock, cn } from '@vigil/lib/utils'

const LEVEL: Record<LogEntry['level'], { color: string; tag: string }> = {
  info: { color: C.steel3, tag: 'INFO' },
  ok: { color: C.go, tag: 'OK' },
  warn: { color: C.caution, tag: 'WARN' },
  crit: { color: C.stop, tag: 'CRIT' },
  pred: { color: C.forecast, tag: 'FCST' },
  sim: { color: C.vib, tag: 'SIM' },
}

const sameTail = (a: LogEntry[], b: LogEntry[]) => a.length === b.length && a[a.length - 1]?.id === b[b.length - 1]?.id

export function EventLog({ className }: { className?: string }) {
  const store = useStore()
  const events = useSnap((s) => s.events, sameTail)
  const ref = useRef<HTMLOListElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const el = ref.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [events])

  const exportCsv = () => {
    const rows = store.sim.fw.events
    const esc = (s: string) => `"${s.replaceAll('"', '""')}"`
    const csv = ['t_ms,level,source,code,message', ...rows.map((e) => [Math.round(e.tMs), e.level, e.src, e.code, esc(e.msg)].join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'vigil-event-log.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className={cn('panel flex min-h-0 flex-col', className)} aria-label="Event log">
      <div className="panel-head">
        <span className="label">Event log</span>
        <button type="button" className="btn btn-ghost btn-sm !h-7" onClick={exportCsv} title="Download the log as CSV">
          <Download size={14} aria-hidden /> CSV
        </button>
      </div>
      <ol
        ref={ref}
        className="min-h-[220px] flex-1 overflow-y-auto px-3 py-2"
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 28
        }}
        aria-live="polite"
      >
        {events.map((e) => {
          const l = LEVEL[e.level]
          return (
            <li key={e.id} className="grid grid-cols-[62px_40px_1fr] items-baseline gap-x-2 border-b border-ink-700/60 py-[5px] last:border-0">
              <time className="mono text-[10.5px] text-steel-300">{clock(e.tMs)}</time>
              <span className="mono text-[9.5px] font-medium tracking-[0.1em]" style={{ color: l.color }}>
                {l.tag}
              </span>
              <span className="text-[13.5px] leading-snug text-bone/90">
                <span className="mono mr-1.5 text-[10px] tracking-[0.08em] text-steel-300">{e.code}</span>
                {e.msg}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
