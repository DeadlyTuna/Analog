'use client'

/**
 * Animated explainer diagrams for the presentation. Each one is self-contained and sized by its parent;
 * numbers come in as props so the slide copy and the drawing always agree.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { shallowEqual, useSnap } from '@vigil/components/sim/SimProvider'
import type { FsmState } from '@vigil/lib/sim/config'
import { C } from '@vigil/lib/theme'

/** Re-renders every `ms` and returns a step counter (cheaper than per-frame state). */
function useTicker(ms: number) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setN((x) => x + 1), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return n
}

const MONO = 'var(--font-mono)'
const DISPLAY = 'var(--font-display)'

/* ------------------------------------------------------------------ */
/* Frame for live canvases                                             */
/* ------------------------------------------------------------------ */

export function Screen({ label, note, height = 200, children, bg = '#0d0b1e' }: { label: string; note?: string; height?: number | string; children: ReactNode; bg?: string }) {
  return (
    <div className="overflow-hidden rounded-3xl" style={{ background: bg, color: '#fff', boxShadow: '0 18px 40px -22px rgba(0,0,0,.55)' }}>
      <div className="flex items-center justify-between gap-4 px-5 pb-1 pt-3 font-mono text-[clamp(9px,0.85vw,12px)] font-bold uppercase tracking-[0.14em]">
        <span className="flex shrink-0 items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: '#ff3b5c', animation: 'pres-pulse 1.2s ease-in-out infinite' }} />
          {label}
        </span>
        {note && <span className="min-w-0 truncate opacity-60">{note}</span>}
      </div>
      <div className="px-3 pb-3" style={{ height }}>
        {children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* ADC sampling: smooth voltage → evenly spaced dots → 12-bit numbers  */
/* ------------------------------------------------------------------ */

export function SamplingDiagram({ ink, pop, panel, bits = 12, vref = 3.3 }: { ink: string; pop: string; panel: string; bits?: number; vref?: number }) {
  const wave = useRef<SVGPathElement>(null)
  const stems = useRef<SVGGElement>(null)
  const readV = useRef<SVGTextElement>(null)
  const readN = useRef<SVGTextElement>(null)
  const readB = useRef<SVGTextElement>(null)
  const W = 620
  const H = 210
  const mid = 92
  const amp = 62
  const step = 30
  const full = 2 ** bits - 1

  useEffect(() => {
    let raf = 0
    const f = (x: number, t: number) => Math.sin(x * 0.045 - t * 2.1) * 0.62 + Math.sin(x * 0.13 - t * 3.4) * 0.25 + Math.sin(x * 0.31 - t * 5.0) * 0.08
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop)
      const t = ms / 1000
      let d = ''
      for (let x = 0; x <= W - 150; x += 4) d += `${x ? 'L' : 'M'}${x},${(mid - f(x, t) * amp).toFixed(1)}`
      wave.current?.setAttribute('d', d)
      const g = stems.current
      if (g) {
        const kids = g.children
        for (let i = 0; i < kids.length; i++) {
          const x = i * step + 6
          const y = mid - f(x, t) * amp
          const line = kids[i].children[0] as SVGLineElement
          const dot = kids[i].children[1] as SVGCircleElement
          line.setAttribute('y2', y.toFixed(1))
          dot.setAttribute('cy', y.toFixed(1))
        }
        const lastX = (kids.length - 1) * step + 6
        const v = f(lastX, t)
        const volts = ((v + 1) / 2) * vref
        const code = Math.round(((v + 1) / 2) * full)
        if (readV.current) readV.current.textContent = `${volts.toFixed(2)} V`
        if (readN.current) readN.current.textContent = String(code)
        if (readB.current) readB.current.textContent = code.toString(2).padStart(bits, '0').replace(/(.{4})(?=.)/g, '$1 ')
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [bits, vref, full])

  const n = Math.floor((W - 150) / step) + 1
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 680 }}>
      <rect x="0" y="0" width={W} height={H} rx="22" fill={panel} />
      <g transform="translate(18,14)">
        <line x1="0" x2={W - 150} y1={mid} y2={mid} stroke="#fff" strokeOpacity=".15" />
        <path ref={wave} fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="3" />
        <g ref={stems}>
          {Array.from({ length: n }, (_, i) => (
            <g key={i}>
              <line x1={i * step + 6} x2={i * step + 6} y1={mid} y2={mid} stroke={pop} strokeWidth="2.5" />
              <circle cx={i * step + 6} cy={mid} r="5.5" fill={pop} />
            </g>
          ))}
        </g>
        <text x="0" y={H - 32} fill="#fff" fillOpacity=".7" style={{ font: `700 12px ${MONO}`, letterSpacing: '.12em' }}>
          SMOOTH VOLTAGE  →  A DOT EVERY TICK
        </text>
      </g>
      {/* readout */}
      <g transform={`translate(${W - 128},20)`}>
        <rect width="112" height={H - 40} rx="16" fill="#fff" fillOpacity=".08" />
        <text x="56" y="28" textAnchor="middle" fill="#fff" fillOpacity=".65" style={{ font: `700 10px ${MONO}`, letterSpacing: '.14em' }}>
          VOLTAGE
        </text>
        <text ref={readV} x="56" y="52" textAnchor="middle" fill="#fff" style={{ font: `800 20px ${DISPLAY}` }} />
        <text x="56" y="82" textAnchor="middle" fill="#fff" fillOpacity=".65" style={{ font: `700 10px ${MONO}`, letterSpacing: '.14em' }}>
          NUMBER
        </text>
        <text ref={readN} x="56" y="114" textAnchor="middle" fill={pop} style={{ font: `900 34px ${DISPLAY}` }} />
        <text ref={readB} x="56" y="142" textAnchor="middle" fill="#fff" fillOpacity=".8" style={{ font: `600 8.5px ${MONO}` }} />
      </g>
      <text x={W - 72} y={H - 8} textAnchor="middle" fill={ink} style={{ font: `700 10px ${MONO}` }} />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* DMA ping-pong buffer                                                */
/* ------------------------------------------------------------------ */

export function PingPong({ pop, panel, halfLabel = '64 samples', cells = 16 }: { pop: string; panel: string; halfLabel?: string; cells?: number }) {
  const n = useTicker(110)
  const total = cells * 2
  const pos = n % total
  const half = pos < cells ? 0 : 1
  // the other half is "being processed" for a while after it filled up
  const doneAgo = pos % cells
  const processing = doneAgo < cells * 0.7 && n >= cells ? 1 - half : -1
  return (
    <div className="w-full max-w-[42rem] rounded-3xl p-5" style={{ background: panel, color: '#fff' }}>
      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((h) => (
          <div key={h}>
            <div className="mb-2 flex items-center justify-between gap-2 whitespace-nowrap font-mono text-[clamp(9px,0.9vw,12px)] font-bold uppercase tracking-[0.12em]">
              <span>Half {h ? 'B' : 'A'}</span>
              {processing === h && <span style={{ color: pop }}>CPU reading</span>}
              {half === h && <span className="opacity-70">DMA filling</span>}
            </div>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cells / 2}, 1fr)` }}>
              {Array.from({ length: cells }, (_, k) => {
                const idx = h * cells + k
                const filled = half === h ? idx <= pos : processing === h ? true : false
                const head = idx === pos
                return (
                  <span
                    key={k}
                    className="aspect-square rounded-md transition-colors duration-150"
                    style={{
                      background: head ? '#fff' : filled ? (processing === h ? pop : '#6b7cff') : 'rgba(255,255,255,.1)',
                      boxShadow: head ? '0 0 14px #fff' : undefined,
                    }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3 font-sans text-[clamp(0.85rem,1.15vw,1.25rem)] font-semibold">
        <span
          key={Math.floor(n / cells)}
          className="rounded-full px-3 py-1 font-mono text-[clamp(10px,0.95vw,13px)] font-bold"
          style={{ background: pop, color: panel, animation: 'pres-ring .6s ease-out' }}
        >
          IRQ
        </span>
        <span>
          Half {half ? 'A' : 'B'} full ({halfLabel}) → interrupt → the CPU reads it while DMA fills half {half ? 'B' : 'A'}.
        </span>
      </div>
      <style>{`@keyframes pres-ring { 0%{transform:scale(1.6);filter:brightness(2)} 100%{transform:scale(1)} }`}</style>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* System map: sensors → MCU → outputs                                 */
/* ------------------------------------------------------------------ */

const SENSORS = [
  { k: 'Vibration', s: 'accelerometer', c: C.vib },
  { k: 'Temperature', s: 'winding sensor', c: C.temp },
  { k: 'Current', s: 'clamp on the cable', c: C.cur },
  { k: 'Speed', s: 'magnet + pickup', c: '#ffe14d' },
]
const OUTS = [
  { k: 'Stack light', s: 'green / amber / red', c: C.go },
  { k: 'Buzzer', s: 'audible alarm', c: C.caution },
  { k: 'Contactor relay', s: 'cuts the power', c: C.stop },
  { k: 'Laptop dashboard', s: 'serial link', c: '#9ec5ff' },
]

export function SystemMap({ panel, pop, mcuLines }: { panel: string; pop: string; mcuLines: string[] }) {
  const W = 1000
  const H = 330
  const rowY = (i: number) => 32 + i * 72
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 1100 }}>
      <rect width={W} height={H} rx="26" fill={panel} />
      {SENSORS.map((s, i) => (
        <g key={s.k}>
          <path id={`sm-in-${i}`} d={`M250,${rowY(i) + 26} C330,${rowY(i) + 26} 330,165 400,165`} fill="none" stroke={s.c} strokeWidth="3" strokeOpacity=".55" />
          <circle r="7" fill={s.c}>
            <animateMotion dur={`${1.4 + i * 0.25}s`} repeatCount="indefinite">
              <mpath href={`#sm-in-${i}`} />
            </animateMotion>
          </circle>
          <rect x="24" y={rowY(i)} width="226" height="52" rx="14" fill={s.c} />
          <text x="40" y={rowY(i) + 24} fill="#0d0b1e" style={{ font: `900 21px ${DISPLAY}`, textTransform: 'uppercase' }}>
            {s.k}
          </text>
          <text x="40" y={rowY(i) + 42} fill="#0d0b1e" fillOpacity=".75" style={{ font: `600 12px var(--font-sans)` }}>
            {s.s}
          </text>
        </g>
      ))}
      {OUTS.map((o, i) => (
        <g key={o.k}>
          <path id={`sm-out-${i}`} d={`M600,165 C670,165 670,${rowY(i) + 26} 750,${rowY(i) + 26}`} fill="none" stroke={o.c} strokeWidth="3" strokeOpacity=".55" />
          <circle r="7" fill={o.c}>
            <animateMotion dur={`${1.6 + i * 0.3}s`} repeatCount="indefinite">
              <mpath href={`#sm-out-${i}`} />
            </animateMotion>
          </circle>
          <rect x="750" y={rowY(i)} width="226" height="52" rx="14" fill="none" stroke={o.c} strokeWidth="3" />
          <text x="768" y={rowY(i) + 24} fill="#fff" style={{ font: `900 21px ${DISPLAY}`, textTransform: 'uppercase' }}>
            {o.k}
          </text>
          <text x="768" y={rowY(i) + 42} fill="#fff" fillOpacity=".7" style={{ font: `600 12px var(--font-sans)` }}>
            {o.s}
          </text>
        </g>
      ))}
      <rect x="400" y="40" width="200" height="250" rx="22" fill={pop} />
      <text x="500" y="82" textAnchor="middle" fill="#0d0b1e" style={{ font: `900 30px ${DISPLAY}` }}>
        MCU
      </text>
      {mcuLines.map((l, i) => (
        <g key={l}>
          <rect x="418" y={100 + i * 36} width="164" height="28" rx="8" fill="#0d0b1e" fillOpacity=".86" />
          <text x="500" y={119 + i * 36} textAnchor="middle" fill="#fff" style={{ font: `700 12px ${MONO}` }}>
            {l}
          </text>
        </g>
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Smooth vs spiky waves (RMS / kurtosis / crest)                      */
/* ------------------------------------------------------------------ */

export function WaveCard({ kind, title, sub, pop, panel }: { kind: 'smooth' | 'spiky' | 'big'; title: string; sub: string; pop: string; panel: string }) {
  const W = 260
  const H = 90
  let d = ''
  for (let x = 0; x <= W; x += 2) {
    let y = Math.sin(x * 0.12) * (kind === 'big' ? 30 : 16)
    if (kind === 'spiky') {
      const ph = x % 52
      if (ph < 6) y += (ph < 3 ? -1 : 1) * 36 * Math.exp(-ph / 3)
      y *= 0.9
    }
    d += `${x ? 'L' : 'M'}${x},${(H / 2 - y).toFixed(1)}`
  }
  return (
    <div className="rounded-2xl p-3" style={{ background: panel, color: '#fff' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#fff" strokeOpacity=".15" />
        <path d={d} fill="none" stroke={pop} strokeWidth="3" strokeLinejoin="round">
          <animate attributeName="stroke-dasharray" from="0,1200" to="1200,0" dur="1.4s" fill="freeze" />
        </path>
      </svg>
      <div className="mt-1 font-display text-[clamp(1.2rem,1.9vw,2rem)] font-black uppercase leading-none">{title}</div>
      <div className="mt-1 font-sans text-[clamp(0.8rem,1.05vw,1.15rem)] font-semibold leading-tight opacity-85">{sub}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Live state machine                                                  */
/* ------------------------------------------------------------------ */

const FSM_COL: Record<FsmState, string> = { OFF: '#8a8f98', STARTUP: '#5c9dff', HEALTHY: '#2ee67c', WARNING: '#ffb21e', CRITICAL: '#ff3b30', TRIPPED: '#ff3b30' }

export function FsmDiagram({ panel, rules }: { panel: string; rules: { from: FsmState; to: FsmState; when: string }[] }) {
  const state = useSnap((s) => s.state)
  const order: FsmState[] = ['STARTUP', 'HEALTHY', 'WARNING', 'CRITICAL', 'TRIPPED']
  return (
    <div className="w-full max-w-[110rem] rounded-3xl p-5" style={{ background: panel, color: '#fff' }}>
      <div className="flex flex-wrap items-center gap-2">
        {order.map((st, i) => {
          const on = st === state
          return (
            <div key={st} className="flex items-center gap-2">
              <div
                className="rounded-2xl px-4 py-3 font-display font-black uppercase leading-none transition-all duration-300"
                style={{
                  fontSize: 'clamp(1.1rem, 2vw, 2.2rem)',
                  background: on ? FSM_COL[st] : 'rgba(255,255,255,.07)',
                  color: on ? '#0d0b1e' : FSM_COL[st],
                  boxShadow: on ? `0 0 34px ${FSM_COL[st]}` : undefined,
                  transform: on ? 'scale(1.08)' : undefined,
                }}
              >
                {st}
              </div>
              {i < order.length - 1 && <span className="text-[clamp(1rem,1.8vw,2rem)] font-black opacity-60">→</span>}
            </div>
          )
        })}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-2 md:grid-cols-2">
        {rules.map((r) => (
          <li key={r.from + r.to} className="flex items-baseline gap-3 font-sans text-[clamp(0.85rem,1.15vw,1.25rem)] font-semibold leading-tight">
            <span className="shrink-0 font-mono text-[0.8em] font-bold" style={{ color: FSM_COL[r.to] }}>
              {r.from.slice(0, 4)} → {r.to.slice(0, 4)}
            </span>
            <span className="opacity-90">{r.when}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Serial frame                                                        */
/* ------------------------------------------------------------------ */

export function FrameDiagram({ panel, pop, fields, foot }: { panel: string; pop: string; fields: { label: string; size: string; c: string }[]; foot: string }) {
  const host = useSnap((s) => ({ ok: s.host.rxOk, bad: s.host.crcErr }), shallowEqual)
  return (
    <div className="w-full max-w-[110rem] rounded-3xl p-5" style={{ background: panel, color: '#fff' }}>
      <div className="flex w-full overflow-hidden rounded-2xl">
        {fields.map((f, i) => (
          <div key={f.label} className="relative min-w-0 flex-1 px-[clamp(4px,0.6vw,12px)] py-3" style={{ background: f.c, color: '#0d0b1e', animation: `pres-byte 2.4s ${i * 0.12}s ease-in-out infinite` }}>
            <div className="truncate font-display text-[clamp(0.8rem,1.25vw,1.6rem)] font-black uppercase leading-none">{f.label}</div>
            <div className="mt-1 truncate font-mono text-[clamp(9px,0.85vw,12px)] font-bold">{f.size}</div>
          </div>
        ))}
      </div>
      <div className="relative mt-5 h-3 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.12)' }}>
        <div className="absolute inset-y-0 w-24 rounded-full" style={{ background: pop, boxShadow: `0 0 18px ${pop}`, animation: 'pres-wire 1.6s linear infinite' }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-3 font-mono text-[clamp(10px,0.95vw,13px)] font-bold uppercase tracking-[0.12em]">
        <span>MCU ▸ ▸ ▸ laptop</span>
        <span>
          frames ok <span style={{ color: pop }}>{host.ok}</span> · rejected <span style={{ color: '#ff6b6b' }}>{host.bad}</span>
        </span>
      </div>
      <p className="mt-3 font-sans text-[clamp(0.85rem,1.15vw,1.25rem)] font-semibold leading-tight opacity-90">{foot}</p>
      <style>{`
        @keyframes pres-wire { 0%{left:-6rem} 100%{left:100%} }
        @keyframes pres-byte { 0%,100%{filter:none} 50%{filter:brightness(1.18)} }
      `}</style>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Ring buffer log                                                     */
/* ------------------------------------------------------------------ */

export function RingLog({ panel, pop, slots = 24, caption }: { panel: string; pop: string; slots?: number; caption: string }) {
  const n = useTicker(260)
  const head = n % slots
  const lapped = n >= slots
  const flash = useSnap((s) => s.flash, shallowEqual)
  const R = 92
  return (
    <div className="flex w-full max-w-[42rem] items-center gap-5 rounded-3xl p-5" style={{ background: panel, color: '#fff' }}>
      <svg viewBox="-120 -120 240 240" className="w-[42%] shrink-0">
        {Array.from({ length: slots }, (_, i) => {
          const a = (i / slots) * Math.PI * 2 - Math.PI / 2
          const age = (head - i + slots) % slots
          const written = lapped || i <= head
          return (
            <circle
              key={i}
              cx={Math.cos(a) * R}
              cy={Math.sin(a) * R}
              r={i === head ? 13 : 9.5}
              fill={i === head ? '#fff' : written ? pop : 'rgba(255,255,255,.12)'}
              fillOpacity={i === head ? 1 : written ? Math.max(0.25, 1 - age / slots) : 1}
            />
          )
        })}
        <text textAnchor="middle" y="-6" fill="#fff" style={{ font: `900 30px ${DISPLAY}` }}>
          {flash.writes}
        </text>
        <text textAnchor="middle" y="16" fill="#fff" fillOpacity=".7" style={{ font: `700 10px ${MONO}`, letterSpacing: '.14em' }}>
          RECORDS
        </text>
      </svg>
      <div className="font-sans text-[clamp(0.9rem,1.25vw,1.35rem)] font-semibold leading-tight">
        <p>{caption}</p>
        <p className="mt-3 font-mono text-[clamp(10px,0.9vw,12px)] font-bold uppercase tracking-[0.12em] opacity-70">
          wraps so far: {flash.wraps}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Latency chain                                                       */
/* ------------------------------------------------------------------ */

export function LatencyChain({ panel, pop, stages, total }: { panel: string; pop: string; stages: { label: string; ms: number; c: string }[]; total: string }) {
  const sum = stages.reduce((a, s) => a + s.ms, 0)
  return (
    <div className="w-full max-w-[110rem] rounded-3xl p-5" style={{ background: panel, color: '#fff' }}>
      <div className="relative flex w-full gap-1">
        {stages.map((s, i) => (
          <div key={s.label} style={{ flexGrow: Math.max(s.ms, sum * 0.07), flexBasis: 0 }}>
            <div className="h-14 rounded-xl" style={{ background: s.c, animation: `pres-lat 3.6s ${(i * 3.6) / stages.length / 2}s ease-in-out infinite` }} />
            <div className="mt-2 font-display text-[clamp(1rem,1.7vw,1.9rem)] font-black leading-none">{s.ms < 1 ? `${(s.ms * 1000).toFixed(0)} µs` : `${s.ms.toFixed(s.ms < 10 ? 1 : 0)} ms`}</div>
            <div className="mt-1 font-sans text-[clamp(0.75rem,1vw,1.1rem)] font-semibold leading-tight opacity-85">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 font-display text-[clamp(1.4rem,2.6vw,2.8rem)] font-black uppercase leading-none" style={{ color: pop }}>
        {total}
      </div>
      <style>{`@keyframes pres-lat { 0%,100%{opacity:.55} 50%{opacity:1} }`}</style>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Timers: four clock faces (spin = seconds per hand revolution, 0 = watchdog bar) */
/* ------------------------------------------------------------------ */

export function Clocks({ panel, pop, items }: { panel: string; pop: string; items: { name: string; job: string; rate: string; spin: number }[] }) {
  return (
    <div className="grid max-w-[46rem] grid-cols-2 gap-2.5">
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-3 rounded-2xl p-3" style={{ background: panel, color: '#fff' }}>
          {it.spin > 0 ? (
            <svg viewBox="-30 -30 60 60" className="h-[clamp(3rem,5vw,4.6rem)] w-[clamp(3rem,5vw,4.6rem)] shrink-0">
              <circle r="27" fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth="3" />
              {Array.from({ length: 12 }, (_, k) => (
                <line key={k} x1="0" y1="-22" x2="0" y2="-26" stroke="#fff" strokeOpacity=".5" strokeWidth="2" transform={`rotate(${k * 30})`} />
              ))}
              <g style={{ animation: `spin-slow ${it.spin}s linear infinite`, transformOrigin: '0 0' }}>
                <line x1="0" y1="4" x2="0" y2="-21" stroke={pop} strokeWidth="4" strokeLinecap="round" />
              </g>
              <circle r="3.5" fill={pop} />
            </svg>
          ) : (
            <div className="relative h-[clamp(3rem,5vw,4.6rem)] w-[clamp(3rem,5vw,4.6rem)] shrink-0 overflow-hidden rounded-xl" style={{ background: 'rgba(255,255,255,.12)' }}>
              <div className="absolute inset-x-0 bottom-0" style={{ background: pop, height: '100%', transformOrigin: 'bottom', animation: 'pres-feed 0.5s linear infinite' }} />
              <span className="absolute inset-0 grid place-items-center font-display text-[1.6em] font-black" style={{ color: panel }}>
                🐕
              </span>
            </div>
          )}
          <div className="min-w-0">
            <div className="font-display text-[clamp(1.3rem,2.1vw,2.3rem)] font-black uppercase leading-none">{it.name}</div>
            <div className="mt-0.5 font-sans text-[clamp(0.8rem,1.05vw,1.15rem)] font-semibold leading-tight opacity-90">{it.job}</div>
            <div className="mt-1 font-mono text-[clamp(9px,0.85vw,12px)] font-bold" style={{ color: pop }}>
              {it.rate}
            </div>
          </div>
        </div>
      ))}
      <style>{`@keyframes pres-feed { 0%{transform:scaleY(1)} 100%{transform:scaleY(.75)} }`}</style>
    </div>
  )
}
