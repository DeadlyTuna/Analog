/**
 * Shared constants, thresholds and labels for the simulated motor + firmware.
 * Numbers in here are the "firmware configuration" the dashboard shows on the Firmware page.
 */

/* ---------- sampling chain ---------- */
export const FS = 2560 // ADC trigger rate for the vibration + current channels (Hz)
export const ADC_DT_MS = 1000 / FS // 0.390625 ms — exactly representable, so no timing drift
export const DMA_LEN = 128 // circular DMA buffer, samples per channel
export const DMA_HALF = DMA_LEN / 2 // half-transfer / transfer-complete interrupts every 25 ms
export const DSP_N = 512 // FFT window (200 ms)
export const DSP_HOP = 256 // a new feature set every 100 ms
export const SPEC_BINS = DSP_N / 2
export const BIN_HZ = FS / DSP_N // 5 Hz per bin
export const NYQUIST = FS / 2

/* ---------- motor nameplate ---------- */
export const RATED = {
  rpm: 1480,
  sync: 1500,
  current: 4.2,
  kW: 1.5,
  volts: 415,
  freq: 50,
  poles: 4,
  ambient: 30,
} as const

/** Bearing outer-race defect frequency as a multiple of shaft speed (9-ball bearing). */
export const BPFO_RATIO = 3.58

/* ---------- faults the user can inject ---------- */
export type FaultKey = 'overload' | 'bearing' | 'misalign' | 'imbalance' | 'cooling' | 'electrical'
export const FAULT_KEYS: FaultKey[] = ['overload', 'bearing', 'misalign', 'imbalance', 'cooling', 'electrical']

export interface FaultMeta {
  key: FaultKey
  label: string
  action: string
  short: string
  /** What the sensors will show, in plain words. */
  signature: string
  /** Severity applied when the fault button is pressed. */
  preset: number
  /** Channels this fault is expected to show up on. */
  channels: ('vib' | 'temp' | 'cur' | 'rpm')[]
}

export const FAULT_META: Record<FaultKey, FaultMeta> = {
  overload: {
    key: 'overload',
    label: 'Overload',
    action: 'Overload the shaft',
    short: 'OVL',
    signature: 'Current and slip climb together, temperature follows.',
    preset: 1,
    channels: ['cur', 'rpm', 'temp'],
  },
  bearing: {
    key: 'bearing',
    label: 'Bearing wear',
    action: 'Wear the bearing',
    short: 'BRG',
    signature: 'Sharp impacts at the defect frequency; kurtosis and crest factor rise.',
    preset: 0.7,
    channels: ['vib', 'temp'],
  },
  misalign: {
    key: 'misalign',
    label: 'Misalignment',
    action: 'Misalign the coupling',
    short: 'MIS',
    signature: 'Strong vibration at twice running speed, a little extra heat.',
    preset: 0.7,
    channels: ['vib', 'temp'],
  },
  imbalance: {
    key: 'imbalance',
    label: 'Rotor imbalance',
    action: 'Unbalance the rotor',
    short: 'IMB',
    signature: 'Vibration at running speed dominates the spectrum.',
    preset: 0.7,
    channels: ['vib'],
  },
  cooling: {
    key: 'cooling',
    label: 'Cooling failure',
    action: 'Block the cooling fan',
    short: 'CLG',
    signature: 'Temperature runs away while current and speed stay normal.',
    preset: 0.8,
    channels: ['temp'],
  },
  electrical: {
    key: 'electrical',
    label: 'Electrical fault',
    action: 'Inject a winding fault',
    short: 'ELC',
    signature: 'Current ripple and spikes, 100 Hz hum, speed hunting.',
    preset: 0.7,
    channels: ['cur', 'vib', 'rpm'],
  },
}

/* ---------- classifier output ---------- */
export type ClassId = 'healthy' | FaultKey
export const CLASS_ORDER: ClassId[] = ['healthy', ...FAULT_KEYS]
export const CLASS_INDEX = Object.fromEntries(CLASS_ORDER.map((c, i) => [c, i])) as Record<ClassId, number>

export const CLASS_META: Record<ClassId, { label: string; advice: string }> = {
  healthy: {
    label: 'Healthy',
    advice: 'All four channels sit inside their normal band. No action needed.',
  },
  overload: {
    label: 'Overload',
    advice: 'Reduce the mechanical load or check the driven machine for a jam. Current is far above rated and the shaft is losing speed.',
  },
  bearing: {
    label: 'Bearing wear',
    advice: 'Inspect and re-grease or replace the drive-end bearing. Impact spikes at the outer-race frequency are growing.',
  },
  misalign: {
    label: 'Shaft misalignment',
    advice: 'Re-align the coupling and check the soft foot. Vibration at twice running speed is unusually strong.',
  },
  imbalance: {
    label: 'Rotor imbalance',
    advice: 'Balance the rotor or look for a lost fan blade or debris. Vibration at running speed dominates.',
  },
  cooling: {
    label: 'Cooling failure',
    advice: 'Clear the fan cover and air path. Temperature is high even though current and speed are normal.',
  },
  electrical: {
    label: 'Electrical fault',
    advice: 'Check supply phases, terminals and winding insulation. Current ripple and spikes point away from the mechanics.',
  },
}

/* ---------- machine state (finite-state machine in the fault-detection task) ---------- */
export type FsmState = 'OFF' | 'STARTUP' | 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'TRIPPED'
export const STATE_CODE: Record<FsmState, number> = {
  HEALTHY: 0,
  WARNING: 1,
  CRITICAL: 2,
  TRIPPED: 3,
  OFF: 4,
  STARTUP: 5,
}

