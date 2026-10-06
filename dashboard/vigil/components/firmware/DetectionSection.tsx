'use client'

import { shallowEqual, useSnap, useStore } from '@vigil/components/sim/SimProvider'
import type { FsmState } from '@vigil/lib/sim/config'
import { C, LEVEL_COLOR, STATE_COLOR, rgba } from '@vigil/lib/theme'
import { cn, fmt } from '@vigil/lib/utils'

/* ---------- state machine diagram ---------- */

const NODES: { s: FsmState; x: number; label: string }[] = [
  { s: 'OFF', x: 70, label: 'OFF' },
  { s: 'STARTUP', x: 250, label: 'STARTUP' },
  { s: 'HEALTHY', x: 450, label: 'HEALTHY' },
  { s: 'WARNING', x: 660, label: 'WARNING' },
  { s: 'CRITICAL', x: 870, label: 'CRITICAL' },
  { s: 'TRIPPED', x: 1040, label: 'TRIPPED' },
]
const W = 122
const Y = 120

function Arrow({ x1, x2, y, label, back, dim }: { x1: number; x2: number; y: number; label: string; back?: boolean; dim?: boolean }) {
  const dir = back ? -1 : 1
  return (
    <g opacity={dim ? 0.45 : 1}>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={C.ink400} strokeWidth="1.4" />
      <path d={`M${x2} ${y} l${-7 * dir} -4 v8z`} fill={C.ink400} />
      <text x={(x1 + x2) / 2} y={y + (back ? 17 : -8)} textAnchor="middle" className="diagram-text" fontSize="9" fill={C.steel3}>
        {label}
      </text>
    </g>
  )
}

