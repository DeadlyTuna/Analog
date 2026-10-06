/**
 * Simulator facade: the plant (motor + fault injection) and the firmware, on one virtual clock.
 * Pure TypeScript — no React, no DOM — so it can be driven headlessly in tests.
 */
import {
  CLASS_META,
  FAULT_KEYS,
  FAULT_META,
  RATED,
  TASK_SPECS,
  STRESS_SPEC,
  type FaultKey,
  type FsmState,
  type TaskId,
} from './config'
import {
  Firmware,
  type ConsoleLine,
  type Diagnosis,
  type FwConfig,
  type Gpio,
  type HealthState,
  type HostLink,
  type IndicatorState,
  type LogEntry,
  type Summary,
} from './firmware'
import { MotorModel, zeroFaults, type Faults, type Truth } from './motor'
import { ORD } from './rtos'
import type { Evidence } from './classifier'

export interface Live {
  tMs: number
  powered: boolean
  omega: number
  phi: number
  rpm: number
  tempC: number
  iRms: number
  vibRms: number
  load: number
  faults: Faults
}

export interface TaskRow {
  id: TaskId
  name: string
  prio: number
  trigger: string
  periodMs: number
  deadlineMs: number
  color: string
  state: 'RUNNING' | 'READY' | 'BLOCKED'
  load: number
  wcetMs: number
  respLast: number
  respAvg: number
  respMin: number
  respMax: number
  jobs: number
  misses: number
  overruns: number
  preemptions: number
  startLatMax: number
  stackUsed: number
  stackWords: number
}

export interface IsrRow {
  name: string
  source: string
  nvic: number
  rateHz: number
  count: number
  latencyUs: number
  maxLatencyUs: number
  costUs: number
  lastAgoMs: number
}

export interface Detect {
  key: FaultKey
  mode: 'instant' | 'gradual'
  atMs: number
  ms: number | null
  severityAtDetect: number | null
}

export interface Snapshot {
  seq: number
  tMs: number
  mains: boolean
  state: FsmState
  stateSinceMs: number
  reason: string
  truth: Truth
  faults: { key: FaultKey; current: number; target: number; rate: number }[]
  meas: {
    vibRms: number
    kurt: number
    crest: number
    a1x: number
    a2x: number
    aLine: number
    hfRatio: number
    curRms: number
    ripple: number
    thd: number
    tempC: number
    rpm: number
    slipPct: number
    frHz: number
    aBpfo: number
  }
  indicators: IndicatorState[]
  evidence: Evidence
  diag: Diagnosis
  advice: string
  health: HealthState
  gpio: Gpio
  summary: Summary
  detect: Detect | null
  rtos: {
    tick: number
    uptimeMs: number
    cpuLoad: number
    peakLoad: number
    isrLoad: number
    ctxSwitches: number
    preemptions: number
    tasks: TaskRow[]
    isrs: IsrRow[]
    dmaOverruns: number
    adcCount: number
    pulseCount: number
    featureCount: number
    bootCount: number
    resetReason: string
    wdgRemainMs: number
    wdgTimeoutMs: number
    clockMHz: number
  }
  fsm: { warnCnt: number; critCnt: number; clearCnt: number; downCnt: number; inhibitLeftMs: number; tripInMs: number | null; critSinceMs: number }
  flashHead: number
  /** latest raw 12-bit conversion results */
  adc: { vib: number; cur: number; temp: number; dmaPos: number }
  host: HostLink
  events: LogEntry[]
  console: ConsoleLine[]
  mem: ReturnType<Firmware['memory']>
  flash: { writes: number; wraps: number; erased: number }
  cfg: FwConfig
}

export class Simulator {
  readonly seed: number
  readonly motor: MotorModel
  readonly fw: Firmware
  mains = true
  readonly faults: Faults = zeroFaults()
  readonly targets: Faults = zeroFaults()
  private rates: Record<FaultKey, number> = { overload: 0, bearing: 0, misalign: 0, imbalance: 0, cooling: 0, electrical: 0 }
  readonly live: Live
  detect: Detect | null = null
  private seq = 0

  constructor(seed = 7) {
    this.seed = seed
    this.motor = new MotorModel(seed)
    this.motor.tempC = 46 // warm start: the motor has run recently
    this.fw = new Firmware(this.motor, seed)
    this.live = {
      tMs: 0,
      powered: false,
      omega: 0,
      phi: 0,
      rpm: 0,
      tempC: this.motor.tempC,
      iRms: 0,
      vibRms: 0,
      load: 1,
      faults: this.faults,
    }
    this.fw.onStateChange = (from, to, t) => this.onState(from, to, t)
    this.fw.rtos.at(10, ORD.WORLD, this.worldStep)
    this.fw.start()
    this.hostLog('sim', 'SIM', 'Digital twin ready — 1.5 kW induction motor on a brake dynamometer.')
  }

  get tMs() {
    return this.fw.rtos.now
  }

  /** Advance the whole system by `dtMs` of virtual time. */
  advance(dtMs: number) {
    this.fw.rtos.advanceTo(this.fw.rtos.now + dtMs)
  }

