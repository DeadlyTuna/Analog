'use client'

import { shallowEqual, useSnap } from '@vigil/components/sim/SimProvider'
import { CLASS_META } from '@vigil/lib/sim/config'
import { C } from '@vigil/lib/theme'
import { cn, fmt } from '@vigil/lib/utils'

/**
 * The signal path, top to bottom: motor → sensors → MCU → data processing → fault-detection engine →
 * healthy / abnormal → classification → warning · critical · prediction. Every lamp is driven by live firmware state.
 */

function Edge({ d, on, color = C.bone, packets = true, delay = 0 }: { d: string; on: boolean; color?: string; packets?: boolean; delay?: number }) {
  return (
    <g>
      <path d={d} fill="none" stroke={C.ink600} strokeWidth="2" strokeLinejoin="round" />
      {on && <path d={d} fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.85" strokeDasharray="4 8" strokeLinejoin="round" style={{ animation: 'flow 0.7s linear infinite' }} />}
      {on && packets && (
        <circle r="2.6" fill={color}>
          <animateMotion dur="1.5s" begin={`${delay}s`} repeatCount="indefinite" path={d} />
        </circle>
      )}
    </g>
  )
}

function Node({
  x,
  y,
  w,
  h,
  title,
  value,
  sub,
  color = C.bone,
  lit = true,
  strong = false,
  small = false,
}: {
  x: number
  y: number
  w: number
  h: number
  title: string
  value?: string
  sub?: string
  color?: string
  lit?: boolean
  strong?: boolean
  small?: boolean
}) {
  return (
    <g style={{ transition: 'opacity 300ms' }} opacity={lit ? 1 : 0.5}>
      {lit && strong && <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx="12" fill={color} opacity="0.18" filter="url(#pl-glow)" />}
      <rect x={x} y={y} width={w} height={h} rx="10" fill={lit && strong ? `${color}14` : C.ink800} stroke={lit && strong ? color : C.ink500} strokeWidth={lit && strong ? 1.5 : 1} style={{ transition: 'stroke 300ms, fill 300ms' }} />
      <text x={x + w / 2} y={y + (small ? 17 : 19)} textAnchor="middle" className="diagram-text" fontSize={small ? 8.5 : 9.5} fill={lit && strong ? color : C.steel3} fontWeight="600">
        {title}
      </text>
      {value && (
        <text x={x + w / 2} y={y + h / 2 + (sub ? 8 : 9)} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={small ? 12 : 14} fill={C.bone} fontWeight="500" style={{ fontStretch: '80%' }}>
          {value}
        </text>
      )}
      {sub && (
        <text x={x + w / 2} y={y + h - 10} textAnchor="middle" className="diagram-text" fontSize="8.5" fill={C.steel3}>
          {sub}
        </text>
      )}
    </g>
  )
}

export function Pipeline({ className }: { className?: string }) {
  const state = useSnap((s) => s.state)
  const paused = useSnap((s) => s.paused)
  const meas = useSnap((s) => s.meas, shallowEqual)
  const cpu = useSnap((s) => s.rtos.cpuLoad)
  const diag = useSnap((s) => s.diag, shallowEqual)
  const predicting = useSnap((s) => s.health.predicting)
  const rpm = useSnap((s) => Math.round(s.truth.rpm))

  const running = state !== 'OFF' && state !== 'TRIPPED' && !paused
  const judging = state === 'HEALTHY' || state === 'WARNING' || state === 'CRITICAL'
  const healthy = state === 'HEALTHY'
  const warn = state === 'WARNING'
  const crit = state === 'CRITICAL' || state === 'TRIPPED'
  const abnormal = warn || crit
  const stateColor = healthy ? C.go : warn ? C.caution : crit ? C.stop : state === 'STARTUP' ? C.forecast : C.ink400

  const sensors = [
    { x: 8, name: 'VIBRATION', v: `${fmt(meas.vibRms, 2)} g`, c: C.vib },
    { x: 100, name: 'TEMP', v: `${fmt(meas.tempC, 0)} °C`, c: C.temp },
    { x: 192, name: 'CURRENT', v: `${fmt(meas.curRms, 1)} A`, c: C.cur },
    { x: 284, name: 'SPEED', v: `${fmt(meas.rpm, 0)}`, c: C.rpm },
  ]

  return (
    <section className={cn('panel', className)} aria-label="Signal path">
      <div className="panel-head">
        <span className="label">Signal path</span>
        <span className="label">live</span>
      </div>
      <div className="px-3 pb-3 pt-2">
        <svg viewBox="0 0 360 742" className="mx-auto block h-auto w-full max-w-[420px]" role="img" aria-label="Signal path from motor to alarm outputs">
          <defs>
            <filter id="pl-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          {/* edges */}
          {sensors.map((s, i) => (
            <Edge key={s.name} d={`M180 64 V84 H${s.x + 40} V106`} on={running} color={s.c} delay={i * 0.18} />
          ))}
          {sensors.map((s, i) => (
            <Edge key={s.name + 'm'} d={`M${s.x + 40} 170 V190 H180 V210`} on={running} color={s.c} delay={i * 0.18 + 0.4} />
          ))}
          <Edge d="M180 272 V300" on={running} color={C.bone} />
          <Edge d="M180 356 V384" on={running} color={C.bone} delay={0.3} />
          <Edge d="M180 446 V470 H95 V492" on={healthy && running} color={C.go} />
          <Edge d="M180 446 V470 H265 V492" on={abnormal && running} color={stateColor} />
          <Edge d="M265 538 V582" on={abnormal && running} color={stateColor} />
          <Edge d="M265 640 V658 H60 V676" on={warn} color={C.caution} />
          <Edge d="M265 640 V658 H180 V676" on={crit} color={C.stop} />
          <Edge d="M265 640 V658 H300 V676" on={predicting} color={C.forecast} />

          {/* nodes */}
          <Node x={80} y={8} w={200} h={56} title="INDUSTRIAL MOTOR" value={`${rpm} rpm`} lit={running || state === 'STARTUP'} strong color={C.bone} />
          {sensors.map((s) => (
            <Node key={s.name} x={s.x} y={106} w={80} h={64} title={s.name} value={s.v} color={s.c} strong small lit={state !== 'OFF'} />
          ))}
          <Node x={60} y={210} w={240} h={62} title="EMBEDDED MCU" value={`CPU ${fmt(cpu * 100, 1)} %`} sub="ADC · DMA · TIMERS · RTOS" strong color={C.bone} />
          <Node x={70} y={300} w={220} h={56} title="DATA PROCESSING" value="FFT · 10 Hz" strong color={C.bone} />
          <Node x={60} y={384} w={240} h={62} title="FAULT DETECTION ENGINE" value={state === 'TRIPPED' ? 'TRIPPED' : state} sub="limits · debounce · state machine" strong color={stateColor} />
          <Node x={30} y={492} w={130} h={46} title="HEALTHY" lit={healthy} strong color={C.go} />
          <Node x={200} y={492} w={130} h={46} title="ABNORMAL" lit={abnormal} strong color={stateColor} />
          <Node
            x={180}
            y={582}
            w={170}
            h={58}
            title="FAULT CLASSIFICATION"
            value={judging && diag.cls !== 'healthy' ? CLASS_META[diag.cls].label : abnormal ? 'unclassified' : '—'}
            sub={judging && diag.cls !== 'healthy' ? `evidence ${Math.round(diag.evidence * 100)} %` : ''}
            lit={abnormal}
            strong
            color={stateColor}
            small
          />
          <Node x={10} y={676} w={100} h={50} title="WARNING" lit={warn} strong color={C.caution} small />
          <Node x={130} y={676} w={100} h={50} title="CRITICAL" lit={crit} strong color={C.stop} small />
          <Node x={250} y={676} w={100} h={50} title="PREDICTION" lit={predicting} strong color={C.forecast} small />

          {/* lamps on the output nodes */}
          {[
            { x: 60, on: warn, c: C.caution },
            { x: 180, on: crit, c: C.stop },
            { x: 300, on: predicting, c: C.forecast },
          ].map((l) => (
            <g key={l.x}>
              {l.on && <circle cx={l.x} cy={708} r="9" fill={l.c} opacity="0.45" filter="url(#pl-glow)" />}
              <circle cx={l.x} cy={708} r="5" fill={l.on ? l.c : C.ink600} style={{ animation: l.on && l.c === C.stop ? 'pulse-dot 0.5s infinite' : undefined }} />
            </g>
          ))}
        </svg>
      </div>
    </section>
  )
}
