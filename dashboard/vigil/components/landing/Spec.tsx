'use client'

import { shallowEqual, useSnap, useStore } from '@vigil/components/sim/SimProvider'
import { C } from '@vigil/lib/theme'
import { cn, fmt } from '@vigil/lib/utils'

const Rivet = ({ className }: { className?: string }) => (
  <span className={cn('absolute h-2.5 w-2.5 rounded-full bg-gradient-to-br from-steel-200 to-ink-500 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.5)]', className)} aria-hidden />
)

/** The two reference operating points from the project brief, next to what the simulator produces right now. */
export function Spec() {
  const store = useStore()
  const m = useSnap((s) => s.meas, shallowEqual)
  const mode = useSnap((s) => {
    const others = s.faults.every((f) => f.key === 'overload' || f.target < 0.001)
    const ovl = s.faults.find((f) => f.key === 'overload')!.target
    if (s.faults.every((f) => f.target < 0.001)) return 'normal'
    return others && ovl > 0.99 ? 'overload' : 'custom'
  })

  const rows = [
    { k: 'Temperature', n: '55 °C', o: '78 °C', live: `${fmt(m.tempC, 1)} °C`, c: C.temp },
    { k: 'Vibration', n: '0.25 g', o: '0.40 g', live: `${fmt(m.vibRms, 2)} g`, c: C.vib },
    { k: 'Current', n: '4.2 A', o: '7.8 A', live: `${fmt(m.curRms, 1)} A`, c: C.cur },
    { k: 'Speed', n: '1480 rpm', o: '1350 rpm', live: `${fmt(m.rpm, 0)} rpm`, c: C.rpm },
  ]

  return (
    <section className="panel relative overflow-hidden p-5 sm:p-7">
      <Rivet className="left-3 top-3" />
      <Rivet className="right-3 top-3" />
      <Rivet className="bottom-3 left-3" />
      <Rivet className="bottom-3 right-3" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Reference points · layer 1</p>
          <h3 className="display mt-1.5 text-[34px] text-bone">Same motor, two loads</h3>
        </div>
        <div className="flex gap-2">
          <button type="button" className={cn('btn btn-sm', mode === 'normal' && '!border-go !text-go')} aria-pressed={mode === 'normal'} onClick={() => store.maintenance()}>
            Run normal
          </button>
          <button
            type="button"
            className={cn('btn btn-sm', mode === 'overload' && '!border-caution !text-caution')}
            aria-pressed={mode === 'overload'}
            onClick={() => {
              store.maintenance()
              store.setFault('overload', 1)
            }}
          >
            Run overloaded
          </button>
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-ink-500">
            <th scope="col" className="label pb-2.5 font-medium">
              Quantity
            </th>
            <th scope="col" className={cn('label pb-2.5 text-right font-medium', mode === 'normal' && '!text-go')}>
              Normal
            </th>
            <th scope="col" className={cn('label pb-2.5 text-right font-medium', mode === 'overload' && '!text-caution')}>
              Overloaded
            </th>
            <th scope="col" className="label pb-2.5 text-right font-medium !text-bone">
              Live now
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className="border-b border-ink-700/80 last:border-0">
              <th scope="row" className="py-3.5 text-[17px] font-semibold text-bone">
                <span className="mr-2.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: r.c }} />
                {r.k}
              </th>
              <td className={cn('readout py-3.5 text-right text-[20px]', mode === 'normal' ? 'text-go' : 'text-steel-200')}>{r.n}</td>
              <td className={cn('readout py-3.5 text-right text-[20px]', mode === 'overload' ? 'text-caution' : 'text-steel-200')}>{r.o}</td>
              <td className="readout py-3.5 text-right text-[20px] text-bone">{r.live}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 max-w-[70ch] text-[13.5px] leading-snug text-steel-300">
        The live column should settle on whichever column you run. Temperature takes about 40 seconds to get there because the thermal model is time-compressed (a real frame needs around 20 minutes).
      </p>
    </section>
  )
}
