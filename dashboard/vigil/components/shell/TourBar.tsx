'use client'

import { Play, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRouter } from 'next/navigation'
import { shallowEqual, useSnap, useStore } from '@vigil/components/sim/SimProvider'
import { cn } from '@vigil/lib/utils'

/** Caption bar for the guided demo. Floats at the bottom of every page while the tour runs. */
export function TourBar() {
  const store = useStore()
  const tour = useSnap((s) => s.tour, shallowEqual)

  return (
    <AnimatePresence>
      {tour.active && (
        <motion.aside
          key="tour"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
          className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-[860px] sm:bottom-5"
          aria-label="Guided demo"
          role="status"
        >
          <div className="overflow-hidden rounded-2xl border border-ink-400/60 bg-ink-900/90 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9)] backdrop-blur-xl">
            <div className="h-[3px] bg-ink-600">
              <div className="h-full bg-[var(--state)] transition-[width] duration-300" style={{ width: `${((tour.index + tour.progress) / tour.total) * 100}%` }} />
            </div>
            <div className="flex items-start gap-4 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <p className="label !text-bone/80">
                  Guided demo · step {tour.index + 1} of {tour.total}
                </p>
                <AnimatePresence mode="wait">
                  <motion.div key={tour.index} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                    <h2 className="display mt-1.5 text-[28px] text-bone sm:text-[34px]">{tour.title}</h2>
                    <p className="mt-1.5 text-[15.5px] leading-snug text-steel-200 text-pretty">{tour.text}</p>
                  </motion.div>
                </AnimatePresence>
              </div>
              <button type="button" className="btn btn-sm shrink-0" onClick={() => store.stopTour()}>
                <Square size={12} aria-hidden /> Stop
              </button>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

/** Starts the guided demo from anywhere, taking the visitor to the control room first. */
export function GuidedDemoButton({ className, label = 'Run the guided demo' }: { className?: string; label?: string }) {
  const store = useStore()
  const router = useRouter()
  const active = useSnap((s) => s.tour.active)
  return (
    <button
      type="button"
      className={cn('btn', className)}
      onClick={() => {
        if (active) {
          store.stopTour()
          return
        }
        if (window.location.pathname !== '/vigil/control-room') router.push('/vigil/control-room')
        store.startTour()
      }}
    >
      {active ? <Square size={14} aria-hidden /> : <Play size={14} aria-hidden />}
      {active ? 'Stop the demo' : label}
    </button>
  )
}
