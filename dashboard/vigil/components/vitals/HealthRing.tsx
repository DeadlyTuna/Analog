'use client'

import { useSnap } from '@vigil/components/sim/SimProvider'
import { C } from '@vigil/lib/theme'
import { fmt } from '@vigil/lib/utils'

const R = 84
const SWEEP = 270
const START = 135
const CIRC = 2 * Math.PI * R
const ARC = (SWEEP / 360) * CIRC

const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180
  // rounded so server- and client-rendered markup is byte-identical
  return [Math.round((110 + r * Math.cos(a)) * 100) / 100, Math.round((110 + r * Math.sin(a)) * 100) / 100] as const
}

/** The health index as a 270° dial. The needle-less arc fills and re-colours as the motor degrades. */
export function HealthRing({ size = 236 }: { size?: number }) {
  const hi = useSnap((s) => s.health.hi)
  const state = useSnap((s) => s.state)
  const valid = state === 'HEALTHY' || state === 'WARNING' || state === 'CRITICAL' || state === 'STARTUP'
  const value = valid ? hi : 0
  const color = !valid ? C.ink400 : state === 'STARTUP' ? C.forecast : value >= 70 ? C.go : value >= 40 ? C.caution : C.stop
  const frac = Math.max(0, Math.min(1, value / 100))
  const ticks = Array.from({ length: 51 }, (_, i) => i)

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox="0 0 220 220" width={size} height={size} role="img" aria-label={`Health index ${fmt(value, 0)} percent`}>
        <defs>
          <filter id="ring-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* slow scanner ring */}
        <g style={{ transformOrigin: '110px 110px', animation: 'spin-slow 40s linear infinite' }}>
          <circle cx="110" cy="110" r="105" fill="none" stroke="rgba(235,232,222,0.08)" strokeWidth="1" strokeDasharray="2 7" />
        </g>

        {/* ticks */}
        {ticks.map((i) => {
          const deg = START + (i / 50) * SWEEP
          const major = i % 5 === 0
          const [x1, y1] = polar(deg, R + 9)
          const [x2, y2] = polar(deg, R + (major ? 15 : 12))
          const lit = i / 50 <= frac + 1e-6
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={lit ? color : 'rgba(235,232,222,0.16)'}
              strokeOpacity={lit ? (major ? 0.95 : 0.55) : 1}
              strokeWidth={major ? 1.6 : 1}
              style={{ transition: 'stroke 400ms' }}
            />
          )
        })}

        {/* track */}
        <circle
          cx="110"
          cy="110"
          r={R}
          fill="none"
          stroke="rgba(235,232,222,0.07)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${ARC} ${CIRC}`}
          transform={`rotate(${START} 110 110)`}
        />
        {/* glow + value arc */}
        <circle
          cx="110"
          cy="110"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${ARC * frac} ${CIRC}`}
          transform={`rotate(${START} 110 110)`}
          filter="url(#ring-glow)"
          opacity="0.55"
          style={{ transition: 'stroke-dasharray 600ms cubic-bezier(.2,.7,.2,1), stroke 400ms' }}
        />
        <circle
          cx="110"
          cy="110"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${ARC * frac} ${CIRC}`}
          transform={`rotate(${START} 110 110)`}
          style={{ transition: 'stroke-dasharray 600ms cubic-bezier(.2,.7,.2,1), stroke 400ms' }}
        />

        {/* limit marks: 70 = warning, 30 = critical */}
        {[70, 30].map((v) => {
          const deg = START + (v / 100) * SWEEP
          const [x1, y1] = polar(deg, R - 10)
          const [x2, y2] = polar(deg, R + 7)
          return <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} stroke={v === 70 ? C.caution : C.stop} strokeWidth="2" strokeLinecap="round" />
        })}
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="label">Health index</span>
        <span className="stencil mt-1 text-[78px] leading-[0.8] tabular" style={{ color: valid ? C.bone : C.steel3 }}>
          {valid ? fmt(value, 0) : '—'}
        </span>
        <span className="mono mt-2 text-[11px] tracking-[0.12em] text-steel-300">/ 100</span>
      </div>
    </div>
  )
}