  /* ---------- plant ---------- */

  private worldStep = () => {
    const dt = 0.01
    for (const k of FAULT_KEYS) {
      const cur = this.faults[k]
      const tgt = this.targets[k]
      if (cur !== tgt) {
        const step = this.rates[k] * dt
        const diff = tgt - cur
        this.faults[k] = Math.abs(diff) <= step ? tgt : cur + Math.sign(diff) * step
      }
    }
    this.motor.powered = this.mains && !this.fw.gpio.relayTrip
    this.motor.slowStep(dt, this.faults)
    const L = this.live
    const m = this.motor
    L.tMs = this.fw.rtos.now
    L.powered = m.powered
    L.omega = m.omega
    L.phi = m.phi
    L.rpm = (m.omega * 60) / (2 * Math.PI)
    L.tempC = m.tempC
    L.iRms = m.iRms
    L.load = m.load
    L.vibRms = m.analyticVibRms()
    this.fw.rtos.at(this.fw.rtos.now + 10, ORD.WORLD, this.worldStep)
  }

  private onState(from: FsmState, to: FsmState, t: number) {
    const d = this.detect
    if (d && d.ms === null && (to === 'WARNING' || to === 'CRITICAL') && (from === 'HEALTHY' || from === 'WARNING')) {
      d.ms = t - d.atMs
      d.severityAtDetect = this.faults[d.key]
    }
  }

  hostLog(level: LogEntry['level'], code: string, msg: string) {
    this.fw.log(level, code, msg, 'HOST')
  }

  /* ---------- fault injection ---------- */

  /** Set a fault to `target` (0…1). `gradualSec` ramps it in; otherwise it is applied instantly. */
  setFault(key: FaultKey, target: number, gradualSec = 0, quiet = false) {
    target = Math.min(1, Math.max(0, target))
    const cur = this.faults[key]
    if (Math.abs(target - cur) < 1e-6 && Math.abs(this.targets[key] - target) < 1e-6) return
    this.targets[key] = target
    if (gradualSec > 0 && target !== cur) {
      this.rates[key] = Math.abs(target - cur) / gradualSec
    } else {
      this.faults[key] = target
      this.rates[key] = 1e9
    }
    if (!quiet) this.noteInjection(key, cur, target, gradualSec)
  }

  /** Record an injection in the event log and start a detection-latency measurement (also used to commit a slider drag). */
  noteInjection(key: FaultKey, from: number, to: number, gradualSec: number) {
    const meta = FAULT_META[key]
    if (to > from) {
      this.detect = {
        key,
        mode: gradualSec > 0 ? 'gradual' : 'instant',
        atMs: this.tMs,
        ms: null,
        severityAtDetect: null,
      }
      this.fw.summary.detectMs = null
      this.fw.summary.warnLeadSec = null
      this.fw.summary.predLeadSec = null
    }
    if (to === 0) {
      this.hostLog('sim', 'SIM', `${meta.label} removed.`)
    } else {
      this.hostLog(
        'sim',
        'INJECT',
        `${meta.label} → ${(to * 100).toFixed(0)}% ${gradualSec > 0 ? `(building up over ${gradualSec.toFixed(0)} s)` : '(sudden)'}`,
      )
    }
  }

  /** "Do maintenance": every fault is removed at once. */
  maintenance() {
    const had = FAULT_KEYS.filter((k) => this.targets[k] > 0)
    for (const k of FAULT_KEYS) {
      this.targets[k] = 0
      this.faults[k] = 0
      this.rates[k] = 1e9
    }
    this.detect = null
    if (had.length) this.hostLog('sim', 'REPAIR', `Maintenance done — ${had.map((k) => FAULT_META[k].label.toLowerCase()).join(', ')} cleared.`)
  }

  setMains(on: boolean) {
    if (this.mains === on) return
    this.mains = on
    this.hostLog('sim', 'SIM', on ? 'Contactor closed — direct-on-line start.' : 'Contactor opened by operator — motor coasts down.')
  }

  resetTrip() {
    this.fw.resetTrip()
  }

  setConfig(patch: Partial<FwConfig>) {
    const fw = this.fw
    if (patch.clockMHz !== undefined && patch.clockMHz !== fw.cfg.clockMHz) fw.setClock(patch.clockMHz)
    if (patch.stressLoad !== undefined) fw.setStress(patch.stressLoad)
    const rest = { ...patch }
    delete rest.clockMHz
    delete rest.stressLoad
    Object.assign(fw.cfg, rest)
    if (patch.autoProtect !== undefined) this.hostLog('sim', 'CONFIG', `Auto-trip on critical ${patch.autoProtect ? 'enabled' : 'disabled'}.`)
  }

  /* ---------- snapshot ---------- */

