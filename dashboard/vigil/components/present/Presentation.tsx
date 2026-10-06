'use client'

import { motion } from 'motion/react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useStore } from '@vigil/components/sim/SimProvider'
import { content } from './content'
import { SLIDES, type SlideDef } from './slides'

const PresentScene = dynamic(() => import('./PresentScene'), { ssr: false })

/* ---------- the deck ---------- */

function toggleFull() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen?.()
}

export function Presentation() {
  const store = useStore()
  const [i, setI] = useState(0)
  const idx = useRef(0)
  const [full, setFull] = useState(false)
  const touch = useRef<number | null>(null)
  const n = SLIDES.length
  const s = SLIDES[i]

  const go = useCallback(
    (to: number) => {
      const t = Math.max(0, Math.min(n - 1, to))
      if (t === idx.current) return
      idx.current = t
      setI(t)
    },
    [n],
  )

  // the first slide's motor state; let the simulator run even if the boot splash is still up
  useEffect(() => {
    store.release()
    store.setPaused(false)
    store.setSpeed(1)
    return () => {
      store.maintenance()
      store.resetTrip()
      store.setConfig({ autoProtect: false })
    }
  }, [store])

  useEffect(() => {
    SLIDES[i].enter?.(store)
  }, [i, store])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault()
        go(idx.current + 1)
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault()
        go(idx.current - 1)
      } else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(n - 1)
      else if (e.key === 'f' || e.key === 'F') toggleFull()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, n])

  useEffect(() => {
    const f = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])

  const c = useMemo(() => content(s.id, s), [s])
  const center = s.model === 'center'
  const textRight = s.model === 'left'

  const frame: CSSProperties = { background: s.bg, color: s.ink, transition: 'background-color 0.8s ease, color 0.8s ease' }

  return (
    <div
      className="fixed inset-0 z-[300] overflow-hidden"
      style={frame}
      onTouchStart={(e) => {
        touch.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (touch.current == null) return
        const dx = e.changedTouches[0].clientX - touch.current
        if (Math.abs(dx) > 50) go(idx.current + (dx < 0 ? 1 : -1))
        touch.current = null
      }}
    >
      {/* giant slide number behind everything */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[0.14em] select-none font-display font-black leading-none"
        style={{
          fontSize: 'clamp(14rem, 44vw, 52rem)',
          opacity: 0.1,
          color: s.ink,
          [textRight ? 'left' : 'right']: '-0.04em',
          transition: 'color 0.8s ease',
        }}
      >
        {String(i + 1).padStart(2, '0')}
      </div>

      {/* the 3D view fades out on the text side, so the model never sits behind the words */}
      <div
        className="pres-fade absolute inset-0 z-[1]"
        style={{ '--fl': s.model === 'right' ? 0 : 1, '--fr': s.model === 'left' ? 0 : 1 } as CSSProperties}
      >
        <div className="pres-fade-top absolute inset-0" style={{ '--ft': s.model === 'center' ? 0 : 1 } as CSSProperties}>
          <PresentScene store={store} index={idx} />
        </div>
      </div>

      {/* text layer */}
      <div
        key={s.id}
        className={`pointer-events-none absolute inset-0 z-[2] flex flex-col px-[clamp(1.2rem,5vw,6rem)] pb-[clamp(5rem,9vh,7rem)] pt-[clamp(4.5rem,9vh,7rem)] ${
          center ? 'justify-between' : 'justify-center'
        } ${textRight ? 'items-end' : 'items-start'}`}
      >
        <motion.div
          initial="hidden"
          animate="show"
          className="flex w-full flex-col items-start"
          style={{ gap: 'clamp(0.8rem, 2vh, 1.6rem)', maxWidth: center ? '70rem' : 'min(48rem, 43vw)' }}
        >
          {c.head}
          {!center && c.extra && <div className="mt-[clamp(0.4rem,1.4vh,1.2rem)] flex w-full flex-col items-stretch gap-3">{c.extra}</div>}
        </motion.div>
        {center && c.extra && (
          <motion.div initial="hidden" animate="show" className="flex w-full flex-col items-start gap-4">
            {c.extra}
          </motion.div>
        )}
      </div>

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 z-[3] flex items-center justify-between px-[clamp(1.2rem,5vw,6rem)] pt-5">
        <div className="font-stencil text-[clamp(1.4rem,2vw,2.2rem)] font-black uppercase leading-none">Vigil</div>
        <div className="font-mono text-[12px] font-bold tracking-[0.16em]">
          {String(i + 1).padStart(2, '0')} / {n}
        </div>
      </div>

      {/* bottom bar */}
      <div className="absolute inset-x-0 bottom-0 z-[3] flex items-center justify-between gap-4 px-[clamp(1.2rem,5vw,6rem)] pb-5">
        <div className="flex flex-1 items-center gap-1.5">
          {SLIDES.map((d, k) => (
            <button
              key={d.id}
              aria-label={`Go to slide ${k + 1}`}
              onClick={() => go(k)}
              className="h-3 flex-1 max-w-10 cursor-pointer rounded-full transition-all"
              style={{ background: s.ink, opacity: k === i ? 1 : k < i ? 0.45 : 0.18, transform: k === i ? 'scaleY(1.6)' : undefined }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <NavBtn s={s} label="Previous" onClick={() => go(i - 1)} disabled={i === 0}>←</NavBtn>
          <NavBtn s={s} label="Next" onClick={() => go(i + 1)} disabled={i === n - 1}>→</NavBtn>
          <NavBtn s={s} label={full ? 'Exit full screen' : 'Full screen'} onClick={toggleFull}>⛶</NavBtn>
          <Link href="/vigil" className="rounded-full px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ border: `2px solid ${s.ink}` }}>
            Exit
          </Link>
        </div>
      </div>

      <style>{`
        @keyframes pres-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.35)} }
        @property --fl { syntax: '<number>'; inherits: false; initial-value: 1; }
        @property --fr { syntax: '<number>'; inherits: false; initial-value: 1; }
        .pres-fade {
          transition: --fl 0.9s ease, --fr 0.9s ease;
          --mask: linear-gradient(to right, rgba(0,0,0,var(--fl)) 44%, rgba(0,0,0,var(--fr)) 56%);
          -webkit-mask-image: var(--mask);
          mask-image: var(--mask);
        }
        @property --ft { syntax: '<number>'; inherits: false; initial-value: 1; }
        .pres-fade-top {
          transition: --ft 0.9s ease;
          --mask-t: linear-gradient(to bottom, rgba(0,0,0,var(--ft)) 16%, #000 32%);
          -webkit-mask-image: var(--mask-t);
          mask-image: var(--mask-t);
        }
        @media (max-aspect-ratio: 1/1) { .pres-fade, .pres-fade-top { -webkit-mask-image: none; mask-image: none; } }
      `}</style>
    </div>
  )
}

function NavBtn({ s, label, onClick, disabled, children }: { s: SlideDef; label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-xl font-black transition disabled:cursor-default disabled:opacity-30"
      style={{ background: s.ink, color: s.bg }}
    >
      {children}
    </button>
  )
}