/* ---------- condition indicators ---------- */
export type IndicatorKey = 'vib' | 'temp' | 'cur' | 'slip' | 'kurt' | 'a1x' | 'a2x' | 'ripple'

export interface IndicatorDef {
  key: IndicatorKey
  label: string
  unit: string
  channel: 'vib' | 'temp' | 'cur' | 'rpm'
  /** Normal / warning / critical / failed anchor values — the limit table in firmware. */
  ok: number
  warn: number
  crit: number
  fail: number
  dp: number
}

export const INDICATORS: IndicatorDef[] = [
  { key: 'vib', label: 'Vibration RMS', unit: 'g', channel: 'vib', ok: 0.25, warn: 0.35, crit: 0.55, fail: 0.85, dp: 2 },
  { key: 'temp', label: 'Motor temperature', unit: '°C', channel: 'temp', ok: 55, warn: 70, crit: 85, fail: 105, dp: 1 },
  { key: 'cur', label: 'Phase current', unit: 'A', channel: 'cur', ok: 4.2, warn: 5.5, crit: 8.2, fail: 11, dp: 2 },
  { key: 'slip', label: 'Speed loss (slip)', unit: '%', channel: 'rpm', ok: 1.35, warn: 4, crit: 12, fail: 20, dp: 1 },
  { key: 'kurt', label: 'Vibration kurtosis', unit: '', channel: 'vib', ok: 3, warn: 4.5, crit: 8, fail: 11, dp: 1 },
  { key: 'a1x', label: '1× running-speed', unit: 'g', channel: 'vib', ok: 0.24, warn: 0.48, crit: 0.7, fail: 1, dp: 2 },
  { key: 'a2x', label: '2× running-speed', unit: 'g', channel: 'vib', ok: 0.08, warn: 0.2, crit: 0.38, fail: 0.55, dp: 2 },
  { key: 'ripple', label: 'Current ripple', unit: '%', channel: 'cur', ok: 1, warn: 8, crit: 18, fail: 30, dp: 1 },
]

/** Degradation score 0 (healthy) … 1 (failed), piecewise-linear through the anchor values. */
export function degradation(d: IndicatorDef, x: number): number {
  if (x <= d.ok) return 0
  if (x <= d.warn) return 0.3 * ((x - d.ok) / (d.warn - d.ok))
  if (x <= d.crit) return 0.3 + 0.32 * ((x - d.warn) / (d.crit - d.warn))
  if (x <= d.fail) return 0.62 + 0.38 * ((x - d.crit) / (d.fail - d.crit))
  return 1
}

export const HI_CRITICAL = 30 // health index treated as "end of life" for RUL prediction
export const PREDICT_HORIZON_S = 150 // raise a prediction when a limit will be reached sooner than this

/* ---------- RTOS task set ---------- */
export type TaskId = 'ACQ' | 'DSP' | 'FDT' | 'HLTH' | 'COMM' | 'STRESS'

export interface TaskSpec {
  id: TaskId
  name: string
  blurb: string
  prio: number
  trigger: string
  periodMs: number
  /** Worst-case execution time at 84 MHz, in ms. Scaled by the selected core clock. */
  wcetMs: number
  deadlineMs: number
  stackWords: number
  color: string
}

export const TASK_SPECS: TaskSpec[] = [
  {
    id: 'ACQ',
    name: 'Sensor acquisition',
    blurb: 'Converts DMA half-buffers to physical units, reads temperature and speed.',
    prio: 6,
    trigger: 'DMA half-transfer ISR',
    periodMs: 25,
    wcetMs: 0.22,
    deadlineMs: 25,
    stackWords: 256,
    color: '#5ad7ff',
  },
  {
    id: 'DSP',
    name: 'Signal processing',
    blurb: 'Hann window, one packed FFT for two channels, RMS / kurtosis / band features.',
    prio: 5,
    trigger: '256 new samples',
    periodMs: 100,
    wcetMs: 3.4,
    deadlineMs: 100,
    stackWords: 768,
    color: '#b79cff',
  },
  {
    id: 'FDT',
    name: 'Fault detection',
    blurb: 'Limit checks, debounce state machine, fault classifier, GPIO outputs.',
    prio: 4,
    trigger: 'feature queue',
    periodMs: 100,
    wcetMs: 0.7,
    deadlineMs: 100,
    stackWords: 384,
    color: '#ff9a5a',
  },
  {
    id: 'HLTH',
    name: 'Health monitoring',
    blurb: 'Health index, trend regression, remaining-life estimate, watchdog feed.',
    prio: 2,
    trigger: 'every 500 ms',
    periodMs: 500,
    wcetMs: 1.1,
    deadlineMs: 250,
    stackWords: 384,
    color: '#6ee7a8',
  },
  {
    id: 'COMM',
    name: 'Communication',
    blurb: 'Builds the telemetry frame + Modbus reply, CRC-16, UART DMA, flash log.',
    prio: 1,
    trigger: 'every 1000 ms',
    periodMs: 1000,
    wcetMs: 2.0,
    deadlineMs: 500,
    stackWords: 512,
    color: '#f0d46a',
  },
]

export const STRESS_SPEC = {
  id: 'STRESS' as TaskId,
  name: 'CPU stress injector',
  prio: 3,
  periodMs: 20,
  color: '#ff5d73',
}

export const CLOCK_OPTIONS = [16, 24, 48, 84, 168] as const

/* ---------- MCU resources shown on the firmware page ---------- */
export const MCU = {
  part: 'STM32F411CE',
  core: 'Cortex-M4F',
  flashKB: 512,
  sramKB: 128,
  adcBits: 12,
  vref: 3.3,
  uartBaud: 115200,
  heapKB: 16,
  logEntries: 256,
  logEntryBytes: 16,
} as const

export const TELEMETRY_BYTES = 24
