'use client'

import { useEffect } from 'react'
import { useStore } from '@vigil/components/sim/SimProvider'

/** Mirrors the MCU's buzzer pin as a square-wave beep. Off until the user unmutes it (browsers need a gesture). */
export function BuzzerAudio() {
  const store = useStore()
  useEffect(() => {
    let ctx: AudioContext | null = null
    let osc: OscillatorNode | null = null
    let gain: GainNode | null = null
    let raf = 0
    let on = false

    const ensure = () => {
      if (ctx) return
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      ctx = new AC()
      osc = ctx.createOscillator()
      gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = 2300
      gain.gain.value = 0
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 3200
      osc.connect(lp).connect(gain).connect(ctx.destination)
      osc.start()
    }

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const snap = store.getSnapshot()
      const want = snap.sound && !snap.paused && store.sim.fw.gpio.buzzer
      if (snap.sound) {
        ensure()
        void ctx?.resume()
      }
      if (want !== on && gain && ctx) {
        on = want
        gain.gain.setTargetAtTime(want ? 0.045 : 0, ctx.currentTime, 0.004)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      try {
        osc?.stop()
        void ctx?.close()
      } catch {
        /* already closed */
      }
    }
  }, [store])
  return null
}
