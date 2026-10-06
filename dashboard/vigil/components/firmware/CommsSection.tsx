'use client'

import { CheckCircle2, XCircle } from 'lucide-react'
import { shallowEqual, useSnap, useStore } from '@vigil/components/sim/SimProvider'
import { CLASS_ORDER } from '@vigil/lib/sim/config'
import { FRAME_FIELDS, MODBUS_REGS, hex2, parseFrame } from '@vigil/lib/sim/protocol'
import { C } from '@vigil/lib/theme'
import { cn, fmt } from '@vigil/lib/utils'

const TONE: Record<string, string> = {
  sync: C.steel3,
  meta: C.steel2,
  temp: C.temp,
  vib: C.vib,
  cur: C.cur,
  rpm: C.rpm,
  health: C.go,
  pred: C.forecast,
  crc: C.caution,
}
const STATES = ['HEALTHY', 'WARNING', 'CRITICAL', 'TRIPPED', 'OFF', 'STARTUP']

function Bytes({ bytes, className }: { bytes: Uint8Array | null; className?: string }) {
  if (!bytes) return <span className="mono text-[12px] text-steel-300">waiting for first frame…</span>
  return (
    <span className={cn('mono flex flex-wrap gap-x-[5px] gap-y-0.5 text-[12px] text-bone', className)}>
      {Array.from(bytes, (b, i) => (
        <span key={i}>{hex2(b)}</span>
      ))}
    </span>
  )
}

function FrameDump({ frame }: { frame: Uint8Array | null }) {
  if (!frame) return <Bytes bytes={null} />
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-3">
      {FRAME_FIELDS.map((f) => (
        <div key={f.name}>
          <p className="mono mb-1 text-[9px] font-medium uppercase tracking-[0.12em]" style={{ color: TONE[f.tone] }}>
            {f.name}
          </p>
          <p className="mono flex gap-[5px] rounded border px-1.5 py-1 text-[12.5px]" style={{ color: TONE[f.tone], borderColor: `${TONE[f.tone]}44`, background: `${TONE[f.tone]}0f` }}>
            {Array.from(frame.slice(f.from, f.to), (b, i) => (
              <span key={i}>{hex2(b)}</span>
            ))}
          </p>
        </div>
      ))}
    </div>
  )
}

