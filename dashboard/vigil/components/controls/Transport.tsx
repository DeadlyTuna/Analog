'use client'

import { Pause, Play, Power, RotateCcw, ShieldAlert, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { Segmented } from '@vigil/components/ui/Segmented'
import { Switch } from '@vigil/components/ui/Switch'
import { useSnap, useStore } from '@vigil/components/sim/SimProvider'
import { SPEEDS } from '@vigil/lib/sim/store'
import { cn } from '@vigil/lib/utils'

/** Clock, motor contactor and protection controls. */
export function Transport({ className }: { className?: string }) {
  const store = useStore()
  const paused = useSnap((s) => s.paused)
  const speed = useSnap((s) => s.speed)
  const sound = useSnap((s) => s.sound)
  const mains = useSnap((s) => s.mains)
  const state = useSnap((s) => s.state)
  const auto = useSnap((s) => s.cfg.autoProtect)
  const tripped = state === 'TRIPPED'

  return (
    <div className={cn('panel flex flex-wrap items-center gap-x-4 gap-y-2.5 px-3.5 py-2.5', className)} role="toolbar" aria-label="Simulation controls">
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-sm" onClick={() => store.togglePause()} aria-label={paused ? 'Resume simulation' : 'Pause simulation'}>
          {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="btn btn-sm btn-icon" onClick={() => store.stepOnce()} disabled={!paused} aria-label="Step 100 ms" title="Step 100 ms">
          <SkipForward size={14} aria-hidden />
        </button>
        <Segmented
          label="Simulation speed"
          value={speed}
          onChange={(v) => store.setSpeed(v)}
          options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
          className="max-w-full overflow-x-auto no-scrollbar"
        />
      </div>

      <span className="hidden h-6 w-px bg-ink-600 lg:block" aria-hidden />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {tripped ? (
          <button
            type="button"
            className="btn btn-sm !border-stop/70 !text-stop"
            onClick={() => {
              store.resetTrip()
              store.setMains(true)
            }}
          >
            <ShieldAlert size={14} aria-hidden /> Reset trip &amp; restart
          </button>
        ) : (
          <button type="button" className={cn('btn btn-sm', mains ? '' : '!border-go/70 !text-go')} onClick={() => store.setMains(!mains)} aria-pressed={mains}>
            <Power size={14} aria-hidden /> {mains ? 'Stop motor' : 'Start motor'}
          </button>
        )}
        <Switch
          checked={auto}
          onChange={(v) => store.setConfig({ autoProtect: v })}
          label="Auto-trip on critical"
          hint="After 5 s in the critical state the firmware opens the contactor and the motor coasts to a stop."
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button type="button" className="btn btn-sm btn-icon" onClick={() => store.setSound(!sound)} aria-pressed={sound} aria-label={sound ? 'Mute buzzer' : 'Unmute buzzer'} title="Buzzer sound">
          {sound ? <Volume2 size={15} aria-hidden /> : <VolumeX size={15} aria-hidden />}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => store.reset()} title="Boot a fresh motor and firmware">
          <RotateCcw size={14} aria-hidden /> Reset
        </button>
      </div>
    </div>
  )
}
