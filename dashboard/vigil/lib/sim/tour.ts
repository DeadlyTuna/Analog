/**
 * The guided demo: a scripted walk through the project, driven by simulation time so that
 * pause and speed controls work. Each step runs an action, then waits for a state (with limits).
 */
import type { Simulator } from './simulator'

export interface TourStep {
  id: string
  title: string
  text: string
  /** runs once when the step begins */
  enter: (sim: Simulator) => void
  /** step ends when this is true (after minMs) or when maxMs passes */
  until?: (sim: Simulator) => boolean
  minMs: number
  maxMs: number
}

const state = (sim: Simulator) => sim.fw.fsm.state

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'baseline',
    title: 'A healthy motor',
    text: 'Around 55 °C, 0.25 g of vibration, 4.2 A and 1480 rpm. The health index sits near 100 and the stack light is green.',
    enter: (s) => {
      s.fw.resetTrip()
      s.setMains(true)
      s.maintenance()
      s.setConfig({ autoProtect: false, stressLoad: 0, uartNoise: 0 })
    },
    until: (s) => state(s) === 'HEALTHY',
    minMs: 7000,
    maxMs: 14000,
  },
  {
    id: 'overload',
    title: 'Overload, applied suddenly',
    text: 'Current jumps to 7.8 A and the shaft slows to 1350 rpm while the winding heads for 78 °C. The firmware raises a warning in about a third of a second and names the cause.',
    enter: (s) => s.setFault('overload', 1),
    until: (s) => state(s) === 'WARNING',
    minMs: 15000,
    maxMs: 22000,
  },
  {
    id: 'repair',
    title: 'Load removed',
    text: 'Readings drop back inside their limits. The state machine waits for 1.5 seconds of clean data before it clears the warning, so it cannot flicker.',
    enter: (s) => s.maintenance(),
    until: (s) => state(s) === 'HEALTHY',
    minMs: 5000,
    maxMs: 24000,
  },
  {
    id: 'bearing',
    title: 'A bearing wears out slowly',
    text: 'Over 40 seconds the outer race degrades. Watch the spectrogram fill with energy, the health index slide, and the forecast appear before any limit is crossed. That head start is the point of predictive maintenance.',
    enter: (s) => s.setFault('bearing', 0.9, 40),
    until: (s) => state(s) === 'CRITICAL',
    minMs: 20000,
    maxMs: 75000,
  },
  {
    id: 'trip',
    title: 'Protection trips the motor',
    text: 'Auto-trip is armed. After four seconds in the critical state the firmware opens the contactor and the motor coasts to a stop, before the bearing can seize.',
    enter: (s) => s.setConfig({ autoProtect: true, tripDelayMs: 4000 }),
    until: (s) => state(s) === 'TRIPPED',
    minMs: 9000,
    maxMs: 24000,
  },
  {
    id: 'restart',
    title: 'Repair and restart',
    text: 'Bearing replaced, trip cleared, contactor closed. Note the start-up inrush of several times rated current: limits are inhibited until it dies away.',
    enter: (s) => {
      s.maintenance()
      s.resetTrip()
      s.setConfig({ autoProtect: false })
      s.setMains(true)
    },
    until: (s) => state(s) === 'HEALTHY',
    minMs: 9000,
    maxMs: 24000,
  },
  {
    id: 'cooling',
    title: 'The fan gets blocked',
    text: 'Temperature climbs while current and speed stay normal. Because heat is far above what the load explains, the classifier says cooling failure, not overload. Several channels, one verdict.',
    enter: (s) => s.setFault('cooling', 1, 35),
    until: (s) => state(s) === 'CRITICAL',
    minMs: 18000,
    maxMs: 70000,
  },
  {
    id: 'done',
    title: 'Sense, decide, protect',
    text: 'That is the whole loop: sample, filter, detect, classify, warn, forecast and protect. The simulator is yours now. Break something.',
    enter: (s) => s.maintenance(),
    minMs: 8000,
    maxMs: 8000,
  },
]

export interface TourState {
  active: boolean
  index: number
  total: number
  title: string
  text: string
  /** 0…1 progress within the current step (by minimum duration) */
  progress: number
}

export const IDLE_TOUR: TourState = { active: false, index: 0, total: TOUR_STEPS.length, title: '', text: '', progress: 0 }

export class TourRunner {
  private index = -1
  private stepStart = 0
  active = false

  start(sim: Simulator) {
    this.active = true
    this.index = -1
    this.advance(sim)
  }

  stop() {
    this.active = false
    this.index = -1
  }

  private advance(sim: Simulator) {
    this.index++
    if (this.index >= TOUR_STEPS.length) {
      this.stop()
      return
    }
    this.stepStart = sim.tMs
    TOUR_STEPS[this.index].enter(sim)
  }

  /** Call every frame with the simulator after it has advanced. Returns true if the UI state changed. */
  tick(sim: Simulator): boolean {
    if (!this.active) return false
    const step = TOUR_STEPS[this.index]
    const elapsed = sim.tMs - this.stepStart
    if (elapsed >= step.maxMs || (elapsed >= step.minMs && (!step.until || step.until(sim)))) {
      this.advance(sim)
      return true
    }
    return false
  }

  state(sim: Simulator): TourState {
    if (!this.active) return IDLE_TOUR
    const step = TOUR_STEPS[this.index]
    return {
      active: true,
      index: this.index,
      total: TOUR_STEPS.length,
      title: step.title,
      text: step.text,
      progress: Math.min(1, (sim.tMs - this.stepStart) / step.minMs),
    }
  }
}
