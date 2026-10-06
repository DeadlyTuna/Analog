/**
 * Wire formats spoken by the firmware's communication task.
 *  - VGL1 telemetry frame over UART (what the dashboard host receives)
 *  - Modbus RTU "read holding registers" reply (what a SCADA master would poll)
 * Both are protected by CRC-16/MODBUS, exactly as on a real device.
 */

export function crc16(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0xffff
  for (let i = start; i < end; i++) {
    crc ^= bytes[i]
    for (let b = 0; b < 8; b++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1
  }
  return crc & 0xffff
}

export const hex2 = (b: number) => b.toString(16).toUpperCase().padStart(2, '0')

export const toHex = (bytes: Uint8Array): string => Array.from(bytes, hex2).join(' ')

/* ------------------------------------------------------------------ */
/* VGL1 telemetry frame — 24 bytes                                      */
/*  0  A5 5A      sync                                                  */
/*  2  LEN        payload length (19)                                   */
/*  3  SEQ        rolling counter                                       */
/*  4  TS  u32    uptime ms                                             */
/*  8  TEMP i16   centi-°C                                              */
/* 10  VIB  u16   milli-g RMS                                           */
/* 12  CUR  u16   milli-amp RMS                                         */
/* 14  RPM  u16                                                         */
/* 16  HI   u8    health index 0..100                                   */
/* 17  STATE u8   0 OK · 1 WARN · 2 CRIT · 3 TRIP · 4 OFF · 5 START     */
/* 18  CLASS u8   fault class index                                     */
/* 19  FLAGS u8   b0 relay · b1 buzzer · b2 prediction                  */
/* 20  RUL  u16   seconds, 0xFFFF = none                                */
/* 22  CRC16 u16  over bytes 2..21, little-endian                       */
/* ------------------------------------------------------------------ */

export const FRAME_LEN = 24

export interface Telemetry {
  seq: number
  tsMs: number
  tempC: number
  vibG: number
  curA: number
  rpm: number
  hi: number
  state: number
  cls: number
  relay: boolean
  buzzer: boolean
  predicting: boolean
  rulSec: number | null
}

export const FRAME_FIELDS: { name: string; from: number; to: number; tone: string }[] = [
  { name: 'SYNC', from: 0, to: 2, tone: 'sync' },
  { name: 'LEN', from: 2, to: 3, tone: 'meta' },
  { name: 'SEQ', from: 3, to: 4, tone: 'meta' },
  { name: 'TIME', from: 4, to: 8, tone: 'meta' },
  { name: 'TEMP', from: 8, to: 10, tone: 'temp' },
  { name: 'VIB', from: 10, to: 12, tone: 'vib' },
  { name: 'CUR', from: 12, to: 14, tone: 'cur' },
  { name: 'RPM', from: 14, to: 16, tone: 'rpm' },
  { name: 'HI', from: 16, to: 17, tone: 'health' },
  { name: 'STATE', from: 17, to: 18, tone: 'health' },
  { name: 'CLASS', from: 18, to: 19, tone: 'health' },
  { name: 'FLAGS', from: 19, to: 20, tone: 'health' },
  { name: 'RUL', from: 20, to: 22, tone: 'pred' },
  { name: 'CRC', from: 22, to: 24, tone: 'crc' },
]

export function buildFrame(t: Telemetry): Uint8Array {
  const b = new Uint8Array(FRAME_LEN)
  const dv = new DataView(b.buffer)
  b[0] = 0xa5
  b[1] = 0x5a
  b[2] = 19
  b[3] = t.seq & 0xff
  dv.setUint32(4, t.tsMs >>> 0, true)
  dv.setInt16(8, Math.round(t.tempC * 100), true)
  dv.setUint16(10, Math.min(65535, Math.round(t.vibG * 1000)), true)
  dv.setUint16(12, Math.min(65535, Math.round(t.curA * 1000)), true)
  dv.setUint16(14, Math.min(65535, Math.max(0, Math.round(t.rpm))), true)
  b[16] = Math.max(0, Math.min(100, Math.round(t.hi)))
  b[17] = t.state & 0xff
  b[18] = t.cls & 0xff
  b[19] = (t.relay ? 1 : 0) | (t.buzzer ? 2 : 0) | (t.predicting ? 4 : 0)
  dv.setUint16(20, t.rulSec == null ? 0xffff : Math.min(0xfffe, Math.round(t.rulSec)), true)
  dv.setUint16(22, crc16(b, 2, 22), true)
  return b
}

export function parseFrame(b: Uint8Array): { ok: boolean; reason?: string; t?: Telemetry; crcRx: number; crcCalc: number } {
  if (b.length !== FRAME_LEN) return { ok: false, reason: 'length', crcRx: 0, crcCalc: 0 }
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const crcRx = dv.getUint16(22, true)
  const crcCalc = crc16(b, 2, 22)
  if (b[0] !== 0xa5 || b[1] !== 0x5a) return { ok: false, reason: 'sync', crcRx, crcCalc }
  if (crcRx !== crcCalc) return { ok: false, reason: 'crc', crcRx, crcCalc }
  const rul = dv.getUint16(20, true)
  return {
    ok: true,
    crcRx,
    crcCalc,
    t: {
      seq: b[3],
      tsMs: dv.getUint32(4, true),
      tempC: dv.getInt16(8, true) / 100,
      vibG: dv.getUint16(10, true) / 1000,
      curA: dv.getUint16(12, true) / 1000,
      rpm: dv.getUint16(14, true),
      hi: b[16],
      state: b[17],
      cls: b[18],
      relay: !!(b[19] & 1),
      buzzer: !!(b[19] & 2),
      predicting: !!(b[19] & 4),
      rulSec: rul === 0xffff ? null : rul,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Modbus RTU                                                           */
/* ------------------------------------------------------------------ */

export const MODBUS_ADDR = 1
export const MODBUS_BASE = 0 // register 40001 -> offset 0

export const MODBUS_REGS = [
  { addr: 40001, name: 'MOTOR_TEMP', unit: '0.01 °C' },
  { addr: 40002, name: 'VIB_RMS', unit: 'mg' },
  { addr: 40003, name: 'PHASE_CURRENT', unit: 'mA' },
  { addr: 40004, name: 'SPEED', unit: 'rpm' },
  { addr: 40005, name: 'HEALTH_INDEX', unit: '%' },
  { addr: 40006, name: 'MACHINE_STATE', unit: 'enum' },
  { addr: 40007, name: 'FAULT_CLASS', unit: 'enum' },
  { addr: 40008, name: 'RUL_ESTIMATE', unit: 's' },
] as const

export function buildModbusRequest(start: number, qty: number): Uint8Array {
  const b = new Uint8Array(8)
  b[0] = MODBUS_ADDR
  b[1] = 0x03
  b[2] = start >> 8
  b[3] = start & 0xff
  b[4] = qty >> 8
  b[5] = qty & 0xff
  const c = crc16(b, 0, 6)
  b[6] = c & 0xff
  b[7] = c >> 8
  return b
}

export function buildModbusResponse(regs: number[]): Uint8Array {
  const n = regs.length
  const b = new Uint8Array(3 + n * 2 + 2)
  b[0] = MODBUS_ADDR
  b[1] = 0x03
  b[2] = n * 2
  for (let i = 0; i < n; i++) {
    const v = regs[i] & 0xffff
    b[3 + i * 2] = v >> 8
    b[4 + i * 2] = v & 0xff
  }
  const c = crc16(b, 0, 3 + n * 2)
  b[3 + n * 2] = c & 0xff
  b[4 + n * 2] = c >> 8
  return b
}

export function parseModbusResponse(b: Uint8Array): { ok: boolean; regs: number[] } {
  if (b.length < 5 || b[1] !== 0x03 || b[2] !== b.length - 5) return { ok: false, regs: [] }
  const c = crc16(b, 0, b.length - 2)
  if ((c & 0xff) !== b[b.length - 2] || c >> 8 !== b[b.length - 1]) return { ok: false, regs: [] }
  const regs: number[] = []
  for (let i = 0; i < b[2]; i += 2) regs.push((b[3 + i] << 8) | b[4 + i])
  return { ok: true, regs }
}
