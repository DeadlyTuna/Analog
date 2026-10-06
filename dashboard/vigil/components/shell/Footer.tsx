import Link from 'next/link'

export function Footer() {
  return (
    <footer className="mt-24 border-t border-ink-600/70">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-start justify-between gap-x-10 gap-y-6 px-4 py-9 sm:px-6">
        <div className="max-w-[58ch]">
          <p className="stencil text-[34px] text-bone">Vigil</p>
          <p className="mt-3 text-[14px] leading-snug text-steel-300 text-pretty">
            Vigil is a simulation. The motor is a calibrated model; the firmware logic (interrupts, scheduler, DSP, classifier, protocols) is real code running in your browser. Nothing here is connected to hardware.
          </p>
        </div>
        <nav aria-label="Footer" className="flex gap-10">
          <ul className="space-y-2 text-[15px]">
            <li className="label mb-3">Pages</li>
            <li>
              <Link className="text-steel-200 hover:text-bone" href="/vigil">
                Overview
              </Link>
            </li>
            <li>
              <Link className="text-steel-200 hover:text-bone" href="/vigil/control-room">
                Control room
              </Link>
            </li>
            <li>
              <Link className="text-steel-200 hover:text-bone" href="/vigil/firmware">
                Firmware
              </Link>
            </li>
            <li>
              <Link className="text-steel-200 hover:text-bone" href="/">
                Analog front-end + AI ↗
              </Link>
            </li>
          </ul>
          <ul className="space-y-2 text-[15px]">
            <li className="label mb-3">Project</li>
            <li className="text-steel-200">Embedded predictive maintenance</li>
            <li className="text-steel-200">for industrial motors</li>
            <li className="text-steel-300">Design and simulation</li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
