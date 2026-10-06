import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Architecture } from '@vigil/components/landing/Architecture'
import { Channels } from '@vigil/components/landing/Channels'
import { Concepts } from '@vigil/components/landing/Concepts'
import { Hardware } from '@vigil/components/landing/Hardware'
import { Hero } from '@vigil/components/landing/Hero'
import { Reveal } from '@vigil/components/landing/Reveal'
import { Spec } from '@vigil/components/landing/Spec'
import { Timelines } from '@vigil/components/landing/Timelines'
import { SectionHead } from '@vigil/components/ui/SectionHead'

function Section({ id, kicker, title, note, children }: { id: string; kicker: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 pt-24 sm:pt-28">
      <Reveal>
        <SectionHead className="mb-6" kicker={kicker} title={title} note={note} />
      </Reveal>
      {children}
    </section>
  )
}

export default function Home() {
  return (
    <>
      <Hero />
      <div className="mx-auto max-w-[1680px] px-4 sm:px-6">
        <Section
          id="why"
          kicker="the problem"
          title="Two ways a motor dies"
          note="Run it until it stops, or watch it while it runs. Same bearing, same wear. Only one of them gets a say in when the line goes down."
        >
          <Timelines />
        </Section>

        <Section
          id="channels"
          kicker="what it listens to"
          title="Four channels, six kinds of trouble"
          note="Each sensor sees a different part of the story. No single channel can tell an overload from a failing bearing; together they can."
        >
          <Channels />
        </Section>

        <Section
          id="architecture"
          kicker="how it is built"
          title="Two layers, one signal path"
          note="Layer 1 is a virtual motor that produces realistic sensor signals. Layer 2 is the embedded firmware that has to make sense of them."
        >
          <Architecture />
        </Section>

        <Section
          id="concepts"
          kicker="the embedded checklist"
          title="Twelve concepts, running now"
          note="Each card shows a live number from the running firmware. Click one to jump to the part of the firmware page that demonstrates it."
        >
          <Concepts />
        </Section>

        <Section id="spec" kicker="reference points" title="Normal and overloaded" note="The two operating points from the project brief. The simulator is calibrated to reproduce them.">
          <Reveal>
            <Spec />
          </Reveal>
        </Section>

        <Section
          id="hardware"
          kicker="when the parts arrive"
          title="Maps one-to-one to real hardware"
          note="Nothing in the firmware depends on the motor being virtual. Swap the simulated sensors for these parts and the same pipeline runs."
        >
          <Hardware />
        </Section>

        <Reveal className="mt-28">
          <div className="panel relative overflow-hidden px-6 py-14 text-center sm:py-20">
            <div className="hazard absolute inset-x-0 top-0 h-[7px]" aria-hidden />
            <h2 className="stencil mx-auto max-w-[14ch] text-[clamp(3.2rem,8vw,7rem)] text-bone">Break something.</h2>
            <p className="mx-auto mt-5 max-w-[48ch] text-[18px] leading-snug text-steel-200 text-pretty">
              Wear a bearing, block the fan, overload the shaft. Then watch how long the firmware takes to notice.
            </p>
            <Link href="/vigil/control-room" className="btn btn-primary mt-8 !h-12 !px-7 !text-[16px]">
              Open the control room <ArrowRight size={18} aria-hidden />
            </Link>
          </div>
        </Reveal>
      </div>
    </>
  )
}
