'use client'

import { Move3d, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { BenchCanvas } from '@vigil/components/bench/BenchCanvas'
import { useSnap } from '@vigil/components/sim/SimProvider'
import { Segmented } from '@vigil/components/ui/Segmented'
import { chooseQuality, dismissQualityNotice, useAdaptiveQuality, useQuality, useQualityNotice } from '@vigil/lib/quality'
import { clock, cn } from '@vigil/lib/utils'

/** The live 3D digital twin with its overlay tags. */
export function Viewport({ className }: { className?: string }) {
  const [auto, setAuto] = useState(false)
  const quality = useQuality()
  const notice = useQualityNotice()
  useAdaptiveQuality()
  const t = useSnap((s) => Math.floor(s.tMs / 100) * 100)
  const paused = useSnap((s) => s.paused)

  return (
    <section
      className={cn('panel relative h-[520px] overflow-hidden sm:h-[640px] xl:h-[700px]', className)}
      style={{ background: 'radial-gradient(80% 70% at 50% 62%, color-mix(in oklab, var(--state) 9%, #15191b), #0b0d0e 78%)' }}
      aria-label="Live 3D digital twin of the motor test bench"
    >
      <BenchCanvas autoRotate={auto} quality={quality} preset="room" />
      {/* the machine's state tints the room: a soft pool of light at the bottom edge, then a vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{ background: 'radial-gradient(90% 55% at 50% 108%, color-mix(in oklab, var(--state) 20%, transparent), transparent 70%)', mixBlendMode: 'screen' }}
      />
      <div className="pointer-events-none absolute inset-0" aria-hidden style={{ background: 'radial-gradient(125% 95% at 50% 52%, transparent 58%, rgba(5,6,7,0.6))' }} />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3.5">
        <div className="flex flex-col items-start gap-1.5">
          <span className="chip !bg-ink-900/80 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-go" style={{ boxShadow: '0 0 8px #2ee67c', animation: paused ? undefined : 'ind-pulse-dot 1.4s infinite' }} />
            {paused ? 'paused' : 'live'} · digital twin
          </span>
          <span className="chip !bg-ink-900/80 tabular backdrop-blur">T+ {clock(t)}</span>
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className={cn('btn btn-sm !bg-ink-900/80 backdrop-blur', auto && '!border-bone')}
            onClick={() => setAuto((a) => !a)}
            aria-pressed={auto}
            title="Slowly orbit the bench"
          >
            <RotateCw size={14} aria-hidden /> <span className="hidden sm:inline">Orbit</span>
          </button>
          <Segmented
            label="Render quality"
            value={quality}
            onChange={chooseQuality}
            options={[
              { value: 'high', label: 'HQ' },
              { value: 'low', label: 'LITE' },
            ]}
            className="!bg-ink-900/80 backdrop-blur"
          />
        </div>
      </div>

      {notice && (
        <div className="absolute bottom-12 left-3.5 right-3.5 z-10 flex items-center gap-3 rounded-lg border border-ink-400/70 bg-ink-900/90 px-3.5 py-2.5 text-[13px] text-steel-200 backdrop-blur sm:right-auto sm:max-w-[430px]" role="status">
          <span className="flex-1">The 3D view was running slowly, so it switched to Lite rendering to keep the instruments smooth.</span>
          <button type="button" className="btn btn-sm btn-ghost shrink-0" onClick={() => dismissQualityNotice()}>
            OK
          </button>
        </div>
      )}

      <p className="pointer-events-none absolute bottom-3 left-3.5 flex items-center gap-1.5 text-[12px] text-steel-300">
        <Move3d size={14} aria-hidden /> Drag to look around
      </p>
    </section>
  )
}
