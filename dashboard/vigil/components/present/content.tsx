'use client'

import { motion, type Variants } from 'motion/react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Gantt } from '@vigil/components/firmware/Gantt'
import { Scope } from '@vigil/components/scopes/Scope'
import { Spectrum } from '@vigil/components/scopes/Spectrum'
import { TrendStrip } from '@vigil/components/scopes/TrendStrip'
import { shallowEqual, useSnap, useStore } from '@vigil/components/sim/SimProvider'
import type { StoreSnapshot } from '@vigil/lib/sim/store'
import { CLASS_META, CLASS_ORDER } from '@vigil/lib/sim/config'
import { C } from '@vigil/lib/theme'
import { Clocks, FrameDiagram, FsmDiagram, LatencyChain, PingPong, RingLog, SamplingDiagram, Screen, SystemMap, WaveCard } from './diagrams'
import type { SlideDef } from './slides'

/* ---------- small building blocks ---------- */

const rise: Variants = {
  hidden: { opacity: 0, y: 38 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.12 + i * 0.09, duration: 0.6, ease: [0.2, 0.9, 0.25, 1] } }),
}

function Item({ i = 0, children, className }: { i?: number; children: ReactNode; className?: string }) {
  return (
    <motion.div variants={rise} custom={i} className={className}>
      {children}
    </motion.div>
  )
}

/** A dark panel colour that always reads against white text, whatever the slide's ink is. */
const panel = (s: SlideDef) => (s.ink === '#ffffff' ? '#150f33' : s.ink)

const Kicker = ({ children, s }: { children: ReactNode; s: SlideDef }) => (
  <span
    className="inline-block rounded-full px-4 py-1.5 font-mono text-[clamp(11px,1.05vw,15px)] font-bold uppercase tracking-[0.14em]"
    style={{ background: s.ink, color: s.bg }}
  >
    {children}
  </span>
)

const HEAD_SIZE = { xl: 'clamp(3rem, 7.4vw, 8.4rem)', lg: 'clamp(2.6rem, 6vw, 6.6rem)', md: 'clamp(2.2rem, 4.7vw, 5.2rem)' }

const Head = ({ children, size = 'xl' }: { children: ReactNode; size?: keyof typeof HEAD_SIZE }) => (
  <h1 className="font-display font-black uppercase leading-[0.88] tracking-[-0.01em]" style={{ fontSize: HEAD_SIZE[size] }}>
    {children}
  </h1>
)

const Body = ({ children }: { children: ReactNode }) => (
  <p className="max-w-[30ch] font-sans font-medium leading-[1.2]" style={{ fontSize: 'clamp(1.25rem, 2.15vw, 2.4rem)' }}>
    {children}
  </p>
)

const Lead = ({ children }: { children: ReactNode }) => (
  <p className="max-w-[40ch] font-sans font-semibold leading-[1.2]" style={{ fontSize: 'clamp(1rem, 1.6vw, 1.8rem)' }}>
    {children}
  </p>
)

const Pop = ({ s, children }: { s: SlideDef; children: ReactNode }) => <span style={{ color: s.pop }}>{children}</span>

/** Numbered "how it works" steps. */
function Steps({ s, items, from = 2 }: { s: SlideDef; items: ReactNode[]; from?: number }) {
  return (
    <ol className="grid gap-[clamp(0.4rem,1.1vh,0.8rem)]">
      {items.map((t, k) => (
        <motion.li
          key={k}
          variants={rise}
          custom={from + k}
          className="flex items-start gap-3 font-sans font-semibold leading-[1.18]"
          style={{ fontSize: 'clamp(0.92rem, 1.4vw, 1.55rem)' }}
        >
          <span className="grid h-[1.6em] w-[1.6em] shrink-0 place-items-center rounded-full font-display font-black" style={{ background: s.ink, color: s.bg }}>
            {k + 1}
          </span>
          <span className="pt-[0.12em]">{t}</span>
        </motion.li>
      ))}
    </ol>
  )
}

function Chip({ s, children, solid }: { s: SlideDef; children: ReactNode; solid?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 font-sans font-bold"
      style={{
        fontSize: 'clamp(1rem, 1.55vw, 1.7rem)',
        background: solid ? s.pop : 'transparent',
        color: solid ? s.bg : 'inherit',
        border: solid ? 'none' : `3px solid ${s.ink}`,
      }}
    >
      {children}
    </span>
  )
}

/** A big live number read straight from the running simulation. */
function Live({ s, label, pick, unit, digits = 1 }: { s: SlideDef; label: string; pick: (x: StoreSnapshot) => number; unit: string; digits?: number }) {
  const v = useSnap(pick)
  return (
    <div className="inline-block rounded-3xl px-6 py-4" style={{ background: s.ink, color: s.bg }}>
      <div className="font-mono text-[clamp(10px,0.95vw,14px)] font-bold uppercase tracking-[0.16em] opacity-80">{label} · live</div>
      <div className="font-display font-black leading-none tabular-nums" style={{ fontSize: 'clamp(3rem, 6.4vw, 7rem)' }}>
        {v.toFixed(digits)}
        <span className="ml-2 text-[0.38em]">{unit}</span>
      </div>
    </div>
  )
}

