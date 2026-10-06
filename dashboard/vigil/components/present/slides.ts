import type { SimStore } from '@vigil/lib/sim/store'

export interface Cam {
  /** camera position, bench-local coordinates */
  pos: [number, number, number]
  /** look-at point, bench-local coordinates */
  look: [number, number, number]
  fov?: number
}

export interface SlideDef {
  id: string
  /** solid background colour */
  bg: string
  /** text colour on that background */
  ink: string
  /** second colour for highlights / chips */
  pop: string
  /** where the 3D model sits: text goes on the opposite side */
  model: 'left' | 'right' | 'center'
  cam: Cam
  /** slow orbit around the look-at point (radians / second) */
  drift?: number
  /** runs when the slide opens; puts the virtual motor in the state the slide talks about */
  enter?: (s: SimStore) => void
}

const calm = (s: SimStore) => {
  s.maintenance()
  s.resetTrip()
  s.setMains(true)
  s.setConfig({ autoProtect: false, stressLoad: 0, uartNoise: 0 })
  s.setSpeed(1)
}

/** calm, then a fault that builds up over `sec` seconds of simulated time */
const fault = (key: Parameters<SimStore['setFault']>[0], level: number, sec: number, speed = 1) => (s: SimStore) => {
  calm(s)
  s.setSpeed(speed)
  s.setFault(key, level, sec)
}

// bench-local landmarks (see components/bench/*)
const BOARD: [number, number, number] = [-0.9, 0.6, 3.5]
const MOTOR: [number, number, number] = [0.3, 1.2, 0]