export function CommsSection() {
  const store = useStore()
  const host = useSnap((s) => s.host, shallowEqual)
  const noise = useSnap((s) => s.cfg.uartNoise)
  const parsed = host.frame ? parseFrame(host.frame) : null
  const t = parsed?.ok ? parsed.t : host.telemetry
  const regs = host.modbusRegs
  const scale = [(v: number) => `${fmt(v / 100, 2)} °C`, (v: number) => `${v} mg`, (v: number) => `${v} mA`, (v: number) => `${v} rpm`, (v: number) => `${v} %`, (v: number) => STATES[v] ?? v, (v: number) => CLASS_ORDER[v] ?? v, (v: number) => (v === 0xffff ? 'none' : `${v} s`)]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="panel lg:col-span-7">
          <div className="panel-head">
            <span className="label">UART2 telemetry frame · 24 bytes · 1 Hz</span>
            <span className={cn('mono inline-flex items-center gap-1.5 text-[11px]', host.frameOk ? 'text-go' : 'text-stop')}>
              {host.frameOk ? <CheckCircle2 size={14} aria-hidden /> : <XCircle size={14} aria-hidden />}
              CRC {host.frameOk ? 'accepted' : 'REJECTED'}
            </span>
          </div>
          <div className="space-y-4 p-4">
            <FrameDump frame={host.frame} />
            <p className="mono text-[11px] text-steel-300">
              CRC-16/MODBUS over bytes 2–21: received <span className="text-bone">0x{host.crcRx.toString(16).toUpperCase().padStart(4, '0')}</span>, computed{' '}
              <span className={host.frameOk ? 'text-bone' : 'text-stop'}>0x{host.crcCalc.toString(16).toUpperCase().padStart(4, '0')}</span>
              {!host.frameOk && <span className="ml-2 text-stop">frame dropped — the dashboard keeps its last good values</span>}
            </p>
            {t && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 border-t border-ink-600/70 pt-4 sm:grid-cols-4">
                {[
                  ['Sequence', `#${t.seq}`],
                  ['Uptime', `${fmt(t.tsMs / 1000, 1)} s`],
                  ['Temperature', `${fmt(t.tempC, 2)} °C`],
                  ['Vibration', `${fmt(t.vibG, 3)} g`],
                  ['Current', `${fmt(t.curA, 3)} A`],
                  ['Speed', `${t.rpm} rpm`],
                  ['Health', `${t.hi} %`],
                  ['State', STATES[t.state] ?? t.state],
                  ['Fault class', CLASS_ORDER[t.cls] ?? t.cls],
                  ['Relay', t.relay ? 'tripped' : 'closed'],
                  ['Forecast', t.rulSec == null ? 'none' : `${t.rulSec} s`],
                  ['Buzzer', t.buzzer ? 'on' : 'off'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="label">{k}</dt>
                    <dd className="mono mt-0.5 text-[13px] text-bone">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </section>

        <section className="panel lg:col-span-5">
          <div className="panel-head">
            <span className="label">Line quality</span>
          </div>
          <div className="space-y-4 p-4">
            <dl className="grid grid-cols-3 gap-3">
              {[
                ['Accepted', host.rxOk.toLocaleString('en-US'), C.go],
                ['Rejected', host.crcErr.toLocaleString('en-US'), host.crcErr ? C.stop : C.steel3],
                ['Sent', `${(host.bytesTx / 1024).toFixed(1)} KB`, C.bone],
              ].map(([k, v, c]) => (
                <div key={k} className="rounded-lg border border-ink-600 bg-ink-850/70 p-3">
                  <dt className="label">{k}</dt>
                  <dd className="readout mt-1.5 text-[24px]" style={{ color: c }}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="noise" className="text-[14px] text-steel-200">
                  Electrical noise on the cable
                </label>
                <span className="mono text-[12px] text-bone">{Math.round(noise * 100)} % of frames hit</span>
              </div>
              <input id="noise" type="range" min={0} max={60} step={5} value={Math.round(noise * 100)} className="fader" style={{ '--p': `${(noise / 0.6) * 100}%`, '--fc': C.caution } as React.CSSProperties} onChange={(e) => store.setConfig({ uartNoise: Number(e.target.value) / 100 })} />
            </div>
            <p className="text-[13.5px] leading-snug text-steel-300 text-pretty">
              Each hit flips one random bit somewhere in the frame. The 16-bit CRC catches it, the host drops the frame, and the dashboard carries on with the last good reading instead of showing garbage.
            </p>
          </div>
        </section>
      </div>

      <section className="panel overflow-hidden">
        <div className="panel-head">
          <span className="label">Modbus RTU · slave 1 · function 03 (read holding registers)</span>
          <span className={cn('mono inline-flex items-center gap-1.5 text-[11px]', host.modbusOk ? 'text-go' : 'text-stop')}>
            {host.modbusOk ? <CheckCircle2 size={14} aria-hidden /> : <XCircle size={14} aria-hidden />}
            reply CRC {host.modbusOk ? 'ok' : 'bad'}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 p-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="label mb-1.5">Master request</p>
              <Bytes bytes={host.modbusReq} />
              <p className="mono mt-1.5 text-[10.5px] text-steel-300">01 · 03 · start 0000 · count 0008 · CRC</p>
            </div>
            <div>
              <p className="label mb-1.5">Slave reply</p>
              <Bytes bytes={host.modbusResp} />
              <p className="mono mt-1.5 text-[10.5px] text-steel-300">01 · 03 · 16 data bytes · 8 registers · CRC (low byte first)</p>
            </div>
          </div>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-ink-600/70">
                {['Address', 'Register', 'Raw', 'Value'].map((h, i) => (
                  <th key={h} scope="col" className={cn('label py-2 font-medium', i >= 2 && 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODBUS_REGS.map((r, i) => (
                <tr key={r.addr} className="border-b border-ink-700/70 last:border-0">
                  <td className="mono py-1.5 text-[12px] text-steel-200">{r.addr}</td>
                  <th scope="row" className="mono py-1.5 text-[11.5px] font-normal text-bone">
                    {r.name}
                  </th>
                  <td className="mono py-1.5 text-right text-[12px] text-steel-200">{regs[i] ?? '—'}</td>
                  <td className="mono py-1.5 text-right text-[12px] text-bone">{regs[i] != null ? scale[i](regs[i]) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