/** A row of small live readings. */
function Minis({ s, items }: { s: SlideDef; items: { label: string; pick: (x: StoreSnapshot) => number; unit?: string; digits?: number; note?: string }[] }) {
  const vals = useSnap((x) => items.map((it) => it.pick(x)), (a, b) => a.length === b.length && a.every((v, k) => v === b[k]))
  return (
    <div className="flex flex-wrap gap-2.5">
      {items.map((it, k) => (
        <div key={it.label} className="rounded-2xl px-4 py-2.5" style={{ background: panel(s), color: '#fff' }}>
          <div className="font-mono text-[clamp(9px,0.8vw,11px)] font-bold uppercase tracking-[0.14em] opacity-70">{it.label}</div>
          <div className="font-display text-[clamp(1.5rem,2.6vw,2.8rem)] font-black leading-none tabular-nums">
            {vals[k].toFixed(it.digits ?? 0)}
            {it.unit && <span className="ml-1 text-[0.45em]">{it.unit}</span>}
          </div>
          {it.note && <div className="mt-0.5 font-sans text-[clamp(0.7rem,0.85vw,0.95rem)] font-semibold opacity-70">{it.note}</div>}
        </div>
      ))}
    </div>
  )
}

const STATE_COL = { HEALTHY: '#2ee67c', WARNING: '#ffb21e', CRITICAL: '#ff3b30', TRIPPED: '#ff3b30', STARTUP: '#5c9dff', OFF: '#8a8f98' } as const

function StateBadge({ s }: { s: SlideDef }) {
  const state = useSnap((x) => x.state)
  const reason = useSnap((x) => x.reason)
  const col = STATE_COL[state]
  return (
    <div className="inline-flex max-w-[34ch] items-center gap-4 rounded-3xl px-6 py-4" style={{ background: panel(s), color: '#fff' }}>
      <span className="h-6 w-6 shrink-0 rounded-full" style={{ background: col, boxShadow: `0 0 24px 4px ${col}`, animation: state === 'HEALTHY' ? undefined : 'pres-pulse 0.9s ease-in-out infinite' }} />
      <div>
        <div className="font-display text-[clamp(1.8rem,3.4vw,3.6rem)] font-black uppercase leading-none">{state}</div>
        <div className="mt-1 font-sans text-[clamp(0.85rem,1.1vw,1.2rem)] leading-tight opacity-80">{reason}</div>
      </div>
    </div>
  )
}

function HealthBar({ s }: { s: SlideDef }) {
  const hi = useSnap((x) => x.health.hi)
  const txt = useSnap((x) => x.health.predText)
  const pct = Math.max(0, Math.min(100, hi))
  return (
    <div className="w-[min(34rem,90%)]">
      <div className="mb-2 flex items-end justify-between font-mono text-[clamp(11px,1vw,14px)] font-bold uppercase tracking-[0.14em]">
        <span>Health score</span>
        <span className="font-display text-[2.6em] leading-none tabular-nums">{pct.toFixed(0)}</span>
      </div>
      <div className="h-5 overflow-hidden rounded-full" style={{ background: `${s.ink}33` }}>
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: s.ink }} />
      </div>
      <p className="mt-2 min-h-[2.4em] font-sans text-[clamp(0.9rem,1.2vw,1.3rem)] font-semibold leading-tight">{txt}</p>
    </div>
  )
}

/** Live evidence score for every fault class (the rule-based classifier's output). */
function EvidenceBars({ s }: { s: SlideDef }) {
  const ev = useSnap((x) => x.evidence, shallowEqual)
  const top = useSnap((x) => x.diag.cls)
  return (
    <div className="grid w-[min(36rem,100%)] gap-1.5 rounded-3xl p-4" style={{ background: panel(s), color: '#fff' }}>
      {CLASS_ORDER.map((id) => {
        const v = Math.max(0, Math.min(1, ev[id] ?? 0))
        const lead = id === top
        const col = id === 'healthy' ? C.go : v >= 0.6 ? '#ff3b30' : v >= 0.25 ? '#ffb21e' : '#8a8f98'
        return (
          <div key={id} className="grid grid-cols-[9.5em_1fr_2.6em] items-center gap-3 font-sans text-[clamp(0.8rem,1.05vw,1.15rem)] font-semibold">
            <span className={lead ? 'font-black' : 'opacity-80'}>{CLASS_META[id].label}</span>
            <span className="relative h-3 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.12)' }}>
              <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: `${v * 100}%`, background: col, boxShadow: lead ? `0 0 12px ${col}` : undefined }} />
              <span className="absolute inset-y-0 w-px bg-white/50" style={{ left: '25%' }} />
            </span>
            <span className="text-right font-mono text-[0.85em] tabular-nums">{Math.round(v * 100)}</span>
          </div>
        )
      })}
      <div className="mt-1 font-mono text-[clamp(9px,0.8vw,11px)] font-bold uppercase tracking-[0.14em] opacity-60">white line = 25 % · highest score above it wins</div>
    </div>
  )
}

