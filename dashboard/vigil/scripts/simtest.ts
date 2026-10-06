/* Headless end-to-end test of the whole simulator. Run: npx tsx scripts/simtest.ts [section] */
import { FAULT_KEYS, FAULT_META, type FaultKey } from '../lib/sim/config'
import { Simulator, type Snapshot } from '../lib/sim/simulator'

const only = process.argv[2]

function advance(sim: Simulator, seconds: number, every = 0, cb?: (s: Snapshot, t: number) => void) {
  const stepMs = 20
  const n = Math.round((seconds * 1000) / stepMs)
  let next = every
  for (let i = 0; i < n; i++) {
    sim.advance(stepMs)
    const t = (i + 1) * stepMs / 1000
    if (cb && every > 0 && t + 1e-9 >= next) {
      cb(sim.snapshot(), t)
      next += every
    }
  }
}

const f = (x: number, d = 2) => x.toFixed(d)
const line = (s: Snapshot) =>
  `${s.state.padEnd(8)} HI=${f(s.health.hi, 0).padStart(3)} cls=${s.diag.cls.padEnd(10)} ev=${f(s.diag.evidence)} | T=${f(s.meas.tempC, 1)} V=${f(s.meas.vibRms)} I=${f(s.meas.curRms)} N=${f(s.meas.rpm, 0)} kurt=${f(s.meas.kurt, 1)} a1=${f(s.meas.a1x)} a2=${f(s.meas.a2x)} rip=${f(s.meas.ripple * 100, 1)}%`

function section(name: string, fn: () => void) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) return
  console.log(`\n=== ${name} ===`)
  const t0 = performance.now()
  fn()
  console.log(`   (${((performance.now() - t0) / 1000).toFixed(2)} s wall)`)
}

section('boot + normal (35 s)', () => {
  const sim = new Simulator(7)
  advance(sim, 35, 5, (s, t) => console.log(`t=${String(t).padStart(2)}s`, line(s)))
  const s = sim.snapshot()
  console.log('events:')
  for (const e of s.events.slice(-8)) console.log(`   [${(e.tMs / 1000).toFixed(2)}] ${e.level.padEnd(4)} ${e.code.padEnd(8)} ${e.msg}`)
  console.log('tasks:')
  for (const t of s.rtos.tasks)
    console.log(
      `   ${t.id.padEnd(5)} prio=${t.prio} load=${f(t.load * 100, 1).padStart(4)}% resp avg=${f(t.respAvg, 2)} max=${f(t.respMax, 2)} ms  jobs=${t.jobs} miss=${t.misses} overrun=${t.overruns} preempt=${t.preemptions} stack=${t.stackUsed}/${t.stackWords}`,
    )
  console.log(`   CPU ${f(s.rtos.cpuLoad * 100, 1)}%  ctx=${s.rtos.ctxSwitches} preempt=${s.rtos.preemptions} dmaOverruns=${s.rtos.dmaOverruns} adc=${s.rtos.adcCount} pulses=${s.rtos.pulseCount} feats=${s.rtos.featureCount}`)
  console.log(`   host rxOk=${s.host.rxOk} crcErr=${s.host.crcErr}  modbus ok=${s.host.modbusOk} regs=${s.host.modbusRegs.join(',')}`)
  for (const i of s.rtos.isrs) console.log(`   ISR ${i.name.padEnd(13)} count=${i.count} lat=${f(i.latencyUs, 2)}us max=${f(i.maxLatencyUs, 2)}us`)
})

section('overload (spec check)', () => {
  const sim = new Simulator(7)
  advance(sim, 30)
  console.log('before :', line(sim.snapshot()))
  sim.setFault('overload', 1)
  advance(sim, 60, 10, (s, t) => console.log(`+${String(t).padStart(2)}s`, line(s)))
  const s = sim.snapshot()
  console.log('detect:', JSON.stringify(s.detect), ' summary:', JSON.stringify(s.summary))
})

section('each fault, sudden', () => {
  for (const k of FAULT_KEYS) {
    const sim = new Simulator(11)
    advance(sim, 25)
    const sev = FAULT_META[k].preset
    sim.setFault(k, sev)
    const marks: string[] = []
    advance(sim, 70, 0)
    const s = sim.snapshot()
    console.log(`${k.padEnd(10)} sev=${sev}:`, line(s), ` detect=${s.detect?.ms != null ? f(s.detect.ms / 1000, 2) + 's' : 'n/a'}`)
    void marks
  }
})