export const SLIDES: SlideDef[] = [
  /* ---------------- why ---------------- */
  { id: 'title', bg: '#5b2eff', ink: '#ffffff', pop: '#ffe400', model: 'right', cam: { pos: [11, 6.2, 13], look: [0.8, 0.9, 0.6], fov: 30 }, drift: 0.09, enter: calm },
  {
    id: 'problem',
    bg: '#ff3b5c',
    ink: '#ffffff',
    pop: '#1a0b2e',
    model: 'left',
    cam: { pos: [-4.6, 2.9, 4.8], look: [-0.2, 1.1, 0], fov: 30 },
    enter: (s) => {
      calm(s)
      s.setFault('bearing', 0.85, 12)
      s.setFault('overload', 0.8, 12)
    },
  },
  { id: 'idea', bg: '#ffd400', ink: '#1a1300', pop: '#ff3b5c', model: 'right', cam: { pos: [9.5, 6.6, 11.5], look: [1, 1, 1], fov: 30 }, drift: 0.05, enter: calm },
  { id: 'map', bg: '#1238ff', ink: '#ffffff', pop: '#ffd400', model: 'center', cam: { pos: [3.5, 10, 13.5], look: [0.8, -1.2, 1.2], fov: 32 }, drift: 0.04, enter: calm },

  /* ---------------- the motor and its senses ---------------- */
  { id: 'motor', bg: '#00c9a7', ink: '#03221c', pop: '#ffffff', model: 'left', cam: { pos: [6.4, 3.6, 7.6], look: MOTOR, fov: 28 }, drift: 0.07, enter: calm },
  { id: 'vibration', bg: '#12b5ff', ink: '#03182b', pop: '#ffffff', model: 'right', cam: { pos: [3.4, 2.9, 3.4], look: [1.2, 1.5, 0], fov: 30 }, drift: 0.12, enter: calm },
  { id: 'temperature', bg: '#ff7a1a', ink: '#2b1000', pop: '#ffffff', model: 'left', cam: { pos: [-2.9, 2.5, 3.9], look: [-0.5, 1.3, 0.9], fov: 30 }, drift: 0.12, enter: fault('overload', 1, 8) },
  { id: 'current', bg: '#9b5cff', ink: '#ffffff', pop: '#ffe400', model: 'right', cam: { pos: [3.4, 2.5, 4.8], look: [0.45, 0.8, 1.7], fov: 30 }, drift: 0.1, enter: calm },
  { id: 'speed', bg: '#ff4fd8', ink: '#2b0524', pop: '#ffffff', model: 'left', cam: { pos: [5.0, 2.6, 2.9], look: [2.1, 1.3, 0], fov: 30 }, drift: 0.12, enter: calm },

  /* ---------------- the brain ---------------- */
  { id: 'brain', bg: '#b8f000', ink: '#101a00', pop: '#5b2eff', model: 'right', cam: { pos: [0.9, 2.9, 7.0], look: BOARD, fov: 30 }, drift: 0.1, enter: calm },
  { id: 'adc', bg: '#ff2d55', ink: '#ffffff', pop: '#ffe14d', model: 'right', cam: { pos: [-2.8, 2.6, 6.6], look: BOARD, fov: 30 }, drift: 0.08, enter: calm },
  { id: 'dma', bg: '#00d1c1', ink: '#00211f', pop: '#ffffff', model: 'left', cam: { pos: [1.6, 3.8, 6.4], look: BOARD, fov: 30 }, drift: 0.08, enter: calm },
  { id: 'timers', bg: '#ffb800', ink: '#241800', pop: '#ffffff', model: 'right', cam: { pos: [4.6, 2.4, 2.2], look: [2.1, 1.2, 0], fov: 30 }, drift: 0.1, enter: calm },

  /* ---------------- thinking ---------------- */
  { id: 'pipeline', bg: '#1f4bff', ink: '#ffffff', pop: '#b8f000', model: 'center', cam: { pos: [2.2, 9.4, 11.5], look: [0.5, 0.2, 1.5], fov: 34 }, drift: 0.04, enter: calm },
  { id: 'fft', bg: '#7a00ff', ink: '#ffffff', pop: '#b8f000', model: 'right', cam: { pos: [3.8, 2.4, -2.6], look: [1.0, 1.3, 0], fov: 30 }, drift: 0.1, enter: fault('bearing', 0.7, 10) },
  { id: 'features', bg: '#ff6a3d', ink: '#ffffff', pop: '#1a0b2e', model: 'left', cam: { pos: [-3.6, 2.6, 4.2], look: [0.2, 1.1, 0], fov: 30 }, drift: 0.1, enter: fault('bearing', 0.7, 6) },
  { id: 'rtos', bg: '#e6007a', ink: '#ffffff', pop: '#ffe400', model: 'left', cam: { pos: [-4.2, 3.6, 7.6], look: [-0.9, 0.8, 3.4], fov: 30 }, drift: 0.08, enter: calm },

  /* ---------------- deciding ---------------- */
  { id: 'fsm', bg: '#2ee6a6', ink: '#04241a', pop: '#5b2eff', model: 'center', cam: { pos: [7.4, 7.6, 11.5], look: [1.6, -0.6, 1.2], fov: 32 }, drift: 0.05, enter: fault('misalign', 0.7, 3) },
  { id: 'light', bg: '#0b0b24', ink: '#ffffff', pop: '#2ee67c', model: 'right', cam: { pos: [7.6, 2.9, 6.6], look: [4.5, 1.5, 2.5], fov: 30 }, drift: 0.1, enter: calm },
  { id: 'faults', bg: '#ffd400', ink: '#1a1300', pop: '#e6007a', model: 'left', cam: { pos: [3.2, 4.8, 8.2], look: [1.6, 1.0, 0.2], fov: 30 }, drift: 0.08, enter: calm },
  { id: 'classify', bg: '#00b3ff', ink: '#021a26', pop: '#ffffff', model: 'right', cam: { pos: [2.6, 3.6, 3.8], look: [0.15, 1.9, 0.2], fov: 30 }, drift: 0.1, enter: fault('electrical', 0.7, 3) },
  { id: 'wear', bg: '#ff5a1f', ink: '#ffffff', pop: '#1a0b2e', model: 'left', cam: { pos: [-6.2, 3.8, 6.6], look: [0.4, 1.1, 0], fov: 30 }, enter: fault('bearing', 0.95, 10, 4) },
  {
    id: 'trip',
    bg: '#0a8f5a',
    ink: '#ffffff',
    pop: '#ffe400',
    model: 'right',
    cam: { pos: [4.2, 3.8, 7.2], look: [1.1, 0.9, 1.5], fov: 30 },
    enter: (s) => {
      calm(s)
      s.setSpeed(4)
      s.setConfig({ autoProtect: true, tripDelayMs: 1500 })
      s.setFault('bearing', 0.95, 6)
    },
  },

  /* ---------------- talking & remembering ---------------- */
  {
    id: 'comms',
    bg: '#c13bff',
    ink: '#ffffff',
    pop: '#ffe14d',
    model: 'center',
    cam: { pos: [-1.5, 8.6, 11.5], look: [-0.4, -1.0, 2.2], fov: 32 },
    drift: 0.05,
    enter: (s) => {
      calm(s)
      s.setConfig({ uartNoise: 0.3 })
    },
  },
  { id: 'memory', bg: '#ffe600', ink: '#1f1a00', pop: '#ff2d55', model: 'right', cam: { pos: [-0.9, 4.6, 6.4], look: BOARD, fov: 30 }, drift: 0.1, enter: calm },
  { id: 'latency', bg: '#0033cc', ink: '#ffffff', pop: '#00f0ff', model: 'center', cam: { pos: [6.4, 7.4, 10.5], look: [0.6, -0.5, 0.4], fov: 32 }, drift: 0.05, enter: calm },

  /* ---------------- wrap-up ---------------- */
  { id: 'numbers', bg: '#00b8d9', ink: '#001d26', pop: '#ffffff', model: 'left', cam: { pos: [4.6, 3.0, 6.0], look: [0.4, 1.0, 0.2], fov: 30 }, drift: 0.06, enter: calm },
  { id: 'concepts', bg: '#2b0d5e', ink: '#ffffff', pop: '#ffe400', model: 'center', cam: { pos: [10.5, 7.5, 12.5], look: [0.8, 1.0, 0.8], fov: 34 }, drift: 0.07, enter: calm },
  { id: 'thanks', bg: '#ff3b5c', ink: '#ffffff', pop: '#ffe400', model: 'right', cam: { pos: [7.8, 4.4, 9.6], look: [0.9, 1.0, 0.6], fov: 30 }, drift: 0.12, enter: calm },
]
