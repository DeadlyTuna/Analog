'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@vigil/components/sim/SimProvider'

const LINES = [
  'VIGIL-M1 bootloader 1.4',
  'core STM32F411CE · Cortex-M4F · 48 MHz',
  'ADC1 calibrated · 12-bit · Vref 3.30 V',
  'DMA1 stream0 ready · circular buffer 128',
  'TIM3 → ADC trigger 2560 Hz',
  'scheduler start · ACQ DSP FDT HLTH COMM',
]

/**
 * Power-on sequence with a lamp test, as real machines do. Shown once per browser session.
 * It is rendered on the server and hidden by CSS, so the first paint is already the splash (no flash of the page behind).
 * The simulator is held until it ends so the motor spins up in front of the visitor.
 */
export function BootSplash() {
  const store = useStore()
  const ref = useRef<HTMLDivElement>(null)
  const ended = useRef(false)

  useEffect(() => {
    const el = ref.current
    const finish = () => {
      if (ended.current) return
      ended.current = true
      try {
        sessionStorage.setItem('vigil-boot', '1')
      } catch {
        /* private mode */
      }
      document.documentElement.setAttribute('data-boot', 'done')
      store.release()
    }
    const seen = document.documentElement.getAttribute('data-boot') === 'done'
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (seen || reduce || !el) {
      finish()
      return
    }
    const timer = window.setTimeout(finish, 2650)
    const skip = () => {
      el.classList.add('boot-skip')
      window.setTimeout(finish, 220)
    }
    window.addEventListener('keydown', skip, { once: true })
    el.addEventListener('pointerdown', skip, { once: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', skip)
    }
  }, [store])

  return (
    <div ref={ref} className="boot" role="presentation" aria-hidden>
      <div className="boot-inner">
        <div className="boot-lamps">
          <i style={{ ['--c' as string]: '#ff4338', ['--d' as string]: '0.15s' }} />
          <i style={{ ['--c' as string]: '#ffb21e', ['--d' as string]: '0.45s' }} />
          <i style={{ ['--c' as string]: '#2ee67c', ['--d' as string]: '0.75s' }} />
          <i style={{ ['--c' as string]: '#5c9dff', ['--d' as string]: '1.05s' }} />
        </div>
        <p className="stencil boot-title">Vigil</p>
        <ul className="boot-log mono">
          {LINES.map((l, i) => (
            <li key={l} style={{ animationDelay: `${0.25 + i * 0.26}s` }}>
              <span>OK</span> {l}
            </li>
          ))}
          <li style={{ animationDelay: '1.95s' }} className="boot-ready">
            READY — lamp test passed
          </li>
        </ul>
        <div className="boot-bar">
          <span />
        </div>
        <p className="label boot-skip-hint">click or press any key to skip</p>
      </div>
    </div>
  )
}
