'use client'

import { ArrowRight, Cog, Fan, Weight, Wrench } from 'lucide-react'
import { motion } from 'motion/react'
import Link from 'next/link'
import { BenchCanvas } from '@vigil/components/bench/BenchCanvas'
import { StatePill } from '@vigil/components/shell/Nav'
import { GuidedDemoButton } from '@vigil/components/shell/TourBar'
import { shallowEqual, useSnap, useStore } from '@vigil/components/sim/SimProvider'
import { headline } from '@vigil/lib/diagnosis'
import { useAdaptiveQuality, useQuality } from '@vigil/lib/quality'
import { useMediaQuery } from '@vigil/lib/useMediaQuery'
import { C } from '@vigil/lib/theme'
import { cn, fmt } from '@vigil/lib/utils'

const EASE = [0.2, 0.7, 0.2, 1] as const

function Line({ children, delay, className }: { children: React.ReactNode; delay: number; className?: string }) {
  return (
    <span className="block overflow-hidden pb-[0.04em]">
      <motion.span className={cn('block', className)} initial={{ y: '108%' }} animate={{ y: 0 }} transition={{ duration: 0.95, delay, ease: EASE }}>
        {children}
      </motion.span>
    </span>
  )
}

export function Hero() {
  const wide = useMediaQuery('(min-width: 1024px)')
  const quality = useQuality()
  useAdaptiveQuality()
  return (
    <section className="relative isolate flex flex-col overflow-hidden border-b border-ink-600/60">
      <div
        className="pointer-events-none absolute inset-0 -z-[5] hidden lg:block"
        style={{ background: 'linear-gradient(90deg, var(--bg) 0%, color-mix(in oklab, var(--bg) 97%, transparent) 28%, color-mix(in oklab, var(--bg) 62%, transparent) 42%, color-mix(in oklab, var(--bg) 12%, transparent) 56%, transparent 66%)' }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-[5] hidden h-40 lg:block"
        style={{ background: 'linear-gradient(0deg, var(--bg), transparent)' }}
        aria-hidden
      />

      <div className="mx-auto flex w-full max-w-[1680px] flex-col px-4 sm:px-6 lg:min-h-[calc(100dvh-57px-92px)]">
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="ml-auto"
        >
          <Link href="/vigil/present" className="btn btn-ghost !h-10 !px-5 !text-[14px]">
            View presentation
          </Link>
        </motion.div>
        <div className="flex flex-1 flex-col justify-center py-10 sm:py-14 lg:max-w-[min(700px,46%)]">
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.1 }} className="label flex items-center gap-2.5">
            <span className="h-px w-8 bg-steel-300" aria-hidden />
            Simulated condition monitor · industrial motors
          </motion.p>

          <h1 className="stencil mt-5 text-[clamp(3.3rem,7.6vw,7.9rem)] text-bone">
            <Line delay={0.15}>It doesn’t fail</Line>
            <Line delay={0.25}>suddenly.</Line>
            <Line delay={0.4} className="text-steel-300">
              It tells you
            </Line>
            <Line delay={0.5}>
              <span style={{ color: 'var(--state)', transition: 'color 900ms ease', textShadow: '0 0 40px color-mix(in oklab, var(--state) 45%, transparent)' }}>first.</span>
            </Line>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.85, ease: EASE }}
            className="mt-7 max-w-[47ch] text-[19px] leading-snug text-steel-200 text-pretty"
          >
            A motor hums, heats and shakes differently long before it breaks. Vigil is firmware that listens to vibration, temperature, current and speed, and raises the alarm in under a second. This is the whole test bench, simulated, so you can break it on purpose.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1, ease: EASE }}
            className="mt-7 flex flex-wrap items-center gap-3"
          >
            <Link href="/vigil/control-room" className="btn btn-primary !h-12 !px-6 !text-[16px]">
              Open the control room <ArrowRight size={18} aria-hidden />
            </Link>
            <Link href="/vigil/firmware" className="btn !h-12 !px-5 !text-[16px]">
              Read the firmware
            </Link>
            <GuidedDemoButton className="btn-ghost !h-12 !px-5 !text-[16px]" label="Watch the guided demo" />
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.2 }}>
            <BreakIt />
          </motion.div>
        </div>
      </div>

      {/* live 3D bench — behind the copy on wide screens, below it on phones */}
      <div className="relative h-[460px] w-full sm:h-[560px] lg:absolute lg:inset-0 lg:-z-10 lg:h-auto">
        <BenchCanvas preset="hero" autoRotate interactive quality={quality} shift={wide ? 0.2 : 0} hideTags={wide ? ['mcu', 'k1'] : []} />
      </div>

      <Ticker />
    </section>
  )
}

