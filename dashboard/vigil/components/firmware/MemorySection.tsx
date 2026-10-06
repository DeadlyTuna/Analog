'use client'

import { shallowEqual, useSnap, useStore } from '@vigil/components/sim/SimProvider'
import { MCU } from '@vigil/lib/sim/config'
import type { LogEntry } from '@vigil/lib/sim/firmware'
import { C } from '@vigil/lib/theme'
import { bytes, clock, cn, fmt, hex } from '@vigil/lib/utils'

const TONE: Record<string, string> = { dma: C.vib, ring: '#7ec8e3', fft: C.cur, spec: C.forecast, trend: C.temp, stack: C.go, heap: C.caution, bss: C.steel3 }
const LEVEL_CODE: Record<LogEntry['level'], number> = { info: 1, ok: 2, warn: 3, crit: 4, pred: 5, sim: 1 }
const CELL = ['#171b1d', C.steel3, C.go, C.caution, C.stop, C.forecast]

function djb(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

/** The 16 bytes a log entry occupies in flash: time, level, code hash, message hash, sequence, check byte. */
function entryBytes(e: LogEntry): number[] {
  const t = Math.round(e.tMs) >>> 0
  const c = djb(e.code)
  const m = djb(e.msg)
  const b = [t & 255, (t >> 8) & 255, (t >> 16) & 255, (t >> 24) & 255, LEVEL_CODE[e.level], c & 255, (c >> 8) & 255, m & 255, (m >> 8) & 255, (m >> 16) & 255, (m >> 24) & 255, e.id & 255, (e.id >> 8) & 255, 0, 0]
  const crc = b.reduce((a, x) => a ^ x, 0xa5)
  return [...b, crc]
}

function StackedBar({ parts, total }: { parts: { label: string; bytes: number; color: string }[]; total: number }) {
  const used = parts.reduce((a, p) => a + p.bytes, 0)
  return (
    <div>
      <div className="flex h-5 overflow-hidden rounded-md bg-ink-700">
        {parts.map((p) => (
          <div key={p.label} title={`${p.label}: ${bytes(p.bytes)}`} style={{ width: `${(p.bytes / total) * 100}%`, background: p.color }} className="border-r border-ink-900/60 last:border-0" />
        ))}
      </div>
      <p className="mono mt-1.5 flex justify-between text-[10.5px] text-steel-300">
        <span>
          used <span className="text-bone">{bytes(used)}</span> ({fmt((used / total) * 100, 1)} %)
        </span>
        <span>
          free <span className="text-bone">{bytes(total - used)}</span>
        </span>
      </p>
    </div>
  )
}

export function MemorySection() {
  const store = useStore()
  const mem = useSnap((s) => s.mem, shallowEqual)
  const tasks = useSnap((s) => s.rtos.tasks)
  const flash = useSnap((s) => s.flash, shallowEqual)
  const head = useSnap((s) => s.flashHead)
  const events = useSnap((s) => s.events, (a, b) => a.length === b.length && a[a.length - 1]?.id === b[b.length - 1]?.id)
  const ring = store.sim.fw.flashRing
  const last = events.filter((e) => e.src === 'FW').slice(-6).reverse()

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-7">
        <section className="panel">
          <div className="panel-head">
            <span className="label">SRAM map · {MCU.sramKB} KB</span>
          </div>
          <div className="space-y-4 p-4">
            <StackedBar parts={mem.sram.map((p) => ({ label: p.label, bytes: p.bytes, color: TONE[p.tone] }))} total={mem.sramTotal} />
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {mem.sram.map((p) => (
                <li key={p.label} className="flex items-center gap-2.5 text-[14px] text-steel-200">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: TONE[p.tone] }} />
                  <span className="flex-1 truncate">{p.label}</span>
                  <span className="mono text-[11px] text-bone">{bytes(p.bytes)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="label">Flash · {MCU.flashKB} KB</span>
          </div>
          <div className="space-y-3 p-4">
            <StackedBar
              total={mem.flash.total}
              parts={[
                { label: 'Firmware image', bytes: mem.flash.image, color: C.bone },
                { label: 'Calibration + config', bytes: mem.flash.config, color: C.cur },
                { label: 'Event log partition', bytes: mem.flash.log, color: C.caution },
              ]}
            />
            <p className="mono text-[10.5px] text-steel-300">
              <span className="text-bone">firmware {bytes(mem.flash.image)}</span> · <span className="text-cur">config {bytes(mem.flash.config)}</span> · <span className="text-caution">log {bytes(mem.flash.log)}</span>
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="label">Stack high-water marks</span>
            <span className="mono text-[11px] text-steel-200">words used / allocated</span>
          </div>
          <ul className="space-y-3 p-4">
            {tasks.map((t) => {
              const f = t.stackUsed / t.stackWords
              return (
                <li key={t.id} className="grid grid-cols-[56px_1fr_92px] items-center gap-3">
                  <span className="mono text-[11px] font-medium" style={{ color: t.color }}>
                    {t.id}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-ink-600">
                    <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${f * 100}%`, background: f > 0.8 ? C.stop : f > 0.6 ? C.caution : t.color }} />
                  </span>
                  <span className="mono text-right text-[11px] text-steel-200">
                    {t.stackUsed} / {t.stackWords}
                  </span>
                </li>
              )
            })}
            <li className="text-[13.5px] leading-snug text-steel-300">The mark only ever rises. The fault-detection task digs deeper into its stack the first time it has to classify a fault.</li>
          </ul>
        </section>
      </div>

      <section className="panel lg:col-span-5">
        <div className="panel-head">
          <span className="label">Flash event log · ring of {MCU.logEntries}</span>
          <span className="mono text-[11px] text-steel-200">
            {flash.writes} writes · {flash.wraps} wraps
          </span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-16 gap-[3px]" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }} role="img" aria-label="Flash log ring buffer occupancy">
            {Array.from(ring, (c, i) => (
              <span
                key={i}
                className={cn('aspect-square rounded-[2px]', i === head && 'outline outline-2 outline-offset-1 outline-bone')}
                style={{ background: CELL[c] ?? CELL[0], opacity: c ? 1 : 0.7 }}
              />
            ))}
          </div>
          <p className="mono mt-2.5 text-[10.5px] text-steel-300">
            write head ▸ slot <span className="text-bone">{head}</span> · sectors erased <span className="text-bone">{flash.erased}</span> · oldest entries are overwritten first
          </p>

          <p className="label mb-2 mt-5">Latest entries as stored (16 bytes each)</p>
          <ul className="space-y-1.5">
            {last.length === 0 && <li className="text-[13px] text-steel-300">Nothing logged yet.</li>}
            {last.map((e) => {
              const b = entryBytes(e)
              return (
                <li key={e.id} className="rounded border border-ink-600 bg-ink-850/70 px-2.5 py-1.5">
                  <p className="mono flex flex-wrap gap-x-[5px] text-[11px] text-bone">
                    {b.map((x, i) => (
                      <span key={i} className={cn(i < 4 && 'text-steel-200', i === 4 && 'text-caution', i === 15 && 'text-go')}>
                        {hex(x)}
                      </span>
                    ))}
                  </p>
                  <p className="mt-1 truncate text-[12.5px] text-steel-300">
                    <span className="mono text-[10px]">{clock(e.tMs)}</span> {e.code} — {e.msg}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      </section>
    </div>
  )
}
