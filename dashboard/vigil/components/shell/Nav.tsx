'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSnap } from '@vigil/components/sim/SimProvider'
import { cn, clock } from '@vigil/lib/utils'
import { StackGlyph } from './StackGlyph'

const LINKS = [
  { href: '/vigil', label: 'Overview' },
  { href: '/vigil/control-room', label: 'Control room' },
  { href: '/vigil/firmware', label: 'Firmware' },
]

export function Nav() {
  const path = usePathname()
  const state = useSnap((s) => s.state)
  const tMs = useSnap((s) => Math.floor(s.rtos.uptimeMs / 100) * 100)

  return (
    <header className="sticky top-0 z-50 border-b border-ink-600/70 bg-ink-900/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 sm:px-6">
        <Link href="/vigil" className="group flex items-center gap-2.5" aria-label="Vigil — home">
          <StackGlyph state={state} />
          <span className="stencil text-[30px] leading-none tracking-[0.02em] text-bone">Vigil</span>
          <span className="label hidden border-l border-ink-500 pl-2.5 sm:inline">
            M1 · motor
            <br />
            condition monitor
          </span>
        </Link>

        <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto" aria-label="Primary">
          {LINKS.map((l) => {
            const active = l.href === '/vigil' ? path === '/vigil' : path.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative whitespace-nowrap rounded-md px-3 py-1.5 text-[15px] font-medium transition-colors',
                  active ? 'text-bone' : 'text-steel-300 hover:text-bone',
                )}
              >
                {l.label}
                {active && <span className="absolute inset-x-3 -bottom-[11px] h-[2px] rounded-full bg-[var(--state)]" />}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/"
            title="Analog front-end and AI classifier"
            aria-label="Analog front-end and AI classifier"
            className="whitespace-nowrap rounded-md border border-ink-500 px-2.5 py-1 text-[13px] font-medium text-steel-300 transition-colors hover:border-steel-300 hover:text-bone"
          >
            Analog<span className="hidden sm:inline"> + AI</span> ↗
          </Link>
          <span className="label hidden tabular sm:inline">T+ {clock(tMs)}</span>
          <StatePill state={state} />
        </div>
      </div>
    </header>
  )
}

export function StatePill({ state, className }: { state: string; className?: string }) {
  const word =
    state === 'STARTUP' ? 'Starting' : state === 'TRIPPED' ? 'Tripped' : state.charAt(0) + state.slice(1).toLowerCase()
  return (
    <span
      className={cn('inline-flex h-7 items-center gap-2 rounded-full border px-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em]', className)}
      style={{
        color: 'var(--state)',
        borderColor: 'color-mix(in oklab, var(--state) 45%, transparent)',
        background: 'color-mix(in oklab, var(--state) 10%, transparent)',
        fontStretch: '85%',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--state)]"
        style={{ boxShadow: '0 0 8px 1px var(--state)', animation: state === 'CRITICAL' || state === 'TRIPPED' ? 'pulse-dot 0.5s infinite' : state === 'STARTUP' ? 'pulse-dot 0.9s infinite' : undefined }}
      />
      {word}
    </span>
  )
}
