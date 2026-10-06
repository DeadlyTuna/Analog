'use client'

import { Hourglass, TrendingDown, TrendingUp } from 'lucide-react'
import { StatePill } from '@vigil/components/shell/Nav'
import { shallowEqual, useSnap } from '@vigil/components/sim/SimProvider'
import { CLASS_META, FAULT_META, PREDICT_HORIZON_S } from '@vigil/lib/sim/config'
import { headline } from '@vigil/lib/diagnosis'
import { C } from '@vigil/lib/theme'
import { fmt, span } from '@vigil/lib/utils'
import { HealthRing } from './HealthRing'

export function HealthPanel() {
  const { state, diag, reason } = useSnap((s) => ({ state: s.state, diag: s.diag, reason: s.reason }), shallowEqual)
  const h = headline({ state, diag, reason })

  return (
    <section className="panel" aria-label="Machine health">
      <div className="panel-head">
        <span className="label">Machine health</span>
        <StatePill state={state} />
      </div>
      <div className="px-4 pb-4 pt-3">
        <HealthRing />
        <div className="mt-2 text-center">
          <h2 className="display text-[28px] text-bone">{h.title}</h2>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[14px] leading-snug text-steel-200 text-pretty">{h.sub}</p>
          {diag.also.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
              <span className="label">also</span>
              {diag.also.map((k) => (
                <span key={k} className="chip !text-caution" style={{ borderColor: `${C.caution}66` }}>
                  {CLASS_META[k].label}
                </span>
              ))}
            </p>
          )}
        </div>
        <Forecast />
        <Episode />
      </div>
    </section>
  )
}

function Forecast() {
  const health = useSnap((s) => s.health, shallowEqual)
  const state = useSnap((s) => s.state)
  const active = health.predicting && health.rulSec != null
  const rul = health.rulSec ?? 0
  const frac = Math.max(0, Math.min(1, rul / PREDICT_HORIZON_S))
  const trend = health.slopePerMin
  const running = state === 'HEALTHY' || state === 'WARNING'

  if (active) {
    return (
      <div
        className="mt-4 rounded-lg border p-3"
        style={{ borderColor: `${C.forecast}77`, background: `${C.forecast}14`, boxShadow: `0 0 26px -10px ${C.forecast}` }}
        role="status"
      >
        <div className="flex items-center gap-3">
          <Hourglass size={20} color={C.forecast} className="shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="label !text-forecast">Forecast</p>
            <p className="readout mt-1 text-[26px]" style={{ color: C.forecast }}>
              ≈ {span(rul)}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[13px] leading-snug text-bone/90">
          until the critical limit if nothing changes — <span className="text-steel-200">{health.driver}.</span>
        </p>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-ink-600">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${frac * 100}%`, background: C.forecast }} />
        </div>
      </div>
    )
  }
  return (
    <div className="mt-4 flex items-center gap-3 rounded-lg border border-ink-600 bg-ink-850/60 p-3">
      {trend < -0.5 ? <TrendingDown size={18} className="shrink-0 text-steel-200" aria-hidden /> : <TrendingUp size={18} className="shrink-0 text-steel-300" aria-hidden />}
      <div className="min-w-0">
        <p className="label">Forecast</p>
        <p className="mt-0.5 text-[13px] text-steel-200">
          {running ? (
            <>
              No adverse trend. Health is moving <span className="mono text-bone">{trend >= 0 ? '+' : '−'}{fmt(Math.abs(trend), 1)}</span> points per minute.
            </>
          ) : (
            'Waiting for the motor to settle.'
          )}
        </p>
      </div>
    </div>
  )
}

function Episode() {
  const detect = useSnap((s) => s.detect, shallowEqual)
  const sum = useSnap((s) => s.summary, shallowEqual)
  if (!detect) return null
  const meta = FAULT_META[detect.key]
  return (
    <dl className="mono mt-3 space-y-1 border-t border-ink-600/70 pt-3 text-[11px]">
      <div className="flex justify-between gap-3">
        <dt className="text-steel-300">Last fault</dt>
        <dd className="text-bone">{meta.label}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-steel-300">{detect.mode === 'instant' ? 'Detected after' : 'Caught at severity'}</dt>
        <dd className="text-bone">
          {detect.ms == null
            ? 'not yet'
            : detect.mode === 'instant'
              ? `${fmt(detect.ms / 1000, 2)} s`
              : `${fmt((detect.severityAtDetect ?? 0) * 100, 0)} %`}
        </dd>
      </div>
      {sum.warnLeadSec != null && (
        <div className="flex justify-between gap-3">
          <dt className="text-steel-300">Warned before critical</dt>
          <dd className="text-caution">{fmt(sum.warnLeadSec, 1)} s</dd>
        </div>
      )}
      {sum.predLeadSec != null && (
        <div className="flex justify-between gap-3">
          <dt className="text-steel-300">Forecast before critical</dt>
          <dd style={{ color: C.forecast }}>{fmt(sum.predLeadSec, 1)} s</dd>
        </div>
      )}
    </dl>
  )
}
