'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { StatusIcon } from '@/components/ui'
import { useSnap } from '@vigil/components/sim/SimProvider'
import { clock, cn } from '@vigil/lib/utils'

const LINKS = [
  { href: '/industry', label: 'Overview' },
  { href: '/industry/control-room', label: 'Control room' },
  { href: '/industry/firmware', label: 'Firmware' },
]

/** Extension sub-header: sits under the site nav, names the extension, links its pages and shows the machine state. */
export function Nav() {
  const path = usePathname()
  const state = useSnap((s) => s.state)
  const tMs = useSnap((s) => Math.floor(s.rtos.uptimeMs / 100) * 100)

  return (
    <div className="sticky top-14 z-10 border-b border-line bg-page/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <Link href="/industry" className="min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series md:flex-none">
          <span className="block text-xs font-medium text-muted">Industry extension</span>
          <span className="block truncate text-sm font-semibold tracking-tight text-ink">Scaling up: predictive maintenance for an industrial motor</span>
        </Link>
        <nav
          aria-label="Industry extension"
          className="order-last flex w-full gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1 text-sm [scrollbar-width:none] md:order-none md:ml-auto md:w-auto [&::-webkit-scrollbar]:hidden"
        >
          {LINKS.map((l) => {
            const active = l.href === '/industry' ? path === '/industry' : path.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-md px-3 py-1 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-series',
                  active ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-2 hover:text-ink',
                )}
              >
                {l.label}
              </Link>
            )
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden font-mono text-xs tabular-nums text-muted sm:inline">T+ {clock(tMs)}</span>
          <StatePill state={state} />
        </div>
      </div>
    </div>
  )
}

const ICON = { HEALTHY: 'normal', WARNING: 'overload', CRITICAL: 'friction', TRIPPED: 'friction' } as const

/** Machine state: status colour always with an icon and a word; the word stays in the text colour. */
export function StatePill({ state, className }: { state: string; className?: string }) {
  const word =
    state === 'STARTUP' ? 'Starting' : state === 'TRIPPED' ? 'Tripped' : state.charAt(0) + state.slice(1).toLowerCase()
  const c = ICON[state as keyof typeof ICON]
  return (
    <span
      role="status"
      aria-label={`Machine state: ${word}`}
      className={cn('inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface pl-1 pr-2.5 text-xs font-medium text-ink', className)}
    >
      <span className="relative grid size-5 place-items-center" style={{ color: 'var(--state)' }}>
        {c === 'friction' && <span aria-hidden className="pulse-ring absolute inset-0 rounded-full" />}
        {c ? <StatusIcon c={c} className="size-5" /> : <span className="size-2 rounded-full bg-[var(--state)]" />}
      </span>
      {word}
    </span>
  )
}
