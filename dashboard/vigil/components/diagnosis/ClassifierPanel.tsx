'use client'

import { Wrench } from 'lucide-react'
import { shallowEqual, useSnap } from '@vigil/components/sim/SimProvider'
import { CLASS_META, CLASS_ORDER, type ClassId } from '@vigil/lib/sim/config'
import { C } from '@vigil/lib/theme'
import { cn } from '@vigil/lib/utils'

function barColor(id: ClassId, ev: number) {
  if (id === 'healthy') return C.go
  return ev >= 0.6 ? C.stop : ev >= 0.3 ? C.caution : C.steel3
}

export function ClassifierPanel({ className }: { className?: string }) {
  const evidence = useSnap((s) => s.evidence, shallowEqual)
  const diag = useSnap((s) => s.diag, shallowEqual)
  const state = useSnap((s) => s.state)
  const advice = useSnap((s) => s.advice)
  const abnormal = state === 'WARNING' || state === 'CRITICAL'
  const judging = state === 'HEALTHY' || abnormal
  const showAdvice = judging && (diag.cls !== 'healthy' || abnormal)

  return (
    <section className={cn('panel flex flex-col', className)} aria-label="Fault classification">
      <div className="panel-head">
        <span className="label">Fault classification</span>
        <span className="label tabular">evidence 0–100 %</span>
      </div>
      <ul className="space-y-[7px] px-4 pb-1 pt-3.5">
        {CLASS_ORDER.map((id) => {
          const ev = judging ? evidence[id] : 0
          const top = judging && diag.cls === id
          const col = barColor(id, ev)
          return (
            <li key={id} className="grid grid-cols-[112px_1fr_40px] items-center gap-3">
              <span className={cn('truncate text-[14px]', top ? 'font-semibold text-bone' : 'text-steel-200')}>{CLASS_META[id].label}</span>
              <span className="relative h-[9px] overflow-hidden rounded-[3px] bg-ink-600/80">
                <span
                  className="absolute inset-y-0 left-0 rounded-[3px] transition-[width,background-color] duration-500 ease-out"
                  style={{ width: `${Math.max(ev > 0.01 ? 2 : 0, ev * 100)}%`, background: col, boxShadow: top ? `0 0 12px ${col}` : undefined }}
                />
                {[0.25, 0.5, 0.75].map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px bg-ink-900/70" style={{ left: `${t * 100}%` }} />
                ))}
              </span>
              <span className={cn('mono text-right text-[11px]', top ? 'text-bone' : 'text-steel-300')}>{judging ? Math.round(ev * 100) : '—'}</span>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto px-4 pb-4 pt-3">
        {showAdvice ? (
          <div className="rounded-lg border border-ink-600 bg-ink-850/70 p-3">
            <p className="label flex items-center gap-1.5">
              <Wrench size={12} aria-hidden /> Recommended action
            </p>
            <p className="mt-1.5 text-[14px] leading-snug text-bone/95 text-pretty">{advice}</p>
          </div>
        ) : (
          <p className="text-[13px] text-steel-300">
            {judging ? 'Nothing to do — every channel is inside its normal band.' : 'Classification runs once the motor has finished starting.'}
          </p>
        )}
      </div>
    </section>
  )
}
