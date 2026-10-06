'use client'

import { Pause, Play, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSnap } from '@vigil/components/sim/SimProvider'
import type { ConsoleLine, LogLevel } from '@vigil/lib/sim/firmware'
import { C } from '@vigil/lib/theme'
import { clock } from '@vigil/lib/utils'

const COLOR: Record<LogLevel, string> = { info: C.steel2, ok: C.go, warn: C.caution, crit: C.stop, pred: C.forecast, sim: C.vib }
const sameTail = (a: ConsoleLine[], b: ConsoleLine[]) => a.length === b.length && a[a.length - 1]?.id === b[b.length - 1]?.id

/** UART debug output, as you would see it in a serial terminal. */
export function Console() {
  const lines = useSnap((s) => s.console, sameTail)
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState<ConsoleLine[]>([])
  const [clearedAt, setClearedAt] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const shown = (paused ? frozen : lines).filter((l) => l.id > clearedAt)

  useEffect(() => {
    const el = ref.current
    if (el && !paused) el.scrollTop = el.scrollHeight
  }, [shown.length, paused])

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="label">UART2 debug output · 115200 8N1</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm !h-7"
            onClick={() => {
              setFrozen(lines)
              setPaused((p) => !p)
            }}
          >
            {paused ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />} {paused ? 'Resume' : 'Freeze'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm !h-7" onClick={() => setClearedAt(lines[lines.length - 1]?.id ?? 0)}>
            <Trash2 size={13} aria-hidden /> Clear
          </button>
        </div>
      </div>
      <div ref={ref} className="screen mx-3 mb-3 mt-3 h-[300px] overflow-y-auto p-3" role="log" aria-live="off">
        {shown.map((l) => (
          <p key={l.id} className="mono whitespace-pre-wrap break-words text-[11.5px] leading-[1.7]" style={{ color: COLOR[l.level] }}>
            <span className="text-ink-400">[{clock(l.tMs, true).padStart(8, ' ')}]</span> {l.text}
          </p>
        ))}
        {shown.length === 0 && <p className="mono text-[11.5px] text-ink-400">(no output)</p>}
      </div>
    </section>
  )
}