/** Three quick faults wired to the same live simulator the hero is showing. */
function BreakIt() {
  const store = useStore()
  const faults = useSnap((s) => s.faults.map((f) => f.target).join(','))
  const tgt = faults.split(',').map(Number)
  const [ovl, brg, , , clg] = tgt
  const any = tgt.some((t) => t > 0.001)

  const btn = (label: string, Icon: typeof Cog, active: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('btn btn-sm !h-9', active && '!border-caution !text-caution')}
    >
      <Icon size={15} aria-hidden /> {label}
    </button>
  )

  return (
    <div className="mt-8">
      <p className="label mb-2.5 !text-caution">Break it</p>
      <div className="flex flex-wrap gap-2">
        {btn('Wear the bearing', Cog, brg > 0.001, () => store.setFault('bearing', brg > 0.001 ? 0 : 0.7))}
        {btn('Overload the shaft', Weight, ovl > 0.001, () => store.setFault('overload', ovl > 0.001 ? 0 : 1))}
        {btn('Block the cooling', Fan, clg > 0.001, () => store.setFault('cooling', clg > 0.001 ? 0 : 0.8))}
        <button type="button" className="btn btn-sm btn-ghost !h-9" onClick={() => store.maintenance()} disabled={!any}>
          <Wrench size={15} aria-hidden /> Repair
        </button>
      </div>
      <LiveDiagnosis />
    </div>
  )
}

function LiveDiagnosis() {
  const { state, diag, reason } = useSnap((s) => ({ state: s.state, diag: s.diag, reason: s.reason }), shallowEqual)
  const hi = useSnap((s) => Math.round(s.health.hi))
  const detectMs = useSnap((s) => (s.detect?.mode === 'instant' ? s.detect.ms : null))
  const h = headline({ state, diag, reason })
  return (
    <div
      className="mt-4 flex max-w-[520px] items-center gap-4 rounded-xl border bg-ink-900/70 px-4 py-3 backdrop-blur-md"
      style={{ borderColor: 'color-mix(in oklab, var(--state) 40%, var(--line))', transition: 'border-color 600ms' }}
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 flex-1">
        <p className="label">Live diagnosis</p>
        <p className="display mt-1 truncate text-[26px] text-bone">{h.title}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-steel-200">{h.sub}</p>
      </div>
      <div className="shrink-0 text-right">
        <StatePill state={state} />
        <p className="mono mt-2 text-[11px] text-steel-300">
          health <span className="text-bone">{hi}</span>
          {detectMs != null && (
            <>
              <br />
              caught in <span className="text-bone">{fmt(detectMs / 1000, 2)} s</span>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

function Ticker() {
  const m = useSnap((s) => s.meas, shallowEqual)
  const hi = useSnap((s) => Math.round(s.health.hi))
  const state = useSnap((s) => s.state)
  const items = [
    { k: 'CH1 · Vibration', v: fmt(m.vibRms, 3), u: 'g', c: C.vib },
    { k: 'CH2 · Temperature', v: fmt(m.tempC, 1), u: '°C', c: C.temp },
    { k: 'CH3 · Current', v: fmt(m.curRms, 2), u: 'A', c: C.cur },
    { k: 'CH4 · Speed', v: fmt(m.rpm, 0), u: 'rpm', c: C.rpm },
    { k: 'Health index', v: String(hi), u: '/ 100', c: C.bone },
    { k: 'Machine state', v: state === 'STARTUP' ? 'STARTING' : state, u: '', c: 'var(--state)' },
  ]
  return (
    <div className="border-t border-ink-600/70 bg-ink-900/70 backdrop-blur-md lg:mt-auto">
      <dl className="mx-auto grid max-w-[1680px] grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((it, i) => (
          <div key={it.k} className={cn('border-ink-600/70 px-4 py-3.5 sm:px-6', i % 2 === 1 && 'border-l', i % 3 !== 0 && 'sm:border-l', i % 2 === 0 && i % 3 === 0 && 'sm:border-l-0', i > 0 && 'lg:border-l')}>
            <dt className="label" style={{ color: it.c === C.bone ? undefined : it.c }}>
              {it.k}
            </dt>
            <dd className="readout mt-1.5 text-[26px]" style={{ color: it.k === 'Machine state' ? it.c : C.bone }}>
              {it.v} <span className="text-[12px] font-normal text-steel-300">{it.u}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