function Fsm() {
  const state = useSnap((s) => s.state)
  const f = useSnap((s) => s.fsm, shallowEqual)
  const cfg = useSnap((s) => s.cfg, shallowEqual)
  const info: Partial<Record<FsmState, string>> = {
    STARTUP: f.inhibitLeftMs > 0 ? `inhibit ${fmt(f.inhibitLeftMs / 1000, 1)} s left` : '',
    HEALTHY: `warn ${f.warnCnt}/${cfg.warnDebounce}`,
    WARNING: `crit ${f.critCnt}/${cfg.critDebounce} · clear ${f.clearCnt}/${cfg.clearDebounce}`,
    CRITICAL: f.tripInMs != null ? `trip in ${fmt(f.tripInMs / 1000, 1)} s` : `down ${f.downCnt}/${cfg.clearDebounce}`,
  }
  const xr = (i: number) => NODES[i].x + W / 2
  const xl = (i: number) => NODES[i].x - W / 2
  return (
    <div className="panel overflow-x-auto">
      <svg viewBox="0 0 1120 250" className="mx-auto block h-auto w-full min-w-[900px]" role="img" aria-label="Fault-detection state machine">
        <defs>
          <filter id="fsm-glow" x="-30%" y="-40%" width="160%" height="180%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        {/* forward transitions */}
        <Arrow x1={xr(0)} x2={xl(1)} y={Y - 8} label="current > 0.8 A" />
        <Arrow x1={xr(1)} x2={xl(2)} y={Y - 8} label="inhibit timer" />
        <Arrow x1={xr(2)} x2={xl(3)} y={Y - 8} label={`warn limit × ${cfg.warnDebounce}`} />
        <Arrow x1={xr(3)} x2={xl(4)} y={Y - 8} label={`crit limit × ${cfg.critDebounce}`} />
        <Arrow x1={xr(4)} x2={xl(5)} y={Y - 8} label={cfg.autoProtect ? `${cfg.tripDelayMs / 1000} s in critical` : 'auto-trip off'} dim={!cfg.autoProtect} />
        {/* back transitions */}
        <Arrow x1={xl(3)} x2={xr(2)} y={Y + 8} label={`clear × ${cfg.clearDebounce}`} back />
        <Arrow x1={xl(4)} x2={xr(3)} y={Y + 8} label={`below crit × ${cfg.clearDebounce}`} back />
        {/* any → OFF */}
        <path d={`M${NODES[5].x} ${Y + 40} V205 H${NODES[0].x} V${Y + 40}`} fill="none" stroke={C.ink400} strokeWidth="1.2" strokeDasharray="4 4" />
        <path d={`M${NODES[0].x} ${Y + 40} l-4 8 h8z`} fill={C.ink400} transform={`rotate(180 ${NODES[0].x} ${Y + 44})`} />
        <text x={(NODES[0].x + NODES[5].x) / 2} y="222" textAnchor="middle" className="diagram-text" fontSize="9" fill={C.steel3}>
          no current for 0.8 s → OFF · operator resets a trip → OFF
        </text>

        {NODES.map((n) => {
          const on = state === n.s
          const col = STATE_COLOR[n.s]
          return (
            <g key={n.s}>
              {on && <rect x={n.x - W / 2 - 3} y={Y - 25} width={W + 6} height="56" rx="12" fill={col} opacity="0.4" filter="url(#fsm-glow)" />}
              <rect x={n.x - W / 2} y={Y - 22} width={W} height="50" rx="10" fill={on ? rgba(col, 0.13) : C.bg} stroke={on ? col : C.ink500} strokeWidth={on ? 1.8 : 1} style={{ transition: 'all 200ms' }} />
              <text x={n.x} y={Y + 8} textAnchor="middle" fontFamily="var(--font-display)" fontWeight="700" fontSize="19" fill={on ? col : C.steel2} style={{ letterSpacing: '0.04em' }}>
                {n.label}
              </text>
              <text x={n.x} y={Y + 50} textAnchor="middle" className="diagram-text" fontSize="9" fill={on ? col : C.ink400}>
                {on ? info[n.s] ?? '' : ''}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ---------- limits ---------- */

function Limits() {
  const inds = useSnap((s) => s.indicators)
  const state = useSnap((s) => s.state)
  const live = state === 'HEALTHY' || state === 'WARNING' || state === 'CRITICAL'
  return (
    <section className="panel overflow-hidden">
      <div className="panel-head">
        <span className="label">Limit table stored in firmware</span>
        <span className="mono text-[11px] text-steel-200">level = highest limit currently crossed</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-left">
          <thead>
            <tr className="border-b border-ink-600/70">
              {['Indicator', 'Normal', 'Warning', 'Critical', 'Failed', 'Now', 'Level'].map((h, i) => (
                <th key={h} scope="col" className={cn('label px-3 py-2.5 font-medium', i > 0 && 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inds.map((i) => {
              const lvl = live ? i.level : 0
              const col = LEVEL_COLOR[lvl]
              const u = i.def.unit
              return (
                <tr key={i.def.key} className="border-b border-ink-700/70 last:border-0">
                  <th scope="row" className="px-3 py-2.5 text-[14px] font-normal text-steel-200">
                    {i.def.label}
                  </th>
                  <td className="mono px-3 py-2.5 text-right text-[12px] text-steel-200">{i.def.ok}</td>
                  <td className="mono px-3 py-2.5 text-right text-[12px] text-caution">{i.def.warn}</td>
                  <td className="mono px-3 py-2.5 text-right text-[12px] text-stop">{i.def.crit}</td>
                  <td className="mono px-3 py-2.5 text-right text-[12px] text-steel-300">{i.def.fail}</td>
                  <td className="mono px-3 py-2.5 text-right text-[12px] font-medium" style={{ color: col }}>
                    {live ? fmt(i.value, i.def.dp) : '—'} <span className="font-normal text-steel-300">{u}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="mono rounded px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.1em]" style={{ color: col, background: rgba(col, 0.08) }}>
                      {lvl === 2 ? 'crit' : lvl === 1 ? 'warn' : 'ok'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ---------- debounce tuning ---------- */

function Tuning() {
  const store = useStore()
  const cfg = useSnap((s) => s.cfg, shallowEqual)
  const min = cfg.warnDebounce * 100 + 150
  const slider = (id: string, label: string, value: number, lo: number, hi: number, set: (v: number) => void, unit: string) => (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[14px] text-steel-200">
          {label}
        </label>
        <span className="mono text-[12px] text-bone">
          {value} {unit}
        </span>
      </div>
      <input id={id} type="range" min={lo} max={hi} step={1} value={value} className="fader" style={{ '--p': `${((value - lo) / (hi - lo)) * 100}%` } as React.CSSProperties} onChange={(e) => set(Number(e.target.value))} />
    </div>
  )
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="label">Tune the filter</span>
      </div>
      <div className="space-y-3 p-4">
        {slider('d-warn', 'Warning debounce', cfg.warnDebounce, 1, 10, (v) => store.setConfig({ warnDebounce: v }), '× 100 ms')}
        {slider('d-crit', 'Critical debounce', cfg.critDebounce, 1, 10, (v) => store.setConfig({ critDebounce: v }), '× 100 ms')}
        {slider('d-clear', 'Clear debounce', cfg.clearDebounce, 3, 40, (v) => store.setConfig({ clearDebounce: v }), '× 100 ms')}
        {slider('d-trip', 'Auto-trip delay', Math.round(cfg.tripDelayMs / 1000), 2, 15, (v) => store.setConfig({ tripDelayMs: v * 1000 }), 's')}
        <p className="border-t border-ink-600/70 pt-3 text-[13.5px] leading-snug text-steel-300">
          Fewer debounce cycles catch a fault sooner but let single noisy windows raise false alarms. At <span className="mono text-bone">{cfg.warnDebounce}</span> cycles the quickest possible warning is about <span className="mono text-bone">{min} ms</span> after the limit is crossed.
        </p>
      </div>
    </section>
  )
}

const RULES = [
  { k: 'Overload', c: C.caution, t: 'Current well above rated and speed dropping together.' },
  { k: 'Bearing wear', c: C.stop, t: 'Kurtosis, crest factor and energy above 400 Hz rise: impacts, not a steady tone.' },
  { k: 'Misalignment', c: C.caution, t: 'The 2× tone grows to a large fraction of the 1× tone.' },
  { k: 'Imbalance', c: C.caution, t: 'The 1× tone dominates and 2× stays small.' },
  { k: 'Cooling failure', c: C.temp, t: 'Temperature is far above what the measured current and fan speed can explain.' },
  { k: 'Electrical fault', c: C.cur, t: 'Cycle-to-cycle ripple, distortion and 100 Hz hum all increase.' },
]

export function DetectionSection() {
  return (
    <div className="space-y-4">
      <Fsm />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Limits />
        </div>
        <div className="space-y-4 lg:col-span-5">
          <Tuning />
          <section className="panel">
            <div className="panel-head">
              <span className="label">How the classifier decides</span>
            </div>
            <ul className="divide-y divide-ink-700/70">
              {RULES.map((r) => (
                <li key={r.k} className="grid grid-cols-[112px_1fr] gap-3 px-4 py-2.5">
                  <span className="text-[14px] font-semibold" style={{ color: r.c }}>
                    {r.k}
                  </span>
                  <span className="text-[13.5px] leading-snug text-steel-200">{r.t}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-ink-600/70 px-4 py-3 text-[13px] leading-snug text-steel-300">
              Each rule produces evidence from 0 to 1. Several can be high at once, so a combined fault shows up as two bars, not one wrong answer.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

