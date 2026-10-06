/**
 * Drives the simulator from requestAnimationFrame and publishes immutable snapshots at ~15 Hz.
 * React reads snapshots through useSyncExternalStore (see components/sim/SimProvider.tsx);
 * canvases and the 3D scene read `store.sim` buffers directly every frame.
 */
import type { FaultKey } from './config'
import type { FwConfig } from './firmware'
import { Simulator, type Snapshot } from './simulator'
import { IDLE_TOUR, TourRunner, type TourState } from './tour'

export type StoreSnapshot = Snapshot & {
  paused: boolean
  speed: number
  sound: boolean
  /** bumps whenever the simulator is rebuilt, so canvases know to drop cached history */
  epoch: number
  tour: TourState
}

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const

export class SimStore {
  sim: Simulator
  paused = false
  speed = 1
  sound = false
  epoch = 0
  /** true until the boot splash finishes (or is skipped) */
  held = true
  private tour = new TourRunner()
  private snap: StoreSnapshot
  private listeners = new Set<() => void>()
  private raf = 0
  private last = 0
  private acc = 0
  private running = false

  constructor(private seed = 7) {
    this.sim = new Simulator(seed)
    this.snap = this.build()
  }

  private build(): StoreSnapshot {
    return { ...this.sim.snapshot(), paused: this.paused, speed: this.speed, sound: this.sound, epoch: this.epoch, tour: this.tour.active ? this.tour.state(this.sim) : IDLE_TOUR }
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  getSnapshot = () => this.snap

  private publish() {
    this.snap = this.build()
    this.listeners.forEach((l) => l())
  }

  /* ---------- loop ---------- */

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  private frame = (now: number) => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.frame)
    // the simulator is ~600x faster than real time, so let it catch up after slow frames; only a hidden tab is clamped
    const dt = Math.min(now - this.last, 250)
    this.last = now
    if (!this.paused && !this.held) {
      this.sim.advance(dt * this.speed)
      if (this.tour.tick(this.sim)) this.acc = 1e9
    }
    this.acc += dt
    if (this.acc >= 66) {
      this.acc = 0
      this.publish()
    }
  }

  release() {
    if (!this.held) return
    this.held = false
    this.publish()
  }

  /* ---------- actions (each republishes immediately so the UI reacts without waiting for the next tick) ---------- */

  setSpeed(x: number) {
    this.speed = x
    this.publish()
  }

  setPaused(p: boolean) {
    this.paused = p
    this.publish()
  }

  togglePause() {
    this.setPaused(!this.paused)
  }

  /** Advance 100 ms while paused. */
  stepOnce(ms = 100) {
    this.sim.advance(ms)
    this.publish()
  }

  setSound(on: boolean) {
    this.sound = on
    this.publish()
  }

  setFault(key: FaultKey, target: number, gradualSec = 0, quiet = false) {
    this.sim.setFault(key, target, gradualSec, quiet)
    this.publish()
  }

  /** Log a finished slider drag. */
  noteInjection(key: FaultKey, from: number, to: number, gradualSec = 0) {
    this.sim.noteInjection(key, from, to, gradualSec)
    this.publish()
  }

  maintenance() {
    this.sim.maintenance()
    this.publish()
  }

  setMains(on: boolean) {
    this.sim.setMains(on)
    this.publish()
  }

  resetTrip() {
    this.sim.resetTrip()
    this.publish()
  }

  setConfig(patch: Partial<FwConfig>) {
    this.sim.setConfig(patch)
    this.publish()
  }

  startTour() {
    this.held = false
    this.paused = false
    this.speed = 1
    this.tour.start(this.sim)
    this.publish()
  }

  stopTour() {
    this.tour.stop()
    this.publish()
  }

  /** Throw the simulator away and boot a fresh one. */
  reset() {
    this.tour.stop()
    this.sim = new Simulator(this.seed)
    this.epoch++
    this.publish()
  }
}