/** Press to inject a sudden overload and show the measured fault-to-warning time. */
function DetectDemo({ s }: { s: SlideDef }) {
  const store = useStore()
  const state = useSnap((x) => x.state)
  const d = useSnap((x) => (x.detect ? { ms: x.detect.ms, mode: x.detect.mode } : null), shallowEqual)
  const caught = d && d.mode === 'instant' && d.ms != null ? d.ms : null
  const armed = state === 'HEALTHY' && !d
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-4">
      <button
        onClick={(e) => {
          // give focus back to the page so arrow keys keep driving the deck
          e.currentTarget.blur()
          if (armed) store.setFault('overload', 1)
          else store.maintenance()
        }}
        className="cursor-pointer rounded-full px-7 py-3.5 font-display text-[clamp(1.2rem,2vw,2.2rem)] font-black uppercase leading-none transition hover:scale-105"
        style={{ background: armed ? s.pop : '#fff', color: '#06123d' }}
      >
        {armed ? 'Break it now ⚡' : 'Repair'}
      </button>
      <span className="font-sans text-[clamp(1rem,1.6vw,1.8rem)] font-bold">
        {caught != null ? (
          <>
            Caught in <Pop s={s}>{(caught / 1000).toFixed(2)} s</Pop>
          </>
        ) : d ? (
          'Watching…'
        ) : state === 'HEALTHY' ? (
          'Press to overload the motor'
        ) : (
          'Settling…'
        )}
      </span>
    </div>
  )
}

/* ---------- the slides ---------- */

export type Content = { head: ReactNode; extra?: ReactNode }

const LIMITS: [string, string, string][] = [
  ['Vibration', '0.35', '0.55 g'],
  ['Temperature', '70', '85 °C'],
  ['Current', '5.5', '8.2 A'],
  ['Slip', '4', '12 %'],
  ['Kurtosis', '4.5', '8'],
]

const FINGERPRINTS: [string, string][] = [
  ['Overload', 'current ↑ · speed ↓ · heat ↑'],
  ['Bearing wear', 'spiky clicks · high-pitched ringing (620 Hz)'],
  ['Misalignment', 'loud note at 2× shaft speed'],
  ['Imbalance', 'loud note at 1× · grows with speed²'],
  ['Cooling failure', 'heat ↑ while current stays normal'],
  ['Electrical fault', 'current flickers · distortion · 100 Hz hum ↑'],
]

const FRAME = [
  { label: 'Sync', size: '2 B', c: '#ffe14d' },
  { label: 'Len', size: '1 B', c: '#ffb3f0' },
  { label: 'Seq', size: '1 B', c: '#ffb3f0' },
  { label: 'Uptime', size: '4 B', c: '#9ec5ff' },
  { label: 'Temp', size: '2 B', c: C.temp },
  { label: 'Vib', size: '2 B', c: C.vib },
  { label: 'Amps', size: '2 B', c: C.cur },
  { label: 'RPM', size: '2 B', c: '#ebe8de' },
  { label: 'Health', size: '1 B', c: '#2ee67c' },
  { label: 'State', size: '1 B', c: '#2ee67c' },
  { label: 'Fault', size: '1 B', c: '#2ee67c' },
  { label: 'Flags', size: '1 B', c: '#2ee67c' },
  { label: 'Life', size: '2 B', c: '#9ec5ff' },
  { label: 'CRC', size: '2 B', c: '#ff6b6b' },
]