  snapshot(): Snapshot {
    const fw = this.fw
    const rt = fw.rtos
    const f = fw.feat
    const slipPct = fw.rpm > 100 ? Math.max(0, (1 - fw.rpm / RATED.sync) * 100) : 0

    const rows: TaskRow[] = []
    for (const t of rt.tasks) {
      const id = t.def.id as TaskId
      const spec = TASK_SPECS.find((s) => s.id === id)
      if (id === STRESS_SPEC.id && fw.cfg.stressLoad === 0 && t.stats.jobs === 0) continue
      const s = t.stats
      rows.push({
        id,
        name: t.def.name,
        prio: t.def.prio,
        trigger: spec ? spec.trigger : 'periodic 20 ms',
        periodMs: spec ? spec.periodMs : STRESS_SPEC.periodMs,
        deadlineMs: t.def.deadlineMs,
        color: spec ? spec.color : STRESS_SPEC.color,
        state: rt.stateOf(t),
        load: t.load,
        wcetMs: spec ? spec.wcetMs * rt.clockScale : fw.cfg.stressLoad * STRESS_SPEC.periodMs,
        respLast: s.respLast,
        respAvg: s.jobs ? s.respSum / s.jobs : 0,
        respMin: s.jobs ? s.respMin : 0,
        respMax: s.respMax,
        jobs: s.jobs,
        misses: s.misses,
        overruns: s.overruns,
        preemptions: t.preemptions,
        startLatMax: s.startLatMax,
        stackUsed: fw.stackHigh[id] ?? 0,
        stackWords: t.def.stackWords,
      })
    }
    rows.sort((a, b) => b.prio - a.prio)

    const isrs: IsrRow[] = []
    for (const s of rt.isrs.values()) {
      isrs.push({
        name: s.name,
        source: s.source,
        nvic: s.nvic,
        rateHz: s.rateHz,
        count: s.count,
        latencyUs: s.latencyUs,
        maxLatencyUs: s.maxLatencyUs,
        costUs: s.costUs * rt.clockScale,
        lastAgoMs: s.lastAt < 0 ? -1 : rt.now - s.lastAt,
      })
    }

    return {
      seq: ++this.seq,
      tMs: rt.now,
      mains: this.mains,
      state: fw.fsm.state,
      stateSinceMs: fw.fsm.since,
      reason: fw.fsm.reason,
      truth: this.motor.truth(),
      faults: FAULT_KEYS.map((key) => ({
        key,
        current: this.faults[key],
        target: this.targets[key],
        rate: this.rates[key],
      })),
      meas: {
        vibRms: f.vibRms,
        kurt: f.kurt,
        crest: f.crest,
        a1x: f.a1x,
        a2x: f.a2x,
        aLine: f.aLine,
        hfRatio: f.hfRatio,
        curRms: f.curRms,
        ripple: f.ripple,
        thd: f.thd,
        tempC: fw.tempC,
        rpm: fw.rpm,
        slipPct,
        frHz: f.frHz,
        aBpfo: f.aBpfo,
      },
      indicators: fw.indicators.map((i) => ({ ...i })),
      evidence: { ...fw.evidence },
      diag: { ...fw.diag },
      advice: CLASS_META[fw.diag.cls].advice,
      health: { ...fw.health },
      gpio: { ...fw.gpio },
      summary: { ...fw.summary },
      detect: this.detect ? { ...this.detect } : null,
      rtos: {
        tick: rt.tickCount,
        uptimeMs: fw.uptimeMs,
        cpuLoad: rt.load,
        peakLoad: rt.peakLoad,
        isrLoad: rt.isrMs / Math.max(1, rt.now),
        ctxSwitches: rt.ctxSwitches,
        preemptions: rt.preemptions,
        tasks: rows,
        isrs,
        dmaOverruns: fw.dmaOverruns,
        adcCount: fw.adcCount,
        pulseCount: fw.pulseCount,
        featureCount: fw.featureCount,
        bootCount: fw.bootCount,
        resetReason: fw.lastResetReason,
        wdgRemainMs: Math.max(0, fw.wdgTimeoutMs - (rt.now - fw.lastKickMs)),
        wdgTimeoutMs: fw.wdgTimeoutMs,
        clockMHz: fw.cfg.clockMHz,
      },
      fsm: {
        warnCnt: fw.fsm.warnCnt,
        critCnt: fw.fsm.critCnt,
        clearCnt: fw.fsm.clearCnt,
        downCnt: fw.fsm.downCnt,
        inhibitLeftMs: fw.fsm.state === 'STARTUP' ? Math.max(0, fw.fsm.inhibitUntil - rt.now) : 0,
        tripInMs: fw.cfg.autoProtect && fw.fsm.state === 'CRITICAL' ? Math.max(0, fw.cfg.tripDelayMs - (rt.now - fw.fsm.critSince)) : null,
        critSinceMs: fw.fsm.critSince,
      },
      flashHead: fw.flash.writes % fw.flashRing.length,
      adc: { vib: fw.dmaVib[(fw.dmaPos + 127) % 128], cur: fw.dmaCur[(fw.dmaPos + 127) % 128], temp: fw.tempRaw, dmaPos: fw.dmaPos },
      host: { ...fw.host },
      events: fw.events.slice(-120),
      console: fw.console.slice(-140),
      mem: fw.memory(),
      flash: { ...fw.flash },
      cfg: { ...fw.cfg },
    }
  }
}
