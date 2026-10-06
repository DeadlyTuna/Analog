"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Scope } from "@/components/charts";
import { BOM, PARTS, type PartId, TOTAL, rupees } from "@/components/lab/parts";
import { Sketch } from "@/components/landing/Sketch";
import { Card, OfflineNotice, STATUS, StatusIcon } from "@/components/ui";
import { type Channel, CLASSES, type ClassName, recentMean, useTelemetry } from "@/lib/telemetry";

const avg = (c: Channel, d: number) => {
  const v = recentMean(c, 100);
  return Number.isFinite(v) ? v.toFixed(d) : "—";
};

const btn = "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series";
const arrow = <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
const more = "inline-flex items-center gap-1.5 rounded text-sm font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-series";

function Section({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-5">
      <div className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{eyebrow}</p>
        <h2 id={id} className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        {intro && <p className="mt-2 leading-relaxed text-ink-2">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

const SIGNATURES: Record<ClassName, { happens: string; looks: string; features: string }> = {
  normal: {
    happens: "The shaft spins freely. The only load is the gearbox and bearings.",
    looks: "A steady ≈0.33 A with a little noise. The ≈600 Hz commutator ripple is removed by the filter before sampling.",
    features: "Low mean and RMS, small std, crest factor near 1, no strong low-frequency peak.",
  },
  overload: {
    happens: "The belt drags a load drum. More torque needs more current (torque ∝ current in a DC motor).",
    looks: "The whole level rises, up to ≈0.9 A, but the waveform stays smooth.",
    features: "Mean, RMS and peak go up together; crest factor and kurtosis stay low.",
  },
  friction: {
    happens: "A brake pad rubs the pulley once per revolution, so the motor briefly works harder each turn.",
    looks: "A near-normal baseline with a sharp spike about 3 times a second.",
    features: "High crest factor, kurtosis and peak-to-peak; dominant frequency ≈3 Hz; more energy in the 0.5–5 Hz band.",
  },
};

const CONCEPTS: [string, string, [string, string][]][] = [
  ["Ohm's law & shunt sensing", "V = I·R across a 0.1 Ω, 2 W low-side shunt: 0.33 A becomes 33 mV.", [["/how", "Pipeline"], ["/lab", "3D Lab"]]],
  ["Op-amp differential amplifier · gain · CMRR", "LM358 with Rin 10 kΩ and Rf 200 kΩ: gain 200k/10k = 20. Matched resistor pairs reject noise common to both shunt leads.", [["/how", "Schematic"]]],
  ["Active filters · Sallen-Key · Bode · Q", "Unity-gain Sallen-Key, R1 = R2 = 10 kΩ, C1 = 100 nF, C2 = 47 nF: fc 232 Hz, Q 0.73. The ≈600 Hz ripple drops ≈16 dB.", [["/how", "Bode plot"]]],
  ["Sampling · Nyquist · aliasing", "1 kHz sampling puts Nyquist at 500 Hz. Unfiltered, 600 Hz ripple would fold down to 400 Hz; the filter stops that.", [["/how", "Pipeline"]]],
  ["Quantisation & ADC resolution", "Arduino Uno A0, 10-bit, Vref 5 V: one LSB is 4.89 mV, which is 2.44 mA of motor current.", [["/how", "ADC stage"], ["/dashboard", "Dashboard"]]],
  ["Signal conditioning & saturation", "The LM358 on 5 V saturates near 3.5 V, so the chain reads at most ≈1.75 A. Overload (≤0.9 A) stays inside that.", [["/how", "Schematic"], ["/lab", "3D Lab"]]],
  ["Feature extraction & ML", "11 features per 1 s window (mean, RMS, std, peak, peak-to-peak, crest, kurtosis, dominant freq & amplitude, two band energies) feed a 100-tree Random Forest.", [["/dashboard", "Dashboard"], ["/how", "Pipeline"]]],
];

const KEY_PARTS: PartId[] = ["motor", "shunt", "opamp", "filter", "arduino", "adapter"];

const SCALE: [string, string, string][] = [
  ["Motor", "12 V geared DC motor", "1.5 kW induction motor"],
  ["Sensing", "Motor current via one shunt", "Vibration, temperature, current, speed"],
  ["Processing", "Arduino ADC + Python on a laptop", "MCU firmware: ADC + DMA, RTOS, DSP"],
  ["Decision", "Random Forest, 100 trees", "Rule-based classifier with debounce"],
  ["Output", "Live web dashboard", "Alarms, trip relay, Modbus RTU"],
  ["Live data", "Python backend", "Simulator in the browser"],
];

export default function Overview() {
  const { frame, hello, status } = useTelemetry();
  const live = status === "live" && !!frame;
  const label = frame?.label ?? "normal";
  const conf = frame ? Math.max(...frame.probs) * 100 : NaN;
  const nf = hello?.features.length ?? 11;

  const chain: [string, string, ReactNode][] = [
    ["DC motor", "12 V geared", <>{avg("i", 3)} A</>],
    ["Shunt", "0.1 Ω · low side", <>{avg("vs", 1)} mV</>],
    ["Diff amp", "LM358 · ×20", <>{avg("va", 2)} V</>],
    ["Filter", "Sallen-Key · 232 Hz", <>{avg("vf", 2)} V</>],
    ["ADC", "10-bit · 1 kHz", <>{avg("adc", 0)} <span className="text-xs font-normal text-ink-2">/ 1023</span></>],
    ["Features", "1 s window", <>{nf} <span className="text-xs font-normal text-ink-2">features</span></>],
    ["Random Forest", "100 trees",
      live ? <span className="flex items-center gap-1.5"><StatusIcon c={label} className="size-4" />{STATUS[label].short}</span> : "—"],
  ];

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-16 px-4 py-8 sm:px-6 sm:py-12">
      <div className="grid gap-4">
        <OfflineNotice />
        {/* hero */}
        <section className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div className="rise">
            <p className="text-sm text-ink-2">Analog Electronics · Semester 3 project</p>
            <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              AI-Based Motor Fault Detection Using Analog Current Sensing
            </h1>
            <p className="mt-4 max-w-xl text-pretty text-lg leading-relaxed text-ink-2">
              A 0.1 Ω resistor, one op-amp chip and an Arduino listen to a motor&apos;s current, and a Random Forest tells
              normal running from overload and mechanical rubbing, once a second.
            </p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm">
              {live ? (
                <>
                  <StatusIcon c={label} className="size-4" />
                  <span className="font-medium">{STATUS[label].label}</span>
                  <span className="tabular-nums text-ink-2">· {conf.toFixed(0)}% confidence · live</span>
                </>
              ) : (
                <>
                  <span className="size-2 rounded-full bg-muted" />
                  <span>{status === "offline" ? "Backend offline · live parts paused" : "Connecting to backend…"}</span>
                </>
              )}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/dashboard" className={`${btn} bg-ink text-page hover:bg-ink/85`}>Open dashboard {arrow}</Link>
              <Link href="/present" className={`${btn} border border-line bg-surface hover:border-ink/30`}>Start presentation</Link>
              <Link href="/lab" className={`${btn} text-ink-2 hover:text-ink`}>Explore the 3D bench</Link>
            </div>
          </div>
          <Card title="Motor current · live" meta={<>{avg("i", 3)} A <span className="text-ink-2">· RPM {frame ? frame.truth.rpm.toFixed(0) : "—"}</span></>}>
            <Scope channel="i" range={[0, 1.2]} ticks={[0, 0.4, 0.8, 1.2]} unit="A" axis fill className="h-48 sm:h-56" />
            <p className="mt-3 text-xs leading-relaxed text-ink-2">
              {live
                ? "Streaming from the simulated Arduino at 1 kHz. Switch faults on the dashboard and watch this trace change."
                : "The trace fills in once the Python backend is running."}
            </p>
          </Card>
        </section>
      </div>

      <Section id="why" eyebrow="Why current?" title="The motor already reports its health. We just measure it.">
        <ol className="grid gap-4 md:grid-cols-3">
          {([
            ["Problem", "Motors fail slowly: overloads and rubbing parts waste energy and wear the motor out long before it stops. Vibration sensors and manual checks are expensive or easy to skip."],
            ["Idea", "Every extra bit of torque shows up as extra current. A single 0.1 Ω shunt in the ground return measures it without touching the shaft or opening the motor."],
            ["Result", `Analog conditioning makes the signal clean enough to sample, and ${nf} features over 1 s windows let a Random Forest name the fault. Parts cost about ${rupees(TOTAL)}.`],
          ] as const).map(([k, v], j) => (
            <li key={k} className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-xs tabular-nums text-muted">{String(j + 1).padStart(2, "0")}</p>
              <h3 className="mt-1 font-semibold">{k}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{v}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="chain" eyebrow="Signal chain" title="From a spinning shaft to a verdict"
        intro="Seven stages, each reading live from the backend. Every stage has its own scope, formula and explanation on the How it works page.">
        <Link href="/how"
          className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-series">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {chain.map(([name, spec, value], j) => (
              <li key={name} className="relative rounded-2xl border border-line bg-surface p-4 transition-colors group-hover:border-ink/20">
                <p className="text-xs tabular-nums text-muted">{String(j + 1).padStart(2, "0")}</p>
                <h3 className="mt-1 text-sm font-medium">{name}</h3>
                <p className="truncate text-xs text-ink-2">{spec}</p>
                <div className="mt-3 text-lg font-semibold tabular-nums">{value}</div>
                {j < chain.length - 1 && <span aria-hidden className="flow-r absolute -right-1.5 top-1/2 hidden h-1 w-2 lg:block" />}
              </li>
            ))}
          </ol>
          <span className={`${more} mt-4`}>See every stage on How it works {arrow}</span>
        </Link>
      </Section>

      <Section id="faults" eyebrow="Fault signatures" title="Three conditions, three shapes of current"
        intro="What physically happens, what it does to the current, and which features give it away.">
        <div className="grid gap-4 md:grid-cols-3">
          {CLASSES.map((c) => {
            const s = SIGNATURES[c];
            return (
              <article key={c} className="flex flex-col rounded-2xl border border-line bg-surface p-5">
                <h3 className="flex items-center gap-2.5 font-semibold">
                  <StatusIcon c={c} className="size-6" />
                  {STATUS[c].label}
                </h3>
                <div className="mt-4 rounded-xl bg-surface-2 p-3">
                  <Sketch c={c} />
                  <p className="mt-1 text-[11px] text-muted">Sketch · 2 s of motor current</p>
                </div>
                <dl className="mt-4 grid gap-3 text-sm">
                  {([["What happens", s.happens], ["The current", s.looks], ["Features that reveal it", s.features]] as const).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs font-medium text-muted">{k}</dt>
                      <dd className="mt-0.5 leading-relaxed text-ink-2">{v}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            );
          })}
        </div>
      </Section>

      <Section id="concepts" eyebrow="Syllabus map" title="Analog concepts in this project"
        intro="Each course topic, the exact numbers it takes in this circuit, and where to see it on this site.">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div aria-hidden className="hidden grid-cols-[16rem_1fr_11rem] gap-4 border-b border-line px-5 py-3 text-xs font-medium text-muted md:grid">
            <span>Topic</span><span>In this project</span><span>Where</span>
          </div>
          <ul className="divide-y divide-line">
            {CONCEPTS.map(([topic, here, where]) => (
              <li key={topic} className="grid gap-1.5 px-5 py-4 md:grid-cols-[16rem_1fr_11rem] md:gap-4">
                <span className="font-medium">{topic}</span>
                <span className="text-sm leading-relaxed text-ink-2">{here}</span>
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {where.map(([href, name]) => (
                    <Link key={name} href={href} className="rounded underline decoration-line underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-series">
                      {name}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs leading-relaxed text-ink-2">
          Model accuracy on simulated held-out data is 100%. That is optimistic: the simulator&apos;s faults are cleaner than a real bench,
          so expect lower numbers on hardware.
        </p>
      </Section>

      <Section id="hardware" eyebrow="Hardware & cost" title={`The whole bench for about ${rupees(TOTAL)}`}
        intro={`${BOM.length} line items, all off-the-shelf. Click any part on the 3D bench for its role and live reading.`}>
        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {KEY_PARTS.map((id) => (
              <li key={id} className="rounded-2xl border border-line bg-surface p-4">
                <h3 className="text-sm font-medium">{PARTS[id].name}</h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-2">{PARTS[id].spec}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-line bg-surface p-5">
            <div>
              <p className="text-sm text-ink-2">Estimated total</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{rupees(TOTAL)}</p>
              <p className="mt-2 text-xs leading-relaxed text-ink-2">Indian retail prices, including breadboards, wires and the load rig.</p>
            </div>
            <Link href="/lab" className={more}>Full bill of materials in the 3D Lab {arrow}</Link>
          </div>
        </div>
      </Section>

      <Section id="industry" eyebrow="Extension" title="Scaling up to industry"
        intro="The same idea, grown up: an embedded predictive-maintenance system for a 1.5 kW induction motor, with its own firmware simulator.">
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Aspect</span></th>
                  <th scope="col" className="px-4 py-3 font-medium">This project</th>
                  <th scope="col" className="px-4 py-3 font-medium">Industry extension</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {SCALE.map(([k, a, b]) => (
                  <tr key={k}>
                    <th scope="row" className="px-4 py-2.5 align-top text-xs font-medium text-muted">{k}</th>
                    <td className="px-4 py-2.5 align-top">{a}</td>
                    <td className="px-4 py-2.5 align-top text-ink-2">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-line bg-surface p-5">
            <div>
              <p className="font-semibold">Vigil, by Sidhant</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                A friend&apos;s firmware twin: ADC sampling over DMA, an RTOS scheduler, DSP features, a rule classifier and a Modbus
                register map, all running in your browser.
              </p>
            </div>
            <div className="grid gap-2">
              <Link href="/industry" className={more}>Open the industry extension {arrow}</Link>
              <Link href="/industry/control-room" className={more}>Control room</Link>
              <Link href="/industry/firmware" className={more}>Firmware</Link>
            </div>
          </div>
        </div>
      </Section>

      <p className="max-w-3xl text-xs leading-relaxed text-ink-2">
        Everything live on this site comes from a Python model of the motor and the analog front-end (backend/motor.py), streamed as
        if from the Arduino. The hardware parts and numbers are the real design; the waveforms are simulated.
      </p>
    </main>
  );
}