export function content(id: string, s: SlideDef): Content {
  switch (id) {
    case 'title':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Embedded systems · college project</Kicker></Item>
            <Item i={1}><div className="font-stencil font-black uppercase leading-[0.8]" style={{ fontSize: 'clamp(6rem, 17vw, 19rem)', letterSpacing: '-0.01em' }}>Vigil</div></Item>
            <Item i={2}><Body>A tiny computer that listens to a motor and warns us <Pop s={s}>before it breaks.</Pop></Body></Item>
            <Item i={3}><p className="font-mono text-[clamp(11px,1vw,14px)] font-bold uppercase tracking-[0.18em] opacity-80">Press → or space to begin</p></Item>
          </>
        ),
      }
    case 'problem':
      return {
        head: (
          <>
            <Item><Kicker s={s}>The problem</Kicker></Item>
            <Item i={1}><Head>Motors break <Pop s={s}>without warning</Pop></Head></Item>
            <Item i={2}><Body>Factories run on electric motors. When one dies suddenly, everything stops.</Body></Item>
            <Item i={3} className="flex flex-wrap gap-3"><Chip s={s}>🏭 Line stops</Chip><Chip s={s}>💸 Rush repair</Chip><Chip s={s}>⚠️ Safety risk</Chip></Item>
          </>
        ),
      }
    case 'idea':
      return {
        head: (
          <>
            <Item><Kicker s={s}>The idea</Kicker></Item>
            <Item i={1}><Head>Give the motor a <Pop s={s}>doctor</Pop></Head></Item>
            <Item i={2}><Body>Sensors take its pulse 2,560 times a second. A check-up that never sleeps.</Body></Item>
          </>
        ),
        extra: (
          <Item i={3} className="flex flex-wrap items-center gap-3">
            <Chip s={s} solid>1 · Sense</Chip><span className="text-3xl font-black">→</span>
            <Chip s={s} solid>2 · Think</Chip><span className="text-3xl font-black">→</span>
            <Chip s={s} solid>3 · Act</Chip>
          </Item>
        ),
      }
    case 'map':
      return {
        head: (
          <>
            <Item><Kicker s={s}>The big picture</Kicker></Item>
            <Item i={1}><Head size="lg">Sense → think → <Pop s={s}>act</Pop></Head></Item>
          </>
        ),
        extra: (
          <Item i={2} className="w-full">
            <SystemMap panel={panel(s)} pop={s.pop} mcuLines={['ADC + DMA · 2,560/s', 'Timers · tacho', 'RTOS · 5 tasks', 'FFT + features', 'Rules · state machine']} />
          </Item>
        ),
      }
    case 'motor':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Meet the patient</Kicker></Item>
            <Item i={1}><Head size="lg">The <Pop s={s}>motor</Pop></Head></Item>
            <Steps
              s={s}
              items={[
                <>Mains power (50 Hz) makes a magnetic field that spins at <b>1,500 rpm</b>.</>,
                <>The rotor chases it but always lags a little. That lag is <b>slip</b>: 1.3 % → <b>1,480 rpm</b>.</>,
                <>More load = more slip, current and heat. At 1.9× load: 1,350 rpm, 7.8 A, 78 °C.</>,
              ]}
            />
          </>
        ),
        extra: (
          <Item i={5} className="flex flex-wrap items-center gap-3">
            <Chip s={s} solid>1.5 kW</Chip><Chip s={s} solid>4-pole</Chip><Chip s={s} solid>415 V</Chip>
            <span className="font-sans text-[clamp(1rem,1.4vw,1.5rem)] font-semibold">healthy: 4.2 A · 55 °C</span>
          </Item>
        ),
      }
    case 'vibration':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Sense #1 · feel</Kicker></Item>
            <Item i={1}><Head size="lg"><Pop s={s}>Vibration</Pop></Head></Item>
            <Steps
              s={s}
              items={[
                <>An <b>accelerometer</b> is a tiny weight on springs. Shaking moves it, which changes a voltage.</>,
                <>Still = 1.65 V. Each <b>1 g</b> of shake moves it by <b>0.33 V</b> (range ±5 g).</>,
                <>A healthy hum is about 0.25 g. A worn bearing adds sharp clicks.</>,
              ]}
            />
          </>
        ),
        extra: (
          <Item i={5}>
            <Screen label="Vibration · live scope" note="one sweep per shaft turn" height="clamp(90px, 15vh, 150px)">
              <Scope channel="vib" />
            </Screen>
          </Item>
        ),
      }
    case 'temperature':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Sense #2 · heat</Kicker></Item>
            <Item i={1}><Head size="lg"><Pop s={s}>Temp&shy;erature</Pop></Head></Item>
            <Steps
              s={s}
              items={[
                <>An <b>RTD probe</b> in the winding changes resistance with heat. Its amplifier gives <b>10 mV per °C</b>.</>,
                <>Read <b>10 times a second</b> and smoothed. Heat changes slowly, so that is plenty.</>,
                <>Healthy 55 °C, overloaded 78 °C. A real motor takes ~20 min to heat up; the simulation speeds it up.</>,
              ]}
            />
          </>
        ),
        extra: (
          <Item i={5}>
            <Screen label="Temperature · last 2 minutes" note="overload applied" height="clamp(80px, 13vh, 130px)">
              <TrendStrip series="temp" color={C.temp} min={40} max={95} warn={70} crit={85} unit="°C" />
            </Screen>
          </Item>
        ),
      }
    case 'current':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Sense #3 · electricity</Kicker></Item>
            <Item i={1}><Head size="lg"><Pop s={s}>Current</Pop></Head></Item>
            <Steps
              s={s}
              items={[
                <>A <b>Hall sensor</b> on the supply cable feels the magnetic field around the wire.</>,
                <>0 A reads 1.65 V and every amp adds <b>0.05 V</b> (range ±33 A).</>,
                <>Relaxed 4.2 A, overloaded 7.8 A, and about <b>19 A</b> for a moment at start-up.</>,
              ]}
            />
          </>
        ),
        extra: (
          <Item i={5}>
            <Screen label="Current · live scope" note="50 Hz mains" height="clamp(90px, 15vh, 150px)">
              <Scope channel="cur" />
            </Screen>
          </Item>
        ),
      }
    case 'speed':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Sense #4 · speed</Kicker></Item>
            <Item i={1}><Head size="lg"><Pop s={s}>Speed</Pop></Head></Item>
            <Steps
              s={s}
              items={[
                <>A magnet on the shaft passes a pickup <b>once every turn</b>, giving one pulse per revolution.</>,
                <>A timer stamps each pulse to the microsecond. At 1,480 rpm they arrive every <b>40.5 ms</b>.</>,
                <>Speed = 60,000,000 ÷ gap in µs. No pulse for 0.35 s means the shaft has stopped.</>,
              ]}
            />
          </>
        ),
        extra: <Item i={5}><Live s={s} label="Shaft" pick={(x) => x.meas.rpm} unit="rpm" digits={0} /></Item>,
      }
    case 'brain':
      return {
        head: (
          <>
            <Item><Kicker s={s}>The brain</Kicker></Item>
            <Item i={1}><Head size="lg">A <Pop s={s}>micro&shy;controller</Pop></Head></Item>
            <Item i={2}><Lead>An STM32F411 chip: 512 KB of flash, 128 KB of RAM, running at 48 MHz. Four jobs, all day long:</Lead></Item>
          </>
        ),
        extra: (
          <div className="grid max-w-[44rem] gap-2">
            {[
              ['ADC', 'turns sensor voltages into numbers'],
              ['DMA', 'files those numbers away by itself'],
              ['Timers', 'keep one exact, steady rhythm'],
              ['Interrupts', '“new data!” taps on the shoulder'],
            ].map(([a, b], i) => (
              <Item key={a} i={3 + i}>
                <div className="flex items-center gap-4 rounded-2xl px-5 py-2.5" style={{ background: s.ink }}>
                  <span className="w-[5.2em] shrink-0 font-display text-[clamp(1.4rem,2.4vw,2.6rem)] font-black uppercase leading-none" style={{ color: s.bg }}>{a}</span>
                  <span className="font-sans text-[clamp(0.9rem,1.3vw,1.4rem)] font-semibold leading-tight" style={{ color: '#fff' }}>{b}</span>
                </div>
              </Item>
            ))}
            <Item i={7}>
              <Minis s={s} items={[{ label: 'CPU busy · live', pick: (x) => x.rtos.cpuLoad * 100, unit: '%', digits: 1, note: 'the rest of the time it waits' }]} />
            </Item>
          </div>
        ),
      }
    case 'adc':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Step 1 · measure</Kicker></Item>
            <Item i={1}><Head size="md">Voltage → <Pop s={s}>numbers</Pop></Head></Item>
            <Steps
              s={s}
              items={[
                <>Timer <b>TIM3</b> fires <b>2,560 times a second</b>: once every 0.39 ms.</>,
                <>Each tick, the <b>ADC</b> measures 0–3.3 V as a whole number from <b>0 to 4,095</b> (12 bits).</>,
                <>The chip converts it back: one step = 2.4 thousandths of a g, or 16 mA.</>,
              ]}
            />
          </>
        ),
        extra: (
          <>
            <Item i={5}><SamplingDiagram ink={s.ink} pop={s.pop} panel={panel(s)} /></Item>
            <Item i={6}>
              <Minis
                s={s}
                items={[
                  { label: 'raw vib', pick: (x) => x.adc.vib },
                  { label: 'raw current', pick: (x) => x.adc.cur },
                  { label: 'raw temp', pick: (x) => x.adc.temp },
                ]}
              />
            </Item>
          </>
        ),
      }
    case 'dma':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Step 2 · collect</Kicker></Item>
            <Item i={1}><Head size="md">Two buckets, <Pop s={s}>one tap</Pop></Head></Item>
            <Steps
              s={s}
              items={[
                <><b>DMA</b>, a helper circuit, drops every reading into a <b>128-slot</b> ring. The CPU isn’t involved.</>,
                <>Every 64 readings (<b>25 ms</b>) it rings a bell, an <b>interrupt</b>. The CPU answers in about 0.8 µs.</>,
                <>The sampling task empties the full half while DMA fills the other. Nothing is lost.</>,
              ]}
            />
          </>
        ),
        extra: <Item i={5}><PingPong pop={s.pop} panel={panel(s)} halfLabel="64 samples" /></Item>,
      }
    case 'timers':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Step 3 · keep time</Kicker></Item>
            <Item i={1}><Head size="md">Four <Pop s={s}>clocks</Pop></Head></Item>
            <Item i={2}><Lead>Embedded systems live by the clock. These four keep everything on the beat.</Lead></Item>
          </>
        ),
        extra: (
          <Item i={3}>
            <Clocks
              panel={panel(s)}
              pop={s.pop}
              items={[
                { name: 'TIM3', job: 'paces the ADC', rate: '2,560 / s', spin: 0.35 },
                { name: 'TIM2', job: 'times each shaft turn', rate: '24.7 / s', spin: 1.1 },
                { name: 'SysTick', job: 'the scheduler’s heartbeat', rate: '1,000 / s', spin: 0.6 },
                { name: 'Watchdog', job: 'reboots the chip if it ever freezes', rate: '2 s timeout · fed every 0.5 s', spin: 0 },
              ]}
            />
          </Item>
        ),
      }
    case 'pipeline':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Thinking</Kicker></Item>
            <Item i={1}><Head size="lg">From wiggles to a <Pop s={s}>decision</Pop></Head></Item>
          </>
        ),
        extra: <Pipeline s={s} />,
      }
    case 'fft':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Hearing the notes</Kicker></Item>
            <Item i={1}><Head size="md">Split the shake <Pop s={s}>into notes</Pop></Head></Item>
            <Steps
              s={s}
              items={[
                <>Every 0.1 s, take the last <b>512 readings</b> (0.2 s of shaking) and soften the edges.</>,
                <>One <b>FFT</b> turns that wiggle into 5 Hz-wide “notes” from 0 to 1,280 Hz, like a stereo equaliser.</>,
                <>Loud notes are clues: <b>24.7 Hz</b> = once per turn, 49 Hz = twice, 100 Hz = electrical hum. Bearing damage rings high up.</>,
              ]}
            />
          </>
        ),
        extra: (
          <Item i={5}>
            <Screen label="Vibration spectrum · live" note="bearing fault building" height="clamp(100px, 17vh, 170px)">
              <Spectrum />
            </Screen>
          </Item>
        ),
      }
    case 'features':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Notes → numbers</Kicker></Item>
            <Item i={1}><Head size="md">Three numbers <Pop s={s}>tell the story</Pop></Head></Item>
          </>
        ),
        extra: (
          <>
            <Item i={2} className="grid max-w-[46rem] grid-cols-3 gap-2.5">
              <WaveCard kind="big" title="RMS" sub="how hard it shakes" pop={s.bg} panel={panel(s)} />
              <WaveCard kind="spiky" title="Kurtosis" sub="how spiky: cracks make clicks" pop={s.bg} panel={panel(s)} />
              <WaveCard kind="spiky" title="Crest" sub="biggest peak ÷ average" pop={s.bg} panel={panel(s)} />
            </Item>
            <Item i={3}>
              <Minis
                s={s}
                items={[
                  { label: 'RMS · live', pick: (x) => x.meas.vibRms, unit: 'g', digits: 2, note: 'healthy ≈ 0.25' },
                  { label: 'Kurtosis · live', pick: (x) => x.meas.kurt, digits: 1, note: 'healthy ≈ 2.5' },
                  { label: 'Crest · live', pick: (x) => x.meas.crest, digits: 1, note: 'healthy ≈ 2.6' },
                ]}
              />
            </Item>
            <Item i={4}><Lead>A bearing fault is building right now. Watch kurtosis climb. Also tracked: 1× and 2× notes, high-pitch share, current ripple, distortion and slip.</Lead></Item>
          </>
        ),
      }
    case 'rtos':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Doing many things at once</Kicker></Item>
            <Item i={1}><Head size="md"><Pop s={s}>Urgent</Pop> first</Head></Item>
            <Steps
              s={s}
              items={[
                <>Five jobs share one brain. Each has a <b>priority</b>: sampling (6) beats signal maths (5) beats fault checks (4)…</>,
                <>When an urgent job wakes, it <b>interrupts</b> the less urgent one on the spot. This is called pre-emptive scheduling.</>,
                <>Every job meets its deadline, and the chip is only about <b>10 % busy</b>.</>,
              ]}
            />
          </>
        ),
        extra: (
          <Item i={5}>
            <Screen label="Task timeline · live" note="last 0.3 s" height="clamp(130px, 22vh, 210px)">
              <Gantt windowMs={300} />
            </Screen>
          </Item>
        ),
      }
    case 'fsm':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Rules, not guesses</Kicker></Item>
            <Item i={1}><Head size="lg">Yellow line, <Pop s={s}>red line</Pop></Head></Item>
          </>
        ),
        extra: (
          <>
            <Item i={2} className="flex flex-wrap gap-2">
              {LIMITS.map(([k, w, c]) => (
                <span key={k} className="rounded-full px-4 py-2 font-sans text-[clamp(0.85rem,1.2vw,1.3rem)] font-bold" style={{ background: panel(s), color: '#fff' }}>
                  {k} <span style={{ color: '#ffb21e' }}>{w}</span> / <span style={{ color: '#ff5a4f' }}>{c}</span>
                </span>
              ))}
            </Item>
            <Item i={3} className="w-full">
              <FsmDiagram
                panel={panel(s)}
                rules={[
                  { from: 'STARTUP', to: 'HEALTHY', when: 'after 3.5 s; the 19 A start-up surge is ignored' },
                  { from: 'HEALTHY', to: 'WARNING', when: 'a yellow line crossed 3 checks in a row (0.3 s)' },
                  { from: 'WARNING', to: 'CRITICAL', when: 'a red line crossed 3 checks in a row' },
                  { from: 'WARNING', to: 'HEALTHY', when: '1.5 s of calm before it clears, so it can’t flicker' },
                  { from: 'CRITICAL', to: 'TRIPPED', when: 'red for 5 s with auto-trip on: the relay opens' },
                ]}
              />
            </Item>
          </>
        ),
      }
    case 'light':
      return {
        head: (
          <>
            <Item><Kicker s={s}>The answer</Kicker></Item>
            <Item i={1}><Head size="lg">A traffic light <Pop s={s}>for motors</Pop></Head></Item>
            <Steps
              s={s}
              items={[
                <><b style={{ color: '#2ee67c' }}>Green</b> = healthy. It blinks while the motor starts up.</>,
                <><b style={{ color: '#ffb21e' }}>Amber</b> + a short beep every 1.5 s = look soon.</>,
                <><b style={{ color: '#ff5a4f' }}>Red</b> + fast beeps every 0.4 s = act now.</>,
              ]}
            />
          </>
        ),
        extra: <Item i={5}><StateBadge s={s} /></Item>,
      }
    case 'faults':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Every fault has a fingerprint</Kicker></Item>
            <Item i={1}><Head size="md">Six ways <Pop s={s}>to break</Pop></Head></Item>
          </>
        ),
        extra: (
          <Item i={2}>
            <div className="grid max-w-[46rem] gap-1.5 rounded-3xl p-4" style={{ background: panel(s), color: '#fff' }}>
              {FINGERPRINTS.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[9em_1fr] items-baseline gap-3 font-sans leading-tight">
                  <span className="font-display text-[clamp(1.05rem,1.7vw,1.9rem)] font-black uppercase" style={{ color: s.bg }}>{k}</span>
                  <span className="text-[clamp(0.85rem,1.2vw,1.3rem)] font-semibold opacity-90">{v}</span>
                </div>
              ))}
            </div>
          </Item>
        ),
      }
    case 'classify':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Which fault is it?</Kicker></Item>
            <Item i={1}><Head size="md">Name <Pop s={s}>the culprit</Pop></Head></Item>
            <Steps
              s={s}
              items={[
                <>Each fault has a rule made of clues, e.g. bearing = spikiness + high-pitch energy + peakiness.</>,
                <>Every rule gives a <b>0–100 score</b>. The highest one over 25 wins, and its fix is suggested.</>,
                <>No AI: plain expert rules, so every decision can be explained. An electrical fault is on now.</>,
              ]}
            />
          </>
        ),
        extra: <Item i={5}><EvidenceBars s={s} /></Item>,
      }
    case 'wear':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Predict</Kicker></Item>
            <Item i={1}><Head size="md">Catch it <Pop s={s}>while it’s small</Pop></Head></Item>
            <Steps
              s={s}
              items={[
                <>One <b>health score</b>, 0–100. The worst reading counts most.</>,
                <>Draw a straight line through the last 30 s of scores.</>,
                <>If it keeps falling, extend the line to the danger mark and count down. In tests the forecast came ~30 s before the red alarm.</>,
              ]}
            />
          </>
        ),
        extra: (
          <>
            <Item i={5}><HealthBar s={s} /></Item>
            <Item i={6}><StateBadge s={s} /></Item>
          </>
        ),
      }
    case 'trip':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Protect</Kicker></Item>
            <Item i={1}><Head size="md">Red? <Pop s={s}>Switch it off.</Pop></Head></Item>
            <Steps
              s={s}
              items={[
                <>With auto-trip on, the firmware waits a set time in red: 5 s by default, 1.5 s in this demo.</>,
                <>Then it opens the <b>contactor relay</b> and the motor loses power within 10 ms.</>,
                <>The trip <b>latches</b>. It stays off until a person resets it.</>,
              ]}
            />
          </>
        ),
        extra: <Item i={5}><StateBadge s={s} /></Item>,
      }
    case 'comms':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Talking to the laptop</Kicker></Item>
            <Item i={1}><Head size="lg">24 bytes, <Pop s={s}>every second</Pop></Head></Item>
          </>
        ),
        extra: (
          <Item i={2} className="w-full">
            <FrameDiagram
              panel={panel(s)}
              pop={s.pop}
              fields={FRAME}
              foot="Starts with the sync bytes A5 5A. Sent over UART at 115,200 baud, so the whole frame crosses the wire in 2.08 ms. A CRC-16 checksum seals it. Right now noise is flipping random bits: damaged frames fail the check and are thrown away."
            />
          </Item>
        ),
      }
    case 'memory':
      return {
        head: (
          <>
            <Item><Kicker s={s}>Remembering</Kicker></Item>
            <Item i={1}><Head size="md">A diary that <Pop s={s}>never fills up</Pop></Head></Item>
            <Steps
              s={s}
              items={[
                <><b>Ring buffers</b> keep the last 1 s of raw readings and 2 minutes of trends. New data overwrites the oldest.</>,
                <>Key events (boot, alarms, trips, forecasts) go into a <b>256-slot log</b> in flash memory: 4 KB.</>,
                <>When it is full it wraps around and overwrites the oldest, like a dashcam loop.</>,
              ]}
            />
          </>
        ),
        extra: <Item i={5}><RingLog panel={panel(s)} pop={s.pop} caption="The write head goes round and round: the oldest record is always the next one replaced." /></Item>,
      }
    case 'latency':
      return {
        head: (
          <>
            <Item><Kicker s={s}>How fast?</Kicker></Item>
            <Item i={1}><Head size="lg">Fault to warning <Pop s={s}>in ⅓ s</Pop></Head></Item>
          </>
        ),
        extra: (
          <>
            <Item i={2} className="w-full">
              <LatencyChain
                panel={panel(s)}
                pop={s.pop}
                total="Worst case ≈ 0.63 s · typical ≈ 0.31 s · target < 1 s"
                stages={[
                  { label: 'wait for the next buffer', ms: 25, c: '#5ad7ff' },
                  { label: 'fill a 0.2 s window', ms: 200, c: '#9ec5ff' },
                  { label: 'FFT + features', ms: 6, c: '#b79cff' },
                  { label: 'smoothing', ms: 100, c: '#ffb3f0' },
                  { label: '3 checks in a row', ms: 300, c: '#ffb21e' },
                ]}
              />
            </Item>
            <Item i={3}><DetectDemo s={s} /></Item>
          </>
        ),
      }
    case 'numbers':
      return {
        head: (
          <>
            <Item><Kicker s={s}>The proof</Kicker></Item>
            <Item i={1}><Head size="lg">Healthy vs <Pop s={s}>struggling</Pop></Head></Item>
          </>
        ),
        extra: (
          <Item i={2}>
            <div className="grid w-[min(36rem,92%)] grid-cols-[1.3fr_1fr_1fr] gap-x-4 gap-y-2 rounded-3xl p-5 font-sans" style={{ background: panel(s), color: '#fff' }}>
              {['', 'Healthy', 'Overloaded'].map((h) => (
                <div key={h} className="font-mono text-[clamp(10px,1vw,14px)] font-bold uppercase tracking-[0.14em] opacity-70">{h}</div>
              ))}
              {[
                ['Temperature', '55 °C', '78 °C'],
                ['Vibration', '0.25 g', '0.40 g'],
                ['Current', '4.2 A', '7.8 A'],
                ['Speed', '1480 rpm', '1350 rpm'],
              ].map(([k, a, b]) => (
                <div key={k} className="contents">
                  <div className="text-[clamp(1rem,1.5vw,1.6rem)] font-semibold opacity-90">{k}</div>
                  <div className="font-display text-[clamp(1.5rem,2.5vw,2.8rem)] font-black leading-none" style={{ color: '#2ee67c' }}>{a}</div>
                  <div className="font-display text-[clamp(1.5rem,2.5vw,2.8rem)] font-black leading-none" style={{ color: '#ffb21e' }}>{b}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 font-sans text-[clamp(1.1rem,1.8vw,2rem)] font-bold">
              Warning raised in about <Pop s={s}>⅓ of a second</Pop>, using ~10 % of the chip.
            </p>
          </Item>
        ),
      }
    case 'concepts':
      return {
        head: (
          <>
            <Item><Kicker s={s}>What we built</Kicker></Item>
            <Item i={1}><Head size="lg">Every idea, <Pop s={s}>running live</Pop></Head></Item>
          </>
        ),
        extra: (
          <Item i={2} className="flex max-w-[90rem] flex-wrap gap-3">
            {['Real-time sensing', 'ADC', 'DMA', 'Timers', 'Interrupts', 'RTOS', 'Task priorities', 'Serial protocol + CRC', 'Signal processing (FFT)', 'Fault detection', 'State machine', 'Data logging', 'Fast response'].map((t, i) => (
              <motion.span
                key={t}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.07, type: 'spring', stiffness: 260, damping: 16 }}
                className="rounded-full px-5 py-2.5 font-sans font-bold"
                style={{ fontSize: 'clamp(1rem,1.7vw,1.9rem)', background: i % 2 ? s.pop : '#fff', color: '#1a0b2e' }}
              >
                {t}
              </motion.span>
            ))}
          </Item>
        ),
      }
    case 'thanks':
      return {
        head: (
          <>
            <Item><Kicker s={s}>The end</Kicker></Item>
            <Item i={1}><Head>Thank <Pop s={s}>you!</Pop></Head></Item>
            <Item i={2}><Body>No hardware needed. It all runs as a live simulation. Break the motor yourself.</Body></Item>
            <Item i={3} className="flex flex-wrap gap-3">
              <Link href="/vigil/control-room" className="pointer-events-auto rounded-full px-8 py-4 font-display text-[clamp(1.4rem,2.2vw,2.4rem)] font-black uppercase leading-none" style={{ background: s.ink, color: s.bg }}>
                Open the control room →
              </Link>
            </Item>
          </>
        ),
      }
  }
  return { head: null }
}

