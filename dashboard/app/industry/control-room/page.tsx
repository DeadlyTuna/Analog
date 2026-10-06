import { ClassifierPanel } from '@vigil/components/diagnosis/ClassifierPanel'
import { EventLog } from '@vigil/components/diagnosis/EventLog'
import { IndicatorTable } from '@vigil/components/diagnosis/IndicatorTable'
import { Pipeline } from '@vigil/components/diagnosis/Pipeline'
import { FaultDeck } from '@vigil/components/controls/FaultDeck'
import { Transport } from '@vigil/components/controls/Transport'
import { SignalsSection } from '@vigil/components/control/SignalsSection'
import { Viewport } from '@vigil/components/control/Viewport'
import { GuidedDemoButton } from '@vigil/components/shell/TourBar'
import { SectionHead } from '@vigil/components/ui/SectionHead'
import { HealthPanel } from '@vigil/components/vitals/HealthPanel'
import { SensorCard } from '@vigil/components/vitals/SensorCard'

export const metadata = { title: 'Control room — Industry extension' }

export default function ControlRoom() {
  return (
    <div className="mx-auto max-w-[1680px] px-4 pb-20 pt-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Live simulation</p>
          <h1 className="display mt-1.5 text-[44px] text-bone sm:text-[56px]">Control room</h1>
        </div>
        <div className="flex max-w-[56ch] flex-col items-start gap-3">
        <p className="text-[15px] text-steel-200 text-pretty">
          A virtual 1.5 kW motor on a test bench, watched by real firmware logic running in your browser. Inject a fault below and see how long it takes the controller to notice.
        </p>
        <GuidedDemoButton className="btn-primary" label="Run the guided demo" />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <Viewport />
          <Transport />
          <FaultDeck />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-4">
          <HealthPanel />
          <IndicatorTable className="flex-1" fill />
        </div>
      </div>

      <SectionHead className="mb-4 mt-14" kicker="four channels" title="Vitals" note="What the controller measures right now, against the limits stored in its firmware." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SensorCard ch="vib" />
        <SensorCard ch="temp" />
        <SensorCard ch="cur" />
        <SensorCard ch="rpm" />
      </div>

      <SectionHead className="mb-4 mt-14" kicker="what the MCU samples" title="Signals" note="Raw ADC data after calibration, the FFT the DSP task computes from it, and two minutes of history." />
      <SignalsSection />

      <SectionHead className="mb-4 mt-14" kicker="from sensor to alarm" title="Diagnosis" note="The path every sample takes, how the classifier weighs the evidence, and everything the firmware logged." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Pipeline className="lg:col-span-4" />
        <div className="grid grid-cols-1 gap-4 lg:col-span-8 lg:grid-rows-[auto_1fr]">
          <ClassifierPanel />
          <EventLog className="min-h-[300px]" />
        </div>
      </div>
    </div>
  )
}
