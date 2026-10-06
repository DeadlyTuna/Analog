/* Runs the guided demo headlessly and reports how each step ended. Run: npx tsx scripts/tourtest.ts */
import { Simulator } from '../lib/sim/simulator'
import { TOUR_STEPS, TourRunner } from '../lib/sim/tour'

const sim = new Simulator(7)
const tour = new TourRunner()
sim.advance(1500) // let the splash screen "pass"
tour.start(sim)

let last = -1
let stepStartedAt = sim.tMs
const t0 = sim.tMs
for (let i = 0; i < 20000 && tour.active; i++) {
  sim.advance(20)
  tour.tick(sim)
  const idx = tour.state(sim).index
  if (tour.active && idx !== last) {
    if (last >= 0) {
      const step = TOUR_STEPS[last]
      const dur = sim.tMs - stepStartedAt
      const via = dur >= step.maxMs - 25 ? 'TIMED OUT' : 'reached state'
      console.log(`step ${last + 1} ${step.id.padEnd(9)} ${(dur / 1000).toFixed(1).padStart(5)} s  (min ${step.minMs / 1000}, max ${step.maxMs / 1000})  ${via}  → state now ${sim.fw.fsm.state}`)
    }
    last = idx
    stepStartedAt = sim.tMs
  }
}
const s = sim.snapshot()
console.log(`total ${((sim.tMs - t0) / 1000).toFixed(0)} s of simulated time · final state ${s.state} · faults ${s.faults.map((f) => `${f.key}:${f.target.toFixed(2)}`).join(' ')} · trips in log: ${s.events.filter((e) => e.code === 'TRIP').length}`)