const STEPS = [
  ['Sample', '2,560 readings a second per channel'],
  ['Collect', 'DMA fills buffers, 25 ms at a time'],
  ['FFT', 'every 0.1 s, split 0.2 s of shaking into notes'],
  ['Features', 'boil it all down to about ten numbers'],
  ['Decide', 'limits, 3 checks in a row, name the fault'],
]

function Pipeline({ s }: { s: SlideDef }) {
  return (
    <div className="grid w-full max-w-[110rem] grid-cols-2 gap-3 md:grid-cols-5">
      {STEPS.map(([a, b], i) => (
        <Item key={a} i={2 + i}>
          <div className="relative overflow-hidden rounded-3xl p-5" style={{ background: panel(s), color: '#fff', minHeight: '9rem' }}>
            <div className="absolute inset-0" style={{ background: s.pop, opacity: 0, animation: `pres-flash 5s ${i}s infinite` }} />
            <div className="relative">
              <div className="font-mono text-[clamp(10px,1vw,14px)] font-bold tracking-[0.14em] opacity-70">STEP {i + 1}</div>
              <div className="font-display text-[clamp(1.8rem,3vw,3.2rem)] font-black uppercase leading-none">{a}</div>
              <div className="mt-2 font-sans text-[clamp(0.9rem,1.25vw,1.4rem)] font-semibold leading-tight opacity-90">{b}</div>
            </div>
          </div>
        </Item>
      ))}
      <style>{`
        @keyframes pres-flash { 0%{opacity:0} 4%{opacity:.95} 18%{opacity:.95} 24%{opacity:0} 100%{opacity:0} }
      `}</style>
    </div>
  )
}
