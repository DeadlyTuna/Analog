'use client'

import { useEffect, useState } from 'react'
import { cn } from '@vigil/lib/utils'

export const SECTIONS: { id: string; label: string; concepts: string[] }[] = [
  { id: 'board', label: 'The board', concepts: [] },
  { id: 'acquisition', label: 'Acquisition', concepts: ['Real-time data acquisition', 'ADC'] },
  { id: 'interrupts', label: 'Interrupts and timers', concepts: ['Interrupts', 'Timers'] },
  { id: 'scheduler', label: 'Scheduler', concepts: ['RTOS', 'Task scheduling', 'Priority'] },
  { id: 'dsp', label: 'Signal processing', concepts: ['Signal processing'] },
  { id: 'detection', label: 'Fault detection', concepts: ['Fault detection'] },
  { id: 'comms', label: 'Communication', concepts: ['Communication protocols'] },
  { id: 'memory', label: 'Memory and logging', concepts: ['Memory and logging'] },
  { id: 'latency', label: 'Response time', concepts: ['Response time'] },
  { id: 'console', label: 'Serial console', concepts: [] },
]

/** Sticky table of contents. Each section lists the embedded-systems concepts it demonstrates. */
export function FirmwareIndex() {
  const [active, setActive] = useState('board')

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (vis[0]) setActive(vis[0].target.id)
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])

  return (
    <nav aria-label="Firmware sections" className="sticky top-36">
      <p className="label mb-3">On this page</p>
      <ol className="space-y-0.5 border-l border-ink-600">
        {SECTIONS.map((s) => {
          const on = active === s.id
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={on ? 'location' : undefined}
                className={cn('relative -ml-px block border-l py-1.5 pl-4 pr-2 transition-colors', on ? 'border-[var(--state)] text-bone' : 'border-transparent text-steel-300 hover:text-bone')}
              >
                <span className="text-[15px] font-medium">{s.label}</span>
                {s.concepts.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {s.concepts.map((c) => (
                      <span key={c} className={cn('mono rounded border px-1.5 py-px text-[9px] uppercase tracking-[0.06em]', on ? 'border-ink-400 text-steel-200' : 'border-ink-600 text-ink-400')}>
                        {c}
                      </span>
                    ))}
                  </span>
                )}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
