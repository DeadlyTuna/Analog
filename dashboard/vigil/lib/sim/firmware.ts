/**
 * Layer 2 — the firmware.
 *
 *   TIM3 ──► ADC1 ──► DMA (circular) ──half/full ISR──► ACQ ─► DSP ─► FDT ─► (GPIO, relay)
 *   TIM2 tacho capture ──────────────────────────────────┘             │
 *   HLTH (500 ms): health index, trend, remaining life, watchdog        │
 *   COMM (1 s):    telemetry frame + Modbus reply over UART ◄───────────┘
 *
 * The code below is structured like real RTOS firmware (ISRs release tasks, tasks pass data through
 * queues, outputs are GPIO pins) but runs on the virtual-time scheduler in rtos.ts.
 */
import { Sensors, countsToAmps, countsToCelsius, countsToG } from './adc'
import { classify, diagnose, emptyEvidence, type Evidence } from './classifier'
import {
  ADC_DT_MS,
  BIN_HZ,
  BPFO_RATIO,
  CLASS_INDEX,
  CLASS_META,
  CLASS_ORDER,
  DMA_HALF,
  DMA_LEN,
  DSP_HOP,
  DSP_N,
  HI_CRITICAL,
  INDICATORS,
  MCU,
  PREDICT_HORIZON_S,
  RATED,
  SPEC_BINS,
  STATE_CODE,
  STRESS_SPEC,
  TASK_SPECS,
  degradation,
  type ClassId,
  type FsmState,
  type IndicatorDef,
  type TaskId,
} from './config'
import { bandPower, clamp, dualSpectrum, hannWindow, regress, toneAmp, waveStats, type WaveStats } from './dsp'
import { MotorModel } from './motor'
import {
  FRAME_LEN,
  buildFrame,
  buildModbusRequest,
  buildModbusResponse,
  parseFrame,
  parseModbusResponse,
  toHex,
  type Telemetry,
} from './protocol'
import { Ring } from './ring'
import { ORD, Rtos, type Job } from './rtos'
import { Rng } from './rng'

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type LogLevel = 'info' | 'ok' | 'warn' | 'crit' | 'pred' | 'sim'

export interface LogEntry {
  id: number
  tMs: number
  level: LogLevel
  code: string
  msg: string
  src: 'FW' | 'HOST'
}

export interface ConsoleLine {
  id: number
  tMs: number
  level: LogLevel
  text: string
}

export interface FwConfig {
  clockMHz: number
  autoProtect: boolean
  tripDelayMs: number
  warnDebounce: number
  critDebounce: number
  clearDebounce: number
  stressLoad: number
  uartNoise: number
  startupInhibitMs: number
  buzzer: boolean
}

export const DEFAULT_FW_CONFIG: FwConfig = {
  clockMHz: 48,
  autoProtect: false,
  tripDelayMs: 5000,
  warnDebounce: 3,
  critDebounce: 3,
  clearDebounce: 15,
  stressLoad: 0,
  uartNoise: 0,
  startupInhibitMs: 3500,
  buzzer: true,
}

export interface Features {
  tMs: number
  vibRms: number
  vibPeak: number
  crest: number
  kurt: number
  a1x: number
  a2x: number
  a3x: number
  aLine: number
  aBpfo: number
  hfRatio: number
  curRms: number
  curCrest: number
  ripple: number
  thd: number
  frHz: number
}

const zeroFeatures = (): Features => ({
  tMs: 0,
  vibRms: 0,
  vibPeak: 0,
  crest: 0,
  kurt: 0,
  a1x: 0,
  a2x: 0,
  a3x: 0,
  aLine: 0,
  aBpfo: 0,
  hfRatio: 0,
  curRms: 0,
  curCrest: 0,
  ripple: 0,
  thd: 0,
  frHz: 0,
})

export interface IndicatorState {
  def: IndicatorDef
  value: number
  level: 0 | 1 | 2
  c: number
}

export interface Diagnosis {
  cls: ClassId
  evidence: number
  detail: string
  also: ClassId[]
}

export interface HealthState {
  hiInst: number
  hi: number
  slopePerMin: number
  r2: number
  etaHiSec: number | null
  rulSec: number | null
  driver: string
  predicting: boolean
  predText: string
  predSinceMs: number
  valid: boolean
}

export interface Fsm {
  state: FsmState
  since: number
  reason: string
  inhibitUntil: number
  warnCnt: number
  critCnt: number
  clearCnt: number
  downCnt: number
  offCnt: number
  critSince: number
  warnSince: number
}

export interface Gpio {
  ledG: boolean
  ledY: boolean
  ledR: boolean
  buzzer: boolean
  relayTrip: boolean
}

export interface HostLink {
  rxOk: number
  crcErr: number
  lastSeq: number
  lastRxAt: number
  telemetry: Telemetry | null
  frame: Uint8Array | null
  frameOk: boolean
  crcRx: number
  crcCalc: number
  modbusReq: Uint8Array | null
  modbusResp: Uint8Array | null
  modbusRegs: number[]
  modbusOk: boolean
  bytesTx: number
}

export interface Summary {
  /** ms from an injected step change to the first non-healthy state */
  detectMs: number | null
  /** seconds between the first warning and the critical state */
  warnLeadSec: number | null
  /** seconds between the first forecast and the critical state */
  predLeadSec: number | null
}

export const SPEC_COLS = 200
export const TREND_LEN = 1200

const STACK_BASE = 0.34

/* ------------------------------------------------------------------ */
/* Firmware                                                             */
/* ------------------------------------------------------------------ */

export class Firmware {
  cfg: FwConfig
  readonly rtos: Rtos
  readonly rng: Rng
  private sensors: Sensors

