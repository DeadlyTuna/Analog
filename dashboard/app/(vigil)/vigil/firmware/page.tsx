import { AcquisitionSection } from '@vigil/components/firmware/AcquisitionSection'
import { BoardDiagram } from '@vigil/components/firmware/BoardDiagram'
import { CommsSection } from '@vigil/components/firmware/CommsSection'
import { Console } from '@vigil/components/firmware/Console'
import { DetectionSection } from '@vigil/components/firmware/DetectionSection'
import { DspSection } from '@vigil/components/firmware/DspSection'
import { FirmwareIndex } from '@vigil/components/firmware/FirmwareIndex'
import { FwSection } from '@vigil/components/firmware/FwSection'
import { InterruptSection } from '@vigil/components/firmware/InterruptSection'
import { LatencySection } from '@vigil/components/firmware/LatencySection'
import { MemorySection } from '@vigil/components/firmware/MemorySection'
import { SchedulerSection } from '@vigil/components/firmware/SchedulerSection'

export const metadata = { title: 'Firmware — Vigil' }

export default function FirmwarePage() {
  return (
    <div className="mx-auto max-w-[1680px] px-4 pb-10 pt-6 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Embedded controller · simulated</p>
          <h1 className="display mt-1.5 text-[44px] text-bone sm:text-[56px]">Firmware</h1>
        </div>
        <p className="max-w-[60ch] text-[15px] text-steel-200 text-pretty">
          An STM32F411-class controller running a five-task real-time system. Everything on this page is live: interrupt counts, scheduler traces, FFT features, protocol frames and the memory map all come from the same code that is watching the motor.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <FirmwareIndex />
        </aside>

        <div className="min-w-0 space-y-24">
          <FwSection id="board" kicker="hardware view" title="The board" note="Sensors come in on the left, GPIO goes out on the right, UART talks to the world. The numbers beside each input are the raw counts the firmware actually reads.">
            <BoardDiagram />
          </FwSection>

          <FwSection id="acquisition" kicker="real-time data acquisition · adc" title="Acquisition" note="A timer triggers the ADC, DMA files each result away, and the CPU only wakes when half a buffer is ready.">
            <AcquisitionSection />
          </FwSection>

          <FwSection id="interrupts" kicker="interrupts · timers" title="Interrupts and timers" note="Four interrupt vectors and four time bases keep everything on schedule without the CPU polling anything.">
            <InterruptSection />
          </FwSection>

          <FwSection id="scheduler" kicker="rtos · task scheduling · priority" title="Scheduler" note="A preemptive, fixed-priority scheduler. Change the core clock or flood the CPU with a rogue task and watch what gets protected.">
            <SchedulerSection />
          </FwSection>

          <FwSection id="dsp" kicker="signal processing" title="Signal processing" note="Raw samples become a handful of numbers that mean something to a maintenance engineer.">
            <DspSection />
          </FwSection>

          <FwSection id="detection" kicker="fault detection" title="Fault detection" note="Limits and debounce decide when to raise an alarm. A classifier explains why.">
            <DetectionSection />
          </FwSection>

          <FwSection id="comms" kicker="communication protocols" title="Communication" note="Two wire formats leave the board: a compact telemetry frame for the dashboard and Modbus RTU registers for an industrial master.">
            <CommsSection />
          </FwSection>

          <FwSection id="memory" kicker="memory · logging" title="Memory and logging" note="Where every byte of RAM goes, and how events are written to a wear-levelled flash ring.">
            <MemorySection />
          </FwSection>

          <FwSection id="latency" kicker="response time" title="Response time" note="How quickly a fault becomes an alarm, and how much slack every task has before it misses a deadline.">
            <LatencySection />
          </FwSection>

          <FwSection id="console" kicker="debug output" title="Serial console" note="What a terminal attached to the debug UART would show.">
            <Console />
          </FwSection>
        </div>
      </div>
    </div>
  )
}
