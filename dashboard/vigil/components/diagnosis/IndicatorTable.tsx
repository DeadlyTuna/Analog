'use client'

import { useSnap } from '@vigil/components/sim/SimProvider'
import { CHANNEL_COLOR, LEVEL_COLOR } from '@vigil/lib/theme'
import { cn, fmt } from '@vigil/lib/utils'

/** All eight condition indicators on one shared 0 → failed scale (warning at 30 %, critical at 62 %). */
export function IndicatorTable({ className, compact = false, fill = false }: { className?: string; compact?: boolean; fill?: boolean }) {
  const inds = useSnap((s) => s.indicators)
  const state = useSnap((s) => s.state)
  const live = state === 'HEALTHY' || state === 'WARNING' || state === 'CRITICAL'

  return (
    <section className={cn('panel flex flex-col', className)} aria-label="Condition indicators">
      <div className="panel-head">
        <span className="label">Condition indicators</span>
        <span className="label hidden sm:inline">warn ▏critical ▏</span>
      </div>
      <ul className={cn('px-4 pb-3 pt-2', fill ? 'flex flex-1 flex-col justify-between gap-1.5' : compact ? 'space-y-1.5' : 'space-y-2.5')}>
        {inds.map((i) => {
          const lvl = live ? i.level : 0
          const col = LEVEL_COLOR[lvl]
          return (
            <li key={i.def.key} className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-x-3 gap-y-1 sm:grid-cols-[150px_82px_1fr_60px]">
              <span className="flex min-w-0 items-center gap-2 text-[14px] text-steel-200">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CHANNEL_COLOR[i.def.channel] }} />
                <span className="truncate">{i.def.label}</span>
              </span>
              <span className="mono text-right text-[12px] text-bone sm:text-left">
                {live || state === 'STARTUP' ? fmt(i.value, i.def.dp) : '—'}
                <span className="ml-1 text-steel-300">{i.def.unit}</span>
              </span>
              <span className="relative col-span-2 h-[7px] overflow-hidden rounded-[3px] bg-ink-600/80 sm:col-span-1">
                <span
                  className="absolute inset-y-0 left-0 rounded-[3px] transition-[width,background-color] duration-300"
                  style={{ width: `${Math.max(1.5, i.c * 100)}%`, background: col }}
                />
                <span className="absolute inset-y-0 w-px bg-caution/70" style={{ left: '30%' }} />
                <span className="absolute inset-y-0 w-px bg-stop/80" style={{ left: '62%' }} />
              </span>
              <span className="hidden text-right sm:block">
                <span
                  className="mono rounded px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.1em]"
                  style={{ color: col, background: `${col}14` }}
                >
                  {lvl === 2 ? 'crit' : lvl === 1 ? 'warn' : 'ok'}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