  /* boot / reset */
  bootAtMs = 0
  bootCount = 1
  lastResetReason = 'power-on'
  private wdgKick = 0
  readonly wdgTimeoutMs = 2000

  /* ADC + DMA */
  readonly dmaVib = new Uint16Array(DMA_LEN)
  readonly dmaCur = new Uint16Array(DMA_LEN)
  dmaPos = 0
  adcCount = 0
  dmaOverruns = 0
  private nextAdc = 0
  private halfPending = [false, false]

  /* engineering-unit sample rings (what the scopes show) */
  readonly vibEu = new Ring(2560)
  readonly curEu = new Ring(2560)
  private newSamples = 0
  private acqRuns = 0
  private acqReleased = 0

  /* slow channels */
  tempRaw = 0
  tempC = 0
  rpmRaw = 0
  rpm = 0
  tachoPeriodUs = 0
  pulseCount = 0
  private lastPulseAt = -1
  private rpmHist = [0, 0, 0]
  private tempInit = false

  /* DSP */
  private win = hannWindow(DSP_N)
  private vWin = new Float64Array(DSP_N)
  private cWin = new Float64Array(DSP_N)
  private re = new Float64Array(DSP_N)
  private im = new Float64Array(DSP_N)
  private vStats: WaveStats = { mean: 0, rms: 0, peak: 0, crest: 0, kurt: 0 }
  private cStats: WaveStats = { mean: 0, rms: 0, peak: 0, crest: 0, kurt: 0 }
  readonly specV = new Float32Array(SPEC_BINS)
  readonly specC = new Float32Array(SPEC_BINS)
  readonly specHist = new Float32Array(SPEC_BINS * SPEC_COLS)
  specHead = 0
  specSeq = 0
  featureCount = 0
  feat: Features = zeroFeatures()

  /* fault detection */
  readonly indicators: IndicatorState[] = INDICATORS.map((def) => ({ def, value: 0, level: 0 as const, c: 0 }))
  evidence: Evidence = emptyEvidence()
  diag: Diagnosis = { cls: 'healthy', evidence: 1, detail: 'Waiting for sensor data…', also: [] }
  private smVals: number[] = INDICATORS.map(() => 0)
  private smInit = false
  private evSm: Evidence = emptyEvidence()
  fsm: Fsm = {
    state: 'OFF',
    since: 0,
    reason: 'Power-on',
    inhibitUntil: 0,
    warnCnt: 0,
    critCnt: 0,
    clearCnt: 0,
    downCnt: 0,
    offCnt: 0,
    critSince: 0,
    warnSince: 0,
  }
  gpio: Gpio = { ledG: false, ledY: false, ledR: false, buzzer: false, relayTrip: false }
  private hiPlot = 100
  fdtCycles = 0

  /* health monitoring */
  health: HealthState = {
    hiInst: 100,
    hi: 100,
    slopePerMin: 0,
    r2: 0,
    etaHiSec: null,
    rulSec: null,
    driver: '',
    predicting: false,
    predText: '',
    predSinceMs: 0,
    valid: false,
  }
  summary: Summary = { detectMs: null, warnLeadSec: null, predLeadSec: null }
  private predCnt = 0
  private hiHist: number[] = []
  private stepHoldUntil = 0
  private predClear = 0
  private hiT = new Ring(60)
  private hiV = new Ring(60)
  private pT = new Ring(40)
  private pTemp = new Ring(40)
  private pVib = new Ring(40)
  private pCur = new Ring(40)
  private scratchT = new Float64Array(64)
  private scratchY = new Float64Array(64)

  /* trends for the dashboard (10 Hz) */
  readonly trend = {
    temp: new Ring(TREND_LEN),
    vib: new Ring(TREND_LEN),
    cur: new Ring(TREND_LEN),
    rpm: new Ring(TREND_LEN),
    hi: new Ring(TREND_LEN),
  }

  /* stack high-water marks (words) */
  readonly stackHigh: Record<string, number> = {}

  /* communication */
  host: HostLink = {
    rxOk: 0,
    crcErr: 0,
    lastSeq: -1,
    lastRxAt: -1,
    telemetry: null,
    frame: null,
    frameOk: true,
    crcRx: 0,
    crcCalc: 0,
    modbusReq: null,
    modbusResp: null,
    modbusRegs: [],
    modbusOk: true,
    bytesTx: 0,
  }
  private txSeq = 0
  private missLogAt: Record<string, number> = {}
  private missCount: Record<string, number> = {}

  /* logging / memory */
  readonly events: LogEntry[] = []
  readonly console: ConsoleLine[] = []
  private logSeq = 0
  private consoleSeq = 0
  flash = { writes: 0, wraps: 0, erased: 0 }
  /** one byte per flash log slot: 0 empty · 1 info · 2 ok · 3 warn · 4 crit · 5 forecast */
  readonly flashRing = new Uint8Array(MCU.logEntries)

  /* hooks for the simulator layer */
  onStateChange: ((from: FsmState, to: FsmState, tMs: number) => void) | null = null
  onLog: ((e: LogEntry) => void) | null = null