section('severity sweep', () => {
  for (const k of FAULT_KEYS) {
    for (const sev of [0.2, 0.4, 0.6, 0.8, 1]) {
      const sim = new Simulator(5)
      advance(sim, 22)
      sim.setFault(k, sev)
      advance(sim, k === 'cooling' ? 140 : 50)
      const s = sim.snapshot()
      console.log(`${k.padEnd(10)} ${String(Math.round(sev * 100)).padStart(3)}%`, line(s))
    }
  }
})

section('progressive bearing wear (0→80% over 60 s)', () => {
  const sim = new Simulator(7)
  advance(sim, 25)
  sim.setFault('bearing', 0.8, 60)
  advance(sim, 100, 5, (s, t) => console.log(`+${String(t).padStart(3)}s sev=${f(s.faults[1].current)}`, line(s), ` rul=${s.health.rulSec != null ? f(s.health.rulSec, 0) : '-'} ${s.health.driver}`))
  console.log('summary:', JSON.stringify(sim.snapshot().summary))
})

section('progressive cooling failure (0→100% over 60 s)', () => {
  const sim = new Simulator(7)
  advance(sim, 25)
  sim.setFault('cooling', 1, 60)
  advance(sim, 150, 6, (s, t) => console.log(`+${String(t).padStart(3)}s sev=${f(s.faults[4].current)}`, line(s), ` rul=${s.health.rulSec != null ? f(s.health.rulSec, 0) : '-'} ${s.health.driver}`))
  console.log('summary:', JSON.stringify(sim.snapshot().summary))
})

section('combined: overload + cooling', () => {
  const sim = new Simulator(7)
  advance(sim, 25)
  sim.setFault('overload', 1)
  sim.setFault('cooling', 0.6)
  advance(sim, 80, 10, (s, t) => console.log(`+${String(t).padStart(3)}s`, line(s)))
})

section('stress + watchdog', () => {
  for (const load of [0.3, 0.6, 0.85, 0.95, 0.98]) {
    const sim = new Simulator(7)
    advance(sim, 15)
    sim.setConfig({ stressLoad: load })
    advance(sim, 20)
    const s = sim.snapshot()
    console.log(`stress ${Math.round(load * 100)}% -> CPU ${f(s.rtos.cpuLoad * 100, 0)}%  boots=${s.rtos.bootCount}`)
    for (const t of s.rtos.tasks) console.log(`      ${t.id.padEnd(6)} resp avg=${f(t.respAvg, 1).padStart(7)} max=${f(t.respMax, 1).padStart(8)} miss=${t.misses} overrun=${t.overruns}`)
  }
})

section('protective trip', () => {
  const sim = new Simulator(7)
  sim.setConfig({ autoProtect: true })
  advance(sim, 25)
  sim.setFault('imbalance', 1)
  advance(sim, 25, 3, (s, t) => console.log(`+${t}s`, line(s), ` relay=${s.gpio.relayTrip} powered=${s.truth.powered} rpm_true=${f(s.truth.rpm, 0)}`))
  sim.resetTrip()
  sim.maintenance()
  advance(sim, 15, 3, (s, t) => console.log(`after reset +${t}s`, line(s)))
})

section('uart noise', () => {
  const sim = new Simulator(7)
  sim.setConfig({ uartNoise: 0.3 })
  advance(sim, 60)
  const s = sim.snapshot()
  console.log(`rxOk=${s.host.rxOk} crcErr=${s.host.crcErr}`)
})

section('clock sweep', () => {
  for (const mhz of [16, 24, 48, 84, 168]) {
    const sim = new Simulator(7)
    sim.setConfig({ clockMHz: mhz })
    advance(sim, 15)
    const s = sim.snapshot()
    console.log(`${String(mhz).padStart(3)} MHz CPU=${f(s.rtos.cpuLoad * 100, 1)}%  DSP resp=${f(s.rtos.tasks.find((t) => t.id === 'DSP')!.respAvg, 2)} ms  misses=${s.rtos.tasks.reduce((a, t) => a + t.misses, 0)}`)
  }
})

section('throughput', () => {
  const sim = new Simulator(7)
  const t0 = performance.now()
  advance(sim, 60)
  const wall = (performance.now() - t0) / 1000
  console.log(`60 s of sim in ${wall.toFixed(2)} s wall → ${(60 / wall).toFixed(1)}× real time`)
})

export type { FaultKey }