  constructor(
    readonly motor: MotorModel,
    seed = 3,
    cfg: Partial<FwConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_FW_CONFIG, ...cfg }
    this.rng = new Rng(seed * 7919 + 13)
    this.sensors = new Sensors(new Rng(seed * 104729 + 5))
    this.rtos = new Rtos(() => this.rng.next())
    this.rtos.clockMHz = this.cfg.clockMHz
    this.rtos.onTick = this.onTick
    this.rtos.onDeadlineMiss = (task, resp) => {
      if (task.def.id === STRESS_SPEC.id) return
      const id = task.def.id
      const now = this.rtos.now
      const last = this.missLogAt[id] ?? -1e9
      this.missCount[id] = (this.missCount[id] ?? 0) + 1
      if (now - last < 2000) return
      const n = this.missCount[id]
      this.missCount[id] = 0
      this.missLogAt[id] = now
      this.log('warn', 'DEADLINE', `${id} missed its ${task.def.deadlineMs} ms deadline (response ${resp.toFixed(1)} ms)${n > 1 ? ` · ${n} misses in the last 2 s` : ''}`)
    }
    this.registerIsrs()
    this.registerTasks()
    for (const s of TASK_SPECS) this.stackHigh[s.id] = Math.round(s.stackWords * STACK_BASE)
  }

  /* ---------- helpers ---------- */

  /** Firmware "now": task code runs at the CPU's own clock, which can run a few µs ahead of the event clock. */
  private t(): number {
    return Math.max(this.rtos.cpuT, this.rtos.now)
  }

  get uptimeMs(): number {
    return this.t() - this.bootAtMs
  }

  get lastKickMs(): number {
    return this.wdgKick
  }

  /** Time (ms) of the most recent tacho edge — used by the scope as its keyphasor trigger. */
  get lastPulseMs(): number {
    return this.lastPulseAt
  }

  private get scale(): number {
    return this.rtos.clockScale
  }

  private jit(x: number, p = 0.06): number {
    return x * (1 + p * (this.rng.next() * 2 - 1))
  }

  start() {
    this.rtos.start(0)
    this.nextAdc = ADC_DT_MS
    this.rtos.at(this.nextAdc, ORD.ADC, this.onAdc)
    this.log('info', 'BOOT', `${MCU.part} @ ${this.cfg.clockMHz} MHz · FreeRTOS tick 1 kHz · ADC ${MCU.adcBits}-bit`)
    this.print('info', 'VIGIL-M1 firmware 0.9.2 (simulated)')
    this.print('info', `ADC1 ch0 vib · ch1 cur · ch4 temp · DMA circular ${DMA_LEN} · TIM3 trigger 2560 Hz`)
    this.print('info', 'scheduler start: ACQ DSP FDT HLTH COMM')
  }

  setClock(mhz: number) {
    this.cfg.clockMHz = mhz
    this.rtos.clockMHz = mhz
    this.log('info', 'CLOCK', `Core clock set to ${mhz} MHz — task execution times scale by ×${(84 / mhz).toFixed(2)}`)
  }

  setStress(load: number) {
    const prev = this.cfg.stressLoad
    this.cfg.stressLoad = clamp(load, 0, 0.98)
    if (prev === 0 && this.cfg.stressLoad > 0) this.log('warn', 'STRESS', `CPU stress injector on at ${(this.cfg.stressLoad * 100).toFixed(0)}% (priority 3)`)
    if (prev > 0 && this.cfg.stressLoad === 0) this.log('info', 'STRESS', 'CPU stress injector off')
  }

  /* ---------- logging ---------- */

  log(level: LogLevel, code: string, msg: string, src: 'FW' | 'HOST' = 'FW') {
    const e: LogEntry = { id: ++this.logSeq, tMs: this.t(), level, code, msg, src }
    this.events.push(e)
    if (this.events.length > 400) this.events.shift()
    if (src === 'FW') {
      this.flashRing[this.flash.writes % MCU.logEntries] = { info: 1, ok: 2, warn: 3, crit: 4, pred: 5, sim: 1 }[level]
      this.flash.writes++
      if (this.flash.writes % MCU.logEntries === 0) this.flash.wraps++
      if (this.flash.writes % (4096 / MCU.logEntryBytes) === 0) this.flash.erased++
    }
    this.print(level, `${src === 'HOST' ? '[host] ' : ''}${code.padEnd(8)} ${msg}`)
    this.onLog?.(e)
  }

  print(level: LogLevel, text: string) {
    this.console.push({ id: ++this.consoleSeq, tMs: this.t(), level, text })
    if (this.console.length > 260) this.console.shift()
  }

  /* ---------- interrupts ---------- */

  private registerIsrs() {
    const r = this.rtos
    r.registerIsr('SysTick', 'Core timer · 1 kHz RTOS tick', 15, 4, 1000)
    r.registerIsr('DMA1_Stream0', 'ADC1 DMA half / full transfer', 1, 6, 40)
    r.registerIsr('TIM2_CC1', 'Tacho input capture · 1 pulse per rev', 2, 3.5, 24.7)
    r.registerIsr('USART2_TC', 'UART2 transmit complete', 5, 3, 1)
  }

  /** TIM3 update event → ADC conversion → DMA writes the sample. No CPU involved until a half-buffer fills. */
  private onAdc = () => {
    const m = this.motor
    m.fastStep(ADC_DT_MS / 1000, this.rtos.now)
    const pos = this.dmaPos
    this.dmaVib[pos] = this.sensors.vibCounts(m.vib)
    this.dmaCur[pos] = this.sensors.curCounts(m.cur)
    this.adcCount++
    if (m.pulseAtMs >= 0) this.isrTacho(m.pulseAtMs)
    this.dmaPos = pos + 1
    if (this.dmaPos === DMA_HALF) this.isrDma(0)
    else if (this.dmaPos === DMA_LEN) {
      this.dmaPos = 0
      this.isrDma(1)
    }
    this.nextAdc += ADC_DT_MS
    this.rtos.at(this.nextAdc, ORD.ADC, this.onAdc)
  }

  private isrDma(half: number) {
    this.rtos.isr('DMA1_Stream0')
    if (this.halfPending[half]) this.dmaOverruns++
    this.halfPending[half] = true
    this.acqReleased++
    this.rtos.release(this.rtos.task('ACQ'), this.rtos.now, { half })
  }

  private isrTacho(pulseAt: number) {
    this.rtos.isr('TIM2_CC1')
    if (this.lastPulseAt >= 0) {
      const p = (pulseAt - this.lastPulseAt) * 1000
      if (p > 500 && p < 2e6) this.tachoPeriodUs = Math.round(p)
    }
    this.lastPulseAt = pulseAt
    this.pulseCount++
  }

  /** Runs inside the SysTick ISR: GPIO blink / buzzer patterns and the independent watchdog. */
  private onTick = (tick: number, now: number) => {
    const s = this.fsm.state
    const g = this.gpio
    g.ledG = s === 'HEALTHY' || (s === 'STARTUP' && tick % 500 < 250)
    g.ledY = s === 'WARNING'
    g.ledR = s === 'CRITICAL' || s === 'TRIPPED'
    let buz = false
    if (this.cfg.buzzer) {
      if (s === 'WARNING') buz = tick % 1500 < 80
      else if (s === 'CRITICAL') buz = tick % 400 < 120
      else if (s === 'TRIPPED') buz = tick % 1000 < 500
    }
    g.buzzer = buz
    if (this.wdgKick === 0) this.wdgKick = now
    else if (now - this.wdgKick > this.wdgTimeoutMs) this.watchdogReset()
  }

  /* ---------- tasks ---------- */

  private registerTasks() {
    const r = this.rtos
    const spec = (id: TaskId) => TASK_SPECS.find((s) => s.id === id)!

    r.addTask({
      id: 'ACQ',
      name: spec('ACQ').name,
      prio: spec('ACQ').prio,
      deadlineMs: spec('ACQ').deadlineMs,
      stackWords: spec('ACQ').stackWords,
      wcet: () => this.jit(spec('ACQ').wcetMs * this.scale) + (this.acqReleased % 4 === 0 ? 0.12 * this.scale : 0),
      run: (job) => this.runAcq(job),
    })
    r.addTask({
      id: 'DSP',
      name: spec('DSP').name,
      prio: spec('DSP').prio,
      deadlineMs: spec('DSP').deadlineMs,
      stackWords: spec('DSP').stackWords,
      wcet: () => this.jit(spec('DSP').wcetMs * this.scale, 0.05),
      onStart: () => this.dspSnapshot(),
      run: () => this.runDsp(),
    })
    r.addTask({
      id: 'FDT',
      name: spec('FDT').name,
      prio: spec('FDT').prio,
      deadlineMs: spec('FDT').deadlineMs,
      stackWords: spec('FDT').stackWords,
      wcet: () => this.jit(spec('FDT').wcetMs * this.scale) * (this.fsm.state === 'WARNING' || this.fsm.state === 'CRITICAL' ? 1.35 : 1),
      run: (job) => this.runFdt(job),
    })
    r.addTask({
      id: 'HLTH',
      name: spec('HLTH').name,
      prio: spec('HLTH').prio,
      deadlineMs: spec('HLTH').deadlineMs,
      periodMs: spec('HLTH').periodMs,
      offsetMs: 524,
      stackWords: spec('HLTH').stackWords,
      wcet: () => this.jit(spec('HLTH').wcetMs * this.scale),
      run: () => this.runHlth(),
    })
    r.addTask({
      id: 'COMM',
      name: spec('COMM').name,
      prio: spec('COMM').prio,
      deadlineMs: spec('COMM').deadlineMs,
      periodMs: spec('COMM').periodMs,
      offsetMs: 1023,
      stackWords: spec('COMM').stackWords,
      wcet: () => this.jit(1.6 * this.scale),
      run: (job) => this.runComm(job),
    })
    r.addTask({
      id: STRESS_SPEC.id,
      name: STRESS_SPEC.name,
      prio: STRESS_SPEC.prio,
      deadlineMs: STRESS_SPEC.periodMs,
      periodMs: STRESS_SPEC.periodMs,
      offsetMs: 7,
      stackWords: 128,
      enabled: () => this.cfg.stressLoad > 0,
      wcet: () => this.cfg.stressLoad * STRESS_SPEC.periodMs,
      run: () => undefined,
    })
  }

  private bumpStack(id: TaskId, activity: number) {
    const words = TASK_SPECS.find((s) => s.id === id)!.stackWords
    const used = Math.round(words * (STACK_BASE + 0.22 * activity + 0.015 * this.rng.next()))
    if (used > this.stackHigh[id]) this.stackHigh[id] = used
  }

  /* ----- ACQ: DMA half-buffer → engineering units ----- */

  private runAcq(job: Job) {
    const half = (job.data as { half: number }).half
    const base = half * DMA_HALF
    const vib = this.vibEu
    const cur = this.curEu
    for (let i = 0; i < DMA_HALF; i++) {
      vib.push(countsToG(this.dmaVib[base + i]))
      cur.push(countsToAmps(this.dmaCur[base + i]))
    }
    this.halfPending[half] = false
    this.acqRuns++
    this.newSamples += DMA_HALF
    if (this.acqRuns % 4 === 0) this.readSlowChannels()
    if (this.newSamples >= DSP_HOP) {
      this.newSamples -= DSP_HOP
      this.rtos.release(this.rtos.task('DSP'), this.t())
    }
    this.bumpStack('ACQ', 0.1)
  }

  private readSlowChannels() {
    // temperature: one ADC read, first-order IIR
    this.tempRaw = this.sensors.tempCounts(this.motor.tempC)
    const tc = countsToCelsius(this.tempRaw)
    if (!this.tempInit) {
      this.tempC = tc
      this.tempInit = true
    } else {
      this.tempC += (tc - this.tempC) * 0.35
    }
    // speed: tacho period → rpm, median-of-3, then smoothing
    const now = this.t()
    if (this.lastPulseAt < 0 || now - this.lastPulseAt > 350) this.rpmRaw = 0
    else if (this.tachoPeriodUs > 0) this.rpmRaw = 6e7 / this.tachoPeriodUs
    const h = this.rpmHist
    h.shift()
    h.push(this.rpmRaw)
    const med = [...h].sort((a, b) => a - b)[1]
    this.rpm = med === 0 ? 0 : this.rpm === 0 ? med : this.rpm + (med - this.rpm) * 0.5
  }

  /* ----- DSP: window → packed FFT → features ----- */

  private dspSnapshot() {
    this.vibEu.readLast(DSP_N, this.vWin)
    this.curEu.readLast(DSP_N, this.cWin)
  }

  private runDsp() {
    const { vWin, cWin } = this
    const vs = waveStats(vWin, DSP_N, this.vStats)
    const cs = waveStats(cWin, DSP_N, this.cStats)
    for (let i = 0; i < DSP_N; i++) {
      vWin[i] -= vs.mean
      cWin[i] -= cs.mean
    }
    dualSpectrum(vWin, cWin, this.win, this.re, this.im, this.specV, this.specC)

    const fr = this.rpm / 60
    const b1 = fr / BIN_HZ
    const present = fr > 5
    const a1x = present ? toneAmp(this.specV, b1) : 0
    const a2x = present ? toneAmp(this.specV, b1 * 2) : 0
    const a3x = present ? toneAmp(this.specV, b1 * 3) : 0
    const aBpfo = present ? toneAmp(this.specV, b1 * BPFO_RATIO, 1) : 0
    const aLine = toneAmp(this.specV, RATED.freq * 2 / BIN_HZ)
    const total = bandPower(this.specV, 1, SPEC_BINS - 1)
    const hfRatio = total > 1e-9 ? bandPower(this.specV, 80, SPEC_BINS - 1) / total : 0

    const h1 = toneAmp(this.specC, RATED.freq / BIN_HZ)
    const h3 = toneAmp(this.specC, (RATED.freq * 3) / BIN_HZ)
    const h5 = toneAmp(this.specC, (RATED.freq * 5) / BIN_HZ)
    const h7 = toneAmp(this.specC, (RATED.freq * 7) / BIN_HZ)
    const thd = h1 > 0.3 ? Math.sqrt(h3 * h3 + h5 * h5 + h7 * h7) / h1 : 0

    // per-cycle RMS spread of the current → ripple
    const seg = 51
    let mn = 1e9
    let mx = 0
    for (let k = 0; k + seg <= DSP_N; k += seg) {
      let a = 0
      for (let i = 0; i < seg; i++) a += cWin[k + i] * cWin[k + i]
      const rr = Math.sqrt(a / seg)
      if (rr < mn) mn = rr
      if (rr > mx) mx = rr
    }
    const ripple = cs.rms > 0.3 ? (mx - mn) / cs.rms : 0

    const f: Features = {
      tMs: this.t(),
      vibRms: vs.rms,
      vibPeak: vs.peak,
      crest: vs.crest,
      kurt: vs.kurt,
      a1x,
      a2x,
      a3x,
      aLine,
      aBpfo,
      hfRatio,
      curRms: cs.rms,
      curCrest: cs.crest,
      ripple,
      thd,
      frHz: fr,
    }

    this.specHist.set(this.specV, this.specHead * SPEC_BINS)
    this.specHead = (this.specHead + 1) % SPEC_COLS
    this.specSeq++
    this.featureCount++
    this.bumpStack('DSP', 0.15)
    this.rtos.release(this.rtos.task('FDT'), this.t(), f)
  }

  /* ----- FDT: limits → debounce FSM → classifier → outputs ----- */

  private runFdt(job: Job) {
    const f = job.data as Features
    this.feat = f
    const now = this.t()
    this.fdtCycles++
    const rpm = this.rpm
    const present = f.curRms > 0.8 || rpm > 120
    const slip = rpm > 100 ? clamp((1 - rpm / RATED.sync) * 100, 0, 100) : 0
    const vals = [f.vibRms, this.tempC, f.curRms, slip, f.kurt, f.a1x, f.a2x, f.ripple * 100]

    const s = this.fsm
    const judging = present && s.state !== 'STARTUP' && s.state !== 'OFF' && s.state !== 'TRIPPED'
    if (!judging) this.smInit = false
    let maxLevel = 0
    const cs: number[] = []
    for (let i = 0; i < this.indicators.length; i++) {
      const ind = this.indicators[i]
      const d = ind.def
      // light smoothing (two windows) so single noisy windows cannot flip a state
      this.smVals[i] = this.smInit ? this.smVals[i] + (vals[i] - this.smVals[i]) * 0.5 : vals[i]
      const v = this.smVals[i]
      ind.value = v
      if (judging) {
        const prev = ind.level
        // 7 % hysteresis band: a value must fall clearly below a limit before the level drops
        ind.level = v >= d.crit || (prev === 2 && v >= d.crit * 0.93) ? 2 : v >= d.warn || (prev >= 1 && v >= d.warn * 0.93) ? 1 : 0
        ind.c = degradation(d, v)
      } else {
        ind.level = 0
        ind.c = 0
      }
      if (ind.level > maxLevel) maxLevel = ind.level
      cs.push(ind.c)
    }
    this.smInit = true

    // classifier (only meaningful while the machine is running steadily)
    if (judging) {
      const input = {
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
        tempC: this.tempC,
        rpm,
      }
      const raw = classify(input)
      const ev = this.evSm
      let worstEv = 0
      for (const k of CLASS_ORDER) {
        if (k === 'healthy') continue
        ev[k] += (raw[k] - ev[k]) * 0.3
        if (ev[k] > worstEv) worstEv = ev[k]
      }
      ev.healthy = 1 - worstEv
      this.evidence = { ...ev }
      const d = diagnose(this.evidence, input)
      const worst = Math.max(...cs)
      // do not call a drifting-but-inside-limits motor "faulty" until something has actually moved
      if (d.cls !== 'healthy' && maxLevel === 0 && worst < 0.12) {
        this.diag = { cls: 'healthy', evidence: this.evidence.healthy, detail: 'All four channels are inside their normal band.', also: [] }
      } else {
        this.diag = d
      }
    } else {
      this.evSm = emptyEvidence()
      this.evidence = emptyEvidence()
      this.diag = {
        cls: 'healthy',
        evidence: 1,
        detail: s.state === 'STARTUP' ? 'Start-up inhibit: limits are ignored while the motor accelerates.' : s.state === 'TRIPPED' ? 'Relay open. Reset the trip to restart the motor.' : 'Motor is not running.',
        also: [],
      }
    }

    // composite health index (instantaneous)
    cs.sort((a, b) => b - a)
    const d = Math.min(1, cs[0] + 0.12 * cs[1] + 0.05 * cs[2])
    this.health.hiInst = judging ? 100 * (1 - d) : this.health.hiInst
    this.health.valid = judging || this.health.valid

    this.stepFsm(maxLevel, present, now)
    if ((s.state === 'WARNING' || s.state === 'CRITICAL') && this.diag.cls === 'healthy') {
      let worstI = this.indicators[0]
      for (const ind of this.indicators) if (ind.c > worstI.c) worstI = ind
      const lim = worstI.level === 2 ? worstI.def.crit : worstI.def.warn
      this.diag = {
        cls: 'healthy',
        evidence: this.diag.evidence,
        detail: `Unclassified: ${worstI.def.label.toLowerCase()} is ${worstI.value.toFixed(worstI.def.dp)} ${worstI.def.unit}, past its ${worstI.level === 2 ? 'critical' : 'warning'} limit of ${lim}.`,
        also: [],
      }
    }

    // protective trip
    if (this.cfg.autoProtect && s.state === 'CRITICAL' && now - s.critSince >= this.cfg.tripDelayMs) {
      this.trip(`Critical for ${((now - s.critSince) / 1000).toFixed(1)} s — contactor opened`)
    }

    // 10 Hz trend history for the dashboard
    this.hiPlot += (this.health.hiInst - this.hiPlot) * 0.2
    this.trend.temp.push(this.tempC)
    this.trend.vib.push(f.vibRms)
    this.trend.cur.push(f.curRms)
    this.trend.rpm.push(rpm)
    this.trend.hi.push(this.hiPlot)

    const worstEv = Math.max(this.evidence.overload, this.evidence.bearing, this.evidence.misalign, this.evidence.imbalance, this.evidence.cooling, this.evidence.electrical)
    this.bumpStack('FDT', worstEv)
  }

  private stepFsm(maxLevel: number, present: boolean, now: number) {
    const s = this.fsm
    const cfg = this.cfg
    if (s.state === 'TRIPPED') return
    if (!present) {
      s.offCnt++
      if (s.offCnt >= 8 && s.state !== 'OFF') this.setState('OFF', now, 'No phase current and no rotation')
      return
    }
    s.offCnt = 0
    if (s.state === 'OFF') {
      s.inhibitUntil = now + cfg.startupInhibitMs
      this.setState('STARTUP', now, 'Motor energised — limits inhibited while it accelerates')
      return
    }
    if (s.state === 'STARTUP') {
      if (now >= s.inhibitUntil) {
        s.warnCnt = s.critCnt = s.clearCnt = s.downCnt = 0
        this.setState('HEALTHY', now, 'Start-up complete — monitoring')
      }
      return
    }
    s.critCnt = maxLevel >= 2 ? s.critCnt + 1 : 0
    s.warnCnt = maxLevel >= 1 ? s.warnCnt + 1 : 0
    s.clearCnt = maxLevel === 0 ? s.clearCnt + 1 : 0
    s.downCnt = maxLevel < 2 ? s.downCnt + 1 : 0
    const detail = () => `${CLASS_META[this.diag.cls].label}: ${this.diag.detail}`
    switch (s.state) {
      case 'HEALTHY':
        if (s.critCnt >= cfg.critDebounce) this.setState('CRITICAL', now, detail())
        else if (s.warnCnt >= cfg.warnDebounce) this.setState('WARNING', now, detail())
        break
      case 'WARNING':
        if (s.critCnt >= cfg.critDebounce) this.setState('CRITICAL', now, detail())
        else if (s.clearCnt >= cfg.clearDebounce) this.setState('HEALTHY', now, 'All indicators back inside their normal band')
        break
      case 'CRITICAL':
        if (s.downCnt >= cfg.clearDebounce) {
          this.setState(maxLevel === 0 ? 'HEALTHY' : 'WARNING', now, maxLevel === 0 ? 'Recovered' : 'Eased back to warning level')
        }
        break
    }
  }

  private setState(to: FsmState, now: number, reason: string) {
    const s = this.fsm
    const from = s.state
    if (from === to) return
    s.state = to
    s.since = now
    s.reason = reason
    if (to === 'WARNING') s.warnSince = now
    if (to === 'CRITICAL') {
      s.critSince = now
      if (from === 'WARNING' && s.warnSince > 0) this.summary.warnLeadSec = (now - s.warnSince) / 1000
      if (this.health.predSinceMs > 0) this.summary.predLeadSec = (now - this.health.predSinceMs) / 1000
    }
    if (to === 'HEALTHY' || to === 'OFF') {
      s.warnSince = 0
    }
    const level: LogLevel = to === 'HEALTHY' ? 'ok' : to === 'WARNING' ? 'warn' : to === 'CRITICAL' || to === 'TRIPPED' ? 'crit' : 'info'
    this.log(level, to === 'TRIPPED' ? 'TRIP' : 'STATE', `${from} → ${to}. ${reason}`)
    this.onStateChange?.(from, to, now)
  }

  trip(reason: string) {
    if (this.gpio.relayTrip) return
    this.gpio.relayTrip = true
    this.setState('TRIPPED', this.t(), reason)
  }

  resetTrip() {
    if (!this.gpio.relayTrip && this.fsm.state !== 'TRIPPED') return
    this.gpio.relayTrip = false
    this.fsm.state = 'OFF'
    this.fsm.since = this.t()
    this.fsm.offCnt = 0
    this.log('info', 'RESET', 'Trip latch cleared — relay closed')
  }

  /* ----- HLTH: health index, trend, remaining life ----- */

  private runHlth() {
    const h = this.health
    const now = this.t()
    const sec = now / 1000
    const s = this.fsm.state
    const active = s === 'HEALTHY' || s === 'WARNING' || s === 'CRITICAL'

    if (active) {
      h.hi += (h.hiInst - h.hi) * 0.35
      if (h.hi > 100) h.hi = 100
    } else if (s === 'STARTUP') {
      h.hi += (100 - h.hi) * 0.35
    }

    // a sudden drop is an event, not a trend — forecasting it would only produce nonsense countdowns
    this.hiHist.push(h.hi)
    if (this.hiHist.length > 5) this.hiHist.shift()
    if (this.hiHist.length === 5 && this.hiHist[0] - h.hi > 14) this.stepHoldUntil = now + 30000

    this.hiT.push(sec)
    this.hiV.push(h.hi)
    this.pT.push(sec)
    this.pTemp.push(this.tempC)
    this.pVib.push(this.feat.vibRms)
    this.pCur.push(this.feat.curRms)

    let etaHi: number | null = null
    let driver = ''
    let etaBest: number | null = null

    if (active && this.hiT.count >= 24) {
      const n = this.hiT.readLast(60, this.scratchT)
      this.hiV.readLast(60, this.scratchY)
      const r = regress(this.scratchT, this.scratchY, n)
      h.slopePerMin = r.slope * 60
      h.r2 = r.r2
      if (r.slope < -0.12 && r.r2 > 0.45 && h.hi > HI_CRITICAL) {
        etaHi = (h.hi - HI_CRITICAL) / -r.slope
        etaBest = etaHi
        driver = 'overall health index'
      }
    } else {
      h.slopePerMin = 0
      h.r2 = 0
    }
    h.etaHiSec = etaHi

    // per-channel time-to-limit
    if (active && this.pT.count >= 20) {
      const n = this.pT.readLast(40, this.scratchT)
      const check = (ring: Ring, name: string, def: IndicatorDef, minSlope: number, unit: string, dp: number) => {
        ring.readLast(40, this.scratchY)
        const r = regress(this.scratchT, this.scratchY, n)
        const val = ring.last()
        if (r.slope > minSlope && r.r2 > 0.5 && val < def.crit) {
          const eta = (def.crit - val) / r.slope
          if (etaBest === null || eta < etaBest) {
            etaBest = eta
            driver = `${name} rising ${r.slope.toFixed(dp)} ${unit}/s`
          }
        }
      }
      check(this.pTemp, 'temperature', INDICATORS[1], 0.08, '°C', 2)
      check(this.pVib, 'vibration', INDICATORS[0], 0.0025, 'g', 3)
      check(this.pCur, 'current', INDICATORS[2], 0.015, 'A', 2)
    }

    const wantPredict = (s === 'HEALTHY' || s === 'WARNING') && etaBest !== null && etaBest < PREDICT_HORIZON_S && now > this.stepHoldUntil
    if (wantPredict) {
      this.predCnt++
      this.predClear = 0
    } else {
      this.predClear++
      this.predCnt = 0
    }
    if (!h.predicting && this.predCnt >= 3) {
      h.predicting = true
      h.predSinceMs = now
      this.log('pred', 'FORECAST', `Limit reached in ~${Math.round(etaBest ?? 0)} s if the trend continues (${driver})`)
    } else if (h.predicting && this.predClear >= 6) {
      h.predicting = false
      h.predSinceMs = 0
      this.log('ok', 'FORECAST', 'Forecast cleared — trend has flattened')
    }
    h.rulSec = h.predicting && etaBest !== null ? etaBest : null
    h.driver = h.predicting ? driver : ''
    h.predText =
      h.predicting && etaBest !== null
        ? `Critical limit in about ${formatEta(etaBest)} — ${driver}.`
        : ''

    // housekeeping
    this.wdgKick = now
    this.bumpStack('HLTH', h.predicting ? 0.6 : 0.1)
  }

  /* ----- COMM: telemetry frame + Modbus reply ----- */

  private runComm(job: Job): void | { blockMs: number; nextMs: number } {
    if (job.burst > 0) {
      this.bumpStack('COMM', 0.3)
      return
    }
    const f = this.feat
    const h = this.health
    const g = this.gpio
    const tel: Telemetry = {
      seq: this.txSeq++ & 0xff,
      tsMs: Math.round(this.uptimeMs),
      tempC: this.tempC,
      vibG: f.vibRms,
      curA: f.curRms,
      rpm: this.rpm,
      hi: h.hi,
      state: STATE_CODE[this.fsm.state],
      cls: CLASS_INDEX[this.diag.cls],
      relay: g.relayTrip,
      buzzer: g.buzzer,
      predicting: h.predicting,
      rulSec: h.rulSec,
    }
    const frame = buildFrame(tel)
    const wire = this.cfg.uartNoise > 0 && this.rng.next() < this.cfg.uartNoise ? corrupt(frame, this.rng) : frame
    const u16 = (x: number) => Math.max(0, Math.min(0xffff, Math.round(x)))
    const regs = [
      u16(tel.tempC * 100),
      u16(tel.vibG * 1000),
      u16(tel.curA * 1000),
      u16(tel.rpm),
      u16(tel.hi),
      tel.state,
      tel.cls,
      tel.rulSec == null ? 0xffff : u16(tel.rulSec),
    ]
    const req = buildModbusRequest(0, regs.length)
    const resp = buildModbusResponse(regs)
    const bits = (FRAME_LEN + resp.length + req.length) * 10
    const txMs = (FRAME_LEN * 10 * 1000) / MCU.uartBaud
    this.host.bytesTx += FRAME_LEN + resp.length
    this.rtos.at(this.t() + txMs, ORD.MISC, () => this.onUartTxComplete(wire, req, resp))
    void bits
    return { blockMs: txMs, nextMs: 0.4 * this.scale }
  }

  /** UART TX-complete interrupt, and the host (the dashboard) receiving + validating what was sent. */
  private onUartTxComplete(wire: Uint8Array, req: Uint8Array, resp: Uint8Array) {
    this.rtos.isr('USART2_TC')
    const host = this.host
    const parsed = parseFrame(wire)
    host.frame = wire
    host.crcRx = parsed.crcRx
    host.crcCalc = parsed.crcCalc
    host.frameOk = parsed.ok
    if (parsed.ok && parsed.t) {
      host.rxOk++
      host.telemetry = parsed.t
      host.lastSeq = parsed.t.seq
      host.lastRxAt = this.rtos.now
      const t = parsed.t
      this.print(
        'info',
        `TEL #${String(t.seq).padStart(3, '0')}  T=${t.tempC.toFixed(1)}  V=${t.vibG.toFixed(3)}  I=${t.curA.toFixed(2)}  N=${t.rpm}  HI=${t.hi}`,
      )
    } else {
      host.crcErr++
      this.log('warn', 'CRC', `Host rejected a telemetry frame (${parsed.reason}): rx 0x${parsed.crcRx.toString(16).toUpperCase()} ≠ calc 0x${parsed.crcCalc.toString(16).toUpperCase()}`, 'HOST')
    }
    const mb = parseModbusResponse(resp)
    host.modbusReq = req
    host.modbusResp = resp
    host.modbusOk = mb.ok
    host.modbusRegs = mb.regs
  }

  /* ---------- watchdog ---------- */

  watchdogReset() {
    const now = this.t()
    this.log('crit', 'WDT', 'Independent watchdog expired: HEALTH task was starved. MCU reset.')
    this.bootCount++
    this.lastResetReason = 'IWDG'
    for (const t of this.rtos.tasks) t.pending.length = 0
    this.rtos.running = null
    this.halfPending = [false, false]
    this.newSamples = 0
    this.dmaPos = 0
    this.feat = zeroFeatures()
    this.evidence = emptyEvidence()
    this.diag = { cls: 'healthy', evidence: 1, detail: 'Rebooting…', also: [] }
    this.evSm = emptyEvidence()
    this.smInit = false
    this.health.hi = 100
    this.health.hiInst = 100
    this.health.predicting = false
    this.health.predSinceMs = 0
    this.health.rulSec = null
    this.predCnt = this.predClear = 0
    this.fsm.state = 'OFF'
    this.fsm.since = now
    this.fsm.offCnt = 0
    this.fsm.warnCnt = this.fsm.critCnt = this.fsm.clearCnt = this.fsm.downCnt = 0
    this.bootAtMs = now
    this.wdgKick = now
    this.print('info', `VIGIL-M1 firmware 0.9.2 — boot #${this.bootCount} (reset cause: ${this.lastResetReason})`)
  }

  /* ---------- memory map (for the firmware page) ---------- */

  memory() {
    const stacks = TASK_SPECS.reduce((a, s) => a + s.stackWords * 4, 0) + 128 * 4
    const sram = [
      { label: 'DMA buffers', bytes: DMA_LEN * 2 * 2, tone: 'dma' },
      { label: 'Sample rings (vib + cur)', bytes: 1024 * 4 * 2, tone: 'ring' },
      { label: 'FFT work + Hann table', bytes: DSP_N * 4 * 4 + DSP_N * 4, tone: 'fft' },
      { label: 'Spectra + feature set', bytes: SPEC_BINS * 4 * 2 + 640, tone: 'spec' },
      { label: 'Trend buffers', bytes: 5 * 600 * 4, tone: 'trend' },
      { label: 'Task stacks', bytes: stacks, tone: 'stack' },
      { label: 'RTOS heap (queues, TCBs)', bytes: 6.4 * 1024, tone: 'heap' },
      { label: '.data + .bss', bytes: 9.8 * 1024, tone: 'bss' },
    ]
    const used = sram.reduce((a, s) => a + s.bytes, 0)
    return {
      sram,
      sramUsed: used,
      sramTotal: MCU.sramKB * 1024,
      heapTotal: MCU.heapKB * 1024,
      flash: {
        image: 61.8 * 1024,
        config: 4 * 1024,
        log: MCU.logEntries * MCU.logEntryBytes,
        total: MCU.flashKB * 1024,
      },
    }
  }
}

function corrupt(frame: Uint8Array, rng: Rng): Uint8Array {
  const out = frame.slice()
  const i = 2 + Math.floor(rng.next() * (out.length - 2))
  out[i] ^= 1 << Math.floor(rng.next() * 8)
  return out
}

export function formatEta(sec: number): string {
  if (sec < 90) return `${Math.max(1, Math.round(sec))} s`
  return `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s`
}

export { toHex }
