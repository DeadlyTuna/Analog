"use client";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Bode, db, FC, Q, rippleHz } from "@/components/Bode";
import { Scope, Spectrum, Timeline } from "@/components/charts";
import { BOM, rupees, TOTAL } from "@/components/lab/parts";
import { Schematic } from "@/components/Schematic";
import { Card, Controls, Probabilities, STATUS, StatusIcon } from "@/components/ui";
import { CLASSES, type Channel, type ClassName, command, latest, recentMean, sample, useTelemetry } from "@/lib/telemetry";

/** Fill these in before the viva. */
export const DECK = {
  presenter: "Presenter name",
  roll: "Roll number",
  guide: "Guide name",
  institute: "Institute name",
};

export type SlideDef = {
  title: string;
  notes: string;
  /** Puts the live motor into the state this slide talks about. */
  enter?: () => void;
  /** Shows the offline notice: the slide needs the backend to be meaningful. */
  live?: boolean;
  Body: () => ReactNode;
};

/* ---------- building blocks ---------- */

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const avg = (c: Channel, d: number) => fmt(recentMean(c, 100), d);

function useLive() {
  const { frame, hello, status } = useTelemetry();
  const feat = (k: string) => (frame && hello ? frame.feat[hello.features.indexOf(k)] : NaN);
  return { frame, hello, live: status === "live", feat };
}

function Head({ kicker, title, lede }: { kicker: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <header className="max-w-4xl">
      <p className="text-sm font-medium text-ink-2 sm:text-base">{kicker}</p>
      <h2 className="mt-2 text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">{title}</h2>
      {lede && <p className="mt-4 max-w-3xl text-pretty text-lg leading-relaxed text-ink-2 sm:text-xl">{lede}</p>}
    </header>
  );
}

function Split({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-10">{children}</div>;
}

function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-4 text-lg leading-snug sm:text-xl">
      {items.map((p, j) => (
        <li key={j} className="flex gap-3">
          <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-muted" />
          <span className="text-pretty">{p}</span>
        </li>
      ))}
    </ul>
  );
}

function Eq({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-surface-2 px-4 py-3 font-mono text-base text-ink sm:text-lg">{children}</p>;
}

function Stat({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
        {value}{unit && <span className="ml-1.5 text-lg font-normal text-ink-2">{unit}</span>}
      </p>
      {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
    </div>
  );
}

/** The AI's current verdict: icon + label + confidence. */
function Verdict({ big = false }: { big?: boolean }) {
  const { frame } = useLive();
  if (!frame) return <p className="text-ink-2">Waiting for the backend…</p>;
  return (
    <span key={frame.label} className={`rise flex items-center ${big ? "gap-4" : "gap-2.5"}`}>
      <StatusIcon c={frame.label} className={big ? "size-14 sm:size-20" : "size-7"} />
      <span>
        <span className={`block font-semibold tracking-tight ${big ? "text-4xl sm:text-6xl" : "text-xl"}`}>{STATUS[frame.label].label}</span>
        <span className={`block tabular-nums text-ink-2 ${big ? "text-lg sm:text-xl" : "text-sm"}`}>
          {(Math.max(...frame.probs) * 100).toFixed(0)}% confidence
        </span>
      </span>
    </span>
  );
}

const FEATURES: Record<string, { label: string; unit: string; show: (v: number) => string; domain: "Time" | "Frequency" }> = {
  mean: { label: "Mean", unit: "A", show: (v) => fmt(v, 3), domain: "Time" },
  rms: { label: "RMS", unit: "A", show: (v) => fmt(v, 3), domain: "Time" },
  std: { label: "Std deviation", unit: "mA", show: (v) => fmt(v * 1e3, 1), domain: "Time" },
  peak: { label: "Peak", unit: "A", show: (v) => fmt(v, 3), domain: "Time" },
  p2p: { label: "Peak-to-peak", unit: "A", show: (v) => fmt(v, 3), domain: "Time" },
  crest: { label: "Crest factor", unit: "", show: (v) => fmt(v, 2), domain: "Time" },
  kurtosis: { label: "Kurtosis", unit: "", show: (v) => fmt(v, 2), domain: "Time" },
  dom_freq: { label: "Dominant frequency", unit: "Hz", show: (v) => fmt(v, 2), domain: "Frequency" },
  dom_amp: { label: "Dominant amplitude", unit: "mA", show: (v) => fmt(v * 1e3, 1), domain: "Frequency" },
  band_0_5: { label: "Band energy 0.5–5 Hz", unit: "%", show: (v) => fmt(v * 100, 0), domain: "Frequency" },
  band_5_50: { label: "Band energy 5–50 Hz", unit: "%", show: (v) => fmt(v * 100, 0), domain: "Frequency" },
};
const KEYS = Object.keys(FEATURES);

function FeatureList({ keys }: { keys: string[] }) {
  const { feat } = useLive();
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-base sm:text-lg">
      {keys.map((k) => (
        <Fragment key={k}>
          <dt className="text-ink-2">{FEATURES[k].label}</dt>
          <dd className="text-right tabular-nums">{FEATURES[k].show(feat(k))}<span className="ml-1 text-sm text-ink-2">{FEATURES[k].unit}</span></dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Votes() {
  const { frame } = useLive();
  const votes = frame?.votes ?? [];
  return (
    <div className="mx-auto grid w-full max-w-xs grid-cols-10 gap-1" role="img"
      aria-label={votes.length ? CLASSES.map((c, j) => `${votes.filter((v) => v === j).length} trees vote ${STATUS[c].label}`).join(", ") : "No votes yet"}>
      {(votes.length ? votes : Array<number>(100).fill(-1)).map((v, j) => (
        <span key={j} className="aspect-square rounded-full bg-surface-2 transition-colors duration-300"
          style={v >= 0 ? { background: STATUS[CLASSES[v]].color } : undefined} />
      ))}
    </div>
  );
}

const enter = (c: ClassName, s = 0.6) => () => command(c, s);

/* ---------- the three conditions ---------- */

const CONDITION: Record<ClassName, { title: string; physics: ReactNode[]; signature: string[]; notes: string; severity: number }> = {
  normal: {
    title: "Normal: free running",
    physics: [
      "Only the pulley and belt to turn: a light, steady load.",
      "Current sits around 0.33 A with a little wander from the belt.",
      "The 600 Hz commutator ripple is there, but the filter has already removed most of it.",
    ],
    signature: ["mean", "rms", "crest", "kurtosis", "dom_freq"],
    severity: 0.6,
    notes: "This is the healthy baseline the model learns. Point at the flat trace near 0.33 A and the low crest factor and kurtosis. Everything the AI flags later is a departure from this picture.",
  },
  overload: {
    title: "Overload: too much torque",
    physics: [
      "The belt drags a heavier load drum, so the motor needs more torque.",
      "In a DC motor torque is proportional to current: current climbs, up to about 0.9 A.",
      "The trace stays smooth, it just sits higher. Mean and RMS rise; crest factor stays low.",
    ],
    signature: ["mean", "rms", "crest", "kurtosis", "p2p"],
    severity: 0.7,
    notes: "The deck has just switched the simulated motor to overload. Torque is proportional to current, so the whole trace lifts. Notice the shape barely changes: mean and RMS separate this class, not spikiness.",
  },
  friction: {
    title: "Friction: a rub once per turn",
    physics: [
      "A pad rubs the pulley at one spot, so the shaft binds once per revolution.",
      "Each rub is a short current spike, repeating at about 3 Hz (≈200 RPM ÷ 60).",
      "Mean current barely moves, but crest factor and kurtosis jump and a 3 Hz peak appears in the spectrum.",
    ],
    signature: ["mean", "crest", "kurtosis", "dom_freq", "band_0_5"],
    severity: 0.6,
    notes: "Now the deck injects friction. The mean is close to normal, so a simple threshold would miss it. The spikes once per revolution give a high crest factor, high kurtosis and a dominant frequency near 3 Hz.",
  },
};

function conditionSlide(c: ClassName, n: number): SlideDef {
  const d = CONDITION[c];
  return {
    title: STATUS[c].label,
    notes: d.notes,
    live: true,
    enter: enter(c, d.severity),
    Body: function ConditionSlide() {
      const { frame, live } = useLive();
      return (
        <>
          <header className="max-w-4xl">
            <p className="text-sm font-medium text-ink-2 sm:text-base">Condition {n} of 3</p>
            <h2 className="mt-2 flex items-center gap-4 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              <StatusIcon c={c} className="size-10 sm:size-12" />
              {d.title}
            </h2>
          </header>
          <Split>
            <div className="space-y-6">
              <Points items={d.physics} />
              <Card title="Key features, live" meta={live && frame && frame.truth.condition !== c ? "settling…" : undefined}>
                <FeatureList keys={d.signature} />
              </Card>
            </div>
            <div className="space-y-4">
              <Card title="Motor current, last 3 s" meta={`${avg("i", 3)} A`}>
                <Scope channel="i" unit="A" range={[0, 1.2]} ticks={[0, 0.4, 0.8, 1.2]} axis fill className="h-56 sm:h-64" />
              </Card>
              <Card><Verdict /></Card>
            </div>
          </Split>
        </>
      );
    },
  };
}

/* ---------- the deck ---------- */

const BLOCKS: [string, string, () => ReactNode][] = [
  ["Motor", "12 V geared DC", () => `${avg("i", 3)} A`],
  ["Shunt", "0.1 Ω low side", () => `${avg("vs", 1)} mV`],
  ["Diff amp", "LM358 · ×20", () => `${avg("va", 2)} V`],
  ["Sallen-Key", "low-pass · 232 Hz", () => `${avg("vf", 2)} V`],
  ["Arduino ADC", "10-bit · 1 kHz", () => avg("adc", 0)],
];

export const SLIDES: SlideDef[] = [
  {
    title: "Title",
    enter: enter("normal"),
    notes: "Introduce yourself and the project in one breath. The whole deck is live: the numbers on screen come from a simulation of the real circuit running right now. The status in the corner is the AI's current verdict.",
    Body: function Title() {
      const { live, frame } = useLive();
      return (
        <div className="space-y-8">
          <p className="text-base font-medium text-ink-2 sm:text-lg">Analog Electronics · Semester 3</p>
          <h1 className="max-w-5xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            AI-Based Motor Fault Detection Using Analog Current Sensing
          </h1>
          <p className="max-w-3xl text-pretty text-lg leading-relaxed text-ink-2 sm:text-2xl">
            A 0.1 Ω shunt, an LM358 and an Arduino measure a motor&apos;s current. A Random Forest reads the pattern and
            tells healthy from faulty.
          </p>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-base sm:text-lg">
              <dt className="text-ink-2">Presented by</dt><dd>{DECK.presenter} · {DECK.roll}</dd>
              <dt className="text-ink-2">Guide</dt><dd>{DECK.guide}</dd>
              <dt className="text-ink-2">Institute</dt><dd>{DECK.institute}</dd>
            </dl>
            <div className="rounded-2xl border border-line bg-surface px-5 py-4">
              <p className="mb-2 text-xs text-ink-2">{live ? `Live · ${avg("i", 2)} A` : "Live status"}</p>
              {live && frame ? <Verdict /> : <p className="flex items-center gap-2 text-ink-2"><span className="size-2 rounded-full bg-muted" />Backend offline</p>}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    title: "The problem",
    live: true,
    notes: "Motors run pumps, fans, conveyors and machine tools, and when one stops unexpectedly the whole line stops with it. Most failures start small: an overload or something rubbing. The key point is the last line: the fault shows up in the current before the motor actually fails.",
    Body: () => (
      <>
        <Head kicker="The problem" title="Motors fail, and they rarely warn anyone." />
        <Split>
          <Points items={[
            "Motors drive pumps, fans, conveyors and machine tools.",
            "An unplanned stop halts production and forces a rushed repair.",
            "Faults start small: too much load, a part beginning to rub or bind.",
            <b key="b" className="font-semibold">A fault changes the current a motor draws, long before it breaks.</b>,
          ]} />
          <Card title="Our motor's current, right now" meta={`${avg("i", 3)} A`}>
            <Scope channel="i" unit="A" axis fill className="h-56 sm:h-64" />
            <p className="mt-3 text-sm text-ink-2">If we can read this signal, we can hear the fault coming.</p>
          </Card>
        </Split>
      </>
    ),
  },
  {
    title: "The idea",
    notes: "This is motor current signature analysis. We do not need a sensor on the shaft: one resistor in the supply line is enough. The analog part makes the signal clean and measurable, the AI part recognises the pattern.",
    Body: () => (
      <>
        <Head kicker="The idea" title="Listen to the current."
          lede="Current signature analysis: measure the motor current with analog electronics, then let an AI recognise the pattern of each fault." />
        <ol className="grid gap-4 md:grid-cols-3">
          {([
            ["Measure", "Shunt resistor, differential amplifier and active low-pass filter turn current into a clean voltage."],
            ["Digitise", "The Arduino's 10-bit ADC samples it 1000 times a second and streams it over USB."],
            ["Recognise", "Python extracts 11 features per second; a Random Forest of 100 trees votes on the condition."],
          ] as const).map(([t, d], j) => (
            <li key={t} className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <p className="text-sm tabular-nums text-muted">0{j + 1}</p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t}</h3>
              <p className="mt-2 text-base leading-relaxed text-ink-2 sm:text-lg">{d}</p>
            </li>
          ))}
        </ol>
        <p className="text-lg text-ink-2">One sensor, no contact with the shaft, parts that cost under ₹3,000.</p>
      </>
    ),
  },
  {
    title: "System overview",
    live: true,
    notes: "Walk the chain left to right, then top to bottom. Each block shows the live value at that point. The top row is the analog front-end on the breadboard; the bottom row runs on the laptop. Only ADC counts cross the USB cable.",
    Body: function Overview() {
      const { frame, hello } = useLive();
      const votes = frame?.votes ?? [];
      const top = votes.length ? Math.max(...CLASSES.map((_, j) => votes.filter((v) => v === j).length)) : NaN;
      const laptop: [string, string, ReactNode][] = [
        ["USB serial", "1000 samples/s", latest() ? `#${latest()}` : "—"],
        ["Features", "1 s window", `${hello?.features.length ?? 11} numbers`],
        ["Random Forest", `${hello?.model.trees ?? 100} trees`, `${fmt(top, 0)} votes`],
        ["Dashboard", "verdict", frame ? <span className="flex items-center gap-2"><StatusIcon c={frame.label} className="size-5" />{STATUS[frame.label].short}</span> : "—"],
      ];
      const row = (title: string, blocks: [string, string, ReactNode][]) => (
        <section>
          <h3 className="mb-2 text-sm font-medium text-ink-2">{title}</h3>
          <ol className="flex flex-col lg:flex-row lg:items-stretch">
            {blocks.map(([name, spec, value], j) => (
              <Fragment key={name}>
                {j > 0 && <li aria-hidden className="flow-r mx-auto h-5 w-1 shrink-0 self-center lg:h-1 lg:w-5" />}
                <li className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 py-3">
                  <p className="font-semibold">{name}</p>
                  <p className="text-xs text-ink-2">{spec}</p>
                  <p className="mt-1.5 text-xl font-semibold tabular-nums">{value}</p>
                </li>
              </Fragment>
            ))}
          </ol>
        </section>
      );
      return (
        <>
          <Head kicker="System overview" title="From motor to verdict" />
          {row("Analog front-end · breadboard", BLOCKS.map(([a, b, v]) => [a, b, v()]))}
          <div className="flex items-center gap-3 text-sm text-ink-2" aria-hidden>
            <span className="flow h-6 w-1" />USB cable · ADC counts only
          </div>
          {row("Laptop · Python", laptop)}
        </>
      );
    },
  },
  {
    title: "Current sensing",
    live: true,
    enter: enter("normal"),
    notes: "Ohm's law does the sensing. With 0.1 ohm, the normal 0.33 A gives about 33 mV, a tiny drop out of 12 V, so the motor does not notice the resistor. Low-side means one end is at ground, so the voltage we measure is small and ground-referenced, which a 5 V op-amp can handle.",
    Body: () => (
      <>
        <Head kicker="Stage 1 · Current sensing" title="A resistor turns current into voltage." />
        <Split>
          <div className="space-y-4">
            <Eq>V = I × R = 0.33 A × 0.1 Ω ≈ 33 mV</Eq>
            <Eq>P = I² × R = 0.33² × 0.1 ≈ 11 mW</Eq>
            <Points items={[
              "0.1 Ω is small: 33 mV out of 12 V barely disturbs the motor.",
              "Even at the 1.75 A measuring limit it dissipates only 0.31 W, well inside its 2 W rating.",
              "Low side, between motor and ground: the sense voltage is near 0 V, so a 5 V op-amp can read it. High side it would ride at 12 V.",
            ]} />
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Motor current" value={avg("i", 3)} unit="A" />
              <Stat label="Across the shunt" value={avg("vs", 1)} unit="mV" />
            </div>
            <Card title="Shunt voltage, last 3 s">
              <Scope channel="vs" unit="mV" digits={1} axis className="h-48" />
            </Card>
          </div>
        </Split>
      </>
    ),
  },
  {
    title: "Differential amplifier",
    live: true,
    enter: enter("normal"),
    notes: "33 millivolts is too small for the ADC, so half of an LM358 amplifies it twenty times. It is a differential stage: it amplifies only the difference across the shunt, so noise that appears on both wires cancels. Running from 5 V the LM358 tops out near 3.5 V, which sets our measuring limit at 1.75 A, comfortably above the 0.9 A overload.",
    Body: () => (
      <>
        <Head kicker="Stage 2 · Differential amplifier" title="Make millivolts into volts." />
        <Split>
          <div className="space-y-4">
            <Eq>G = Rf / Rin = 200 kΩ / 10 kΩ = 20 (+26 dB)</Eq>
            <Points items={[
              "LM358, half A. 33 mV in becomes about 0.66 V out.",
              "Differential: it amplifies only V+ − V− across the shunt. Noise picked up on both wires (common mode) cancels.",
              "Headroom: on a 5 V supply the output saturates near 3.5 V, so 3.5 V ÷ 20 ÷ 0.1 Ω = 1.75 A is the most we can measure.",
              "Overload peaks around 0.9 A, about 1.8 V out: safely inside.",
            ]} />
          </div>
          <div className="space-y-4">
            <Stat label="Amplifier output" value={avg("va", 3)} unit="V" sub="Gain × 20 of the shunt voltage" />
            <Card title="Amplifier output, 0 V to saturation">
              <Scope channel="va" unit="V" range={[0, 3.5]} ticks={[0, 1, 2, 3.5]} axis fill className="h-52" />
            </Card>
          </div>
        </Split>
      </>
    ),
  },
  {
    title: "Active low-pass filter",
    live: true,
    enter: enter("normal"),
    notes: "The other half of the LM358 is a unity-gain Sallen-Key low-pass. Its corner is 232 Hz with Q 0.73. It does two jobs: it knocks the 600 hertz commutator ripple down by about 16 dB, and it is the anti-aliasing filter, because we sample at 1 kHz and anything above 500 Hz would fold back into the band the AI looks at.",
    Body: function Filter() {
      const { frame } = useLive();
      const fr = rippleHz(frame?.truth.rpm || 200);
      return (
        <>
          <Head kicker="Stage 3 · Active low-pass filter" title="Keep the fault, drop the noise." />
          <Split>
            <div className="space-y-4">
              <Eq>fc = 1 / (2π R √(C1·C2)) = {FC.toFixed(0)} Hz</Eq>
              <Eq>Q = ½ √(C1 / C2) = {Q.toFixed(2)}</Eq>
              <Points items={[
                "Unity-gain Sallen-Key, 2nd order: R1 = R2 = 10 kΩ, C1 = 100 nF, C2 = 47 nF.",
                `Commutator ripple near ${fr.toFixed(0)} Hz comes out ${(-db(fr)).toFixed(1)} dB down.`,
                "Anti-aliasing: sampling at 1 kHz means nothing above the 500 Hz Nyquist limit may reach the ADC.",
              ]} />
            </div>
            <Card title="Magnitude response" meta={`fc ${FC.toFixed(0)} Hz · Q ${Q.toFixed(2)}`}><Bode /></Card>
          </Split>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card title="Before: amplifier output" meta={`${avg("va", 3)} V`}><Scope channel="va" unit="V" seconds={0.5} className="h-28" /></Card>
            <Card title="After: filter output" meta={`${avg("vf", 3)} V`}><Scope channel="vf" unit="V" seconds={0.5} className="h-28" /></Card>
          </div>
        </>
      );
    },
  },
  {
    title: "Digitisation",
    live: true,
    enter: enter("normal"),
    notes: "The Arduino's 10-bit ADC splits 0 to 5 V into 1024 levels, so one step is 4.89 mV, which works back to 2.44 milliamps of motor current. We sample at 1 kHz and send every count over USB serial; Python converts counts back to amps with the formula shown.",
    Body: function Digitise() {
      useLive();
      const head = latest();
      return (
        <>
          <Head kicker="Stage 4 · Digitisation" title="1000 numbers a second." />
          <Split>
            <div className="space-y-4">
              <Eq>LSB = 5 V / 1023 ≈ 4.89 mV ≈ 2.44 mA</Eq>
              <Eq>I = N × 5 / 1023 ÷ (20 × 0.1 Ω)</Eq>
              <Points items={[
                "Arduino Uno, pin A0: 10-bit ADC, 0–5 V reference.",
                "One count is 4.89 mV at the pin, 2.44 mA of motor current.",
                "Sampled at 1 kHz, so frequencies up to 500 Hz (Nyquist) are captured.",
                "Every count goes to the laptop over USB serial.",
              ]} />
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-[1fr_auto] gap-4">
                <Stat label="ADC reading (A0)" value={avg("adc", 0)} unit="/ 1023" />
                <ol className="rounded-2xl border border-line bg-surface px-4 py-3 font-mono text-sm leading-6" aria-label="Latest ADC counts">
                  {head > 0 ? Array.from({ length: 5 }, (_, j) => head - 5 + j).map((k) => (
                    <li key={k} className="flex justify-between gap-4"><span className="text-muted">#{k % 10000}</span><span>{sample("adc", k)}</span></li>
                  )) : <li className="text-ink-2">—</li>}
                </ol>
              </div>
              <Card title="ADC counts, last 3 s"><Scope channel="adc" unit="" digits={0} axis className="h-44" /></Card>
            </div>
          </Split>
        </>
      );
    },
  },
  {
    title: "Full schematic",
    live: true,
    notes: "This is the whole analog front-end as wired on the breadboard: the 12 V motor loop with the low-side shunt, one LM358 package with the differential amplifier and the Sallen-Key filter, and the Arduino. Hover or tap any part to show its value and role. The moving dots follow the measured current.",
    Body: () => (
      <>
        <Head kicker="The circuit" title="The whole front-end" lede="One LM358 package, a handful of resistors and capacitors, and an Arduino. Hover or tap a part for its value." />
        <div data-noswipe><Card><Schematic /></Card></div>
      </>
    ),
  },
  conditionSlide("normal", 1),
  conditionSlide("overload", 2),
  conditionSlide("friction", 3),
  {
    title: "Feature extraction",
    live: true,
    notes: "The model never sees raw samples. Every 50 milliseconds Python takes the last one second, 1000 samples, and reduces it to eleven numbers: seven from the time domain and four from the FFT. Those eleven numbers are what separate the three conditions.",
    Body: () => (
      <>
        <Head kicker="Signal processing" title="1000 samples in, 11 numbers out."
          lede="Each 1 s window of current (1000 samples, updated every 50 ms) becomes a feature vector." />
        <Split>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Card title="Time domain"><FeatureList keys={KEYS.filter((k) => FEATURES[k].domain === "Time")} /></Card>
            <Card title="Frequency domain (FFT)"><FeatureList keys={KEYS.filter((k) => FEATURES[k].domain === "Frequency")} /></Card>
          </div>
          <Card title="Spectrum of the current window, 0–40 Hz"><Spectrum className="h-64 sm:h-80" /></Card>
        </Split>
      </>
    ),
  },
  {
    title: "Random Forest",
    live: true,
    notes: "A Random Forest is a hundred decision trees, each trained on a random sample of windows and features. Each tree votes, and the share of votes is the probability you see. We chose it because it works with a small dataset, trains in seconds, runs fast on a laptop, and tells us which features matter.",
    Body: function Forest() {
      const { frame, hello } = useLive();
      return (
        <>
          <Head kicker="The AI" title={`${hello?.model.trees ?? 100} trees, one vote each.`} />
          <Split>
            <div className="space-y-6">
              <Points items={[
                "Each decision tree learns simple rules on the 11 features, from a random subset of the data.",
                "Every 50 ms all trees vote. P(class) = votes ÷ trees.",
                "Why a Random Forest: works with little data, trains in seconds, fast on a laptop, resists noisy features, and is explainable through feature importance.",
              ]} />
              <Card><Verdict /></Card>
            </div>
            <Card title="Live votes" meta={frame ? `${frame.votes.length} trees` : undefined}>
              <Votes />
              <div className="mt-5"><Probabilities probs={frame?.probs ?? [0, 0, 0]} /></div>
            </Card>
          </Split>
        </>
      );
    },
  },
  {
    title: "Results",
    live: true,
    notes: "On held-out simulated windows the model scores what you see, with a clean confusion matrix. Be upfront: this is simulated data, so the number is optimistic. Real motors are noisier. The feature importance agrees with the physics: mean and RMS for overload, crest factor, kurtosis and the low band for friction.",
    Body: function Results() {
      const { hello } = useLive();
      const m = hello?.model;
      const imp = m && hello ? hello.features.map((k, j) => [k, m.importance[j]] as const).sort((a, b) => b[1] - a[1]).slice(0, 6) : [];
      const max = imp[0]?.[1] ?? 1;
      return (
        <>
          <Head kicker="Results" title="How well does it work?" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="flex flex-col">
              <p className="text-sm text-ink-2">Held-out accuracy</p>
              <p className="mt-1 text-6xl font-semibold tracking-tight tabular-nums">{m ? (m.accuracy * 100).toFixed(1) : "—"}%</p>
              {m && <p className="mt-2 text-sm text-ink-2">{m.n_test} test windows · {m.n_train} training windows</p>}
              <p className="mt-auto pt-4 text-sm leading-relaxed text-ink-2">
                <b className="font-semibold text-ink">Optimistic:</b> trained and tested on simulated data. Real motors are noisier; the
                real figure comes after recording and retraining on the built circuit.
              </p>
            </Card>
            <Card title="Confusion matrix · rows = true class">
              {m ? (
                <table className="w-full table-fixed border-separate border-spacing-1 text-base">
                  <thead>
                    <tr><th />{CLASSES.map((k) => <th key={k} className="pb-1 text-xs font-normal text-ink-2">{STATUS[k].short}</th>)}</tr>
                  </thead>
                  <tbody>
                    {m.confusion.map((row, r) => {
                      const total = row.reduce((a, b) => a + b, 0) || 1;
                      return (
                        <tr key={r}>
                          <th className="text-left text-xs font-normal text-ink-2">{STATUS[CLASSES[r]].short}</th>
                          {row.map((v, j) => {
                            const pct = (v / total) * 100;
                            return (
                              <td key={j} className={`h-14 rounded-md text-center tabular-nums ${pct > 55 ? "text-white" : "text-ink"}`}
                                style={{ background: `color-mix(in oklab, var(--series) ${Math.max(pct, 4)}%, var(--surface-2))` }}>{v}</td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <p className="text-ink-2">Needs the backend.</p>}
            </Card>
            <Card title="Most important features">
              <ul className="space-y-2.5">
                {imp.map(([k, v]) => (
                  <li key={k} className="grid grid-cols-[8.5rem_1fr] items-center gap-3 text-sm">
                    <span className="truncate text-ink-2">{FEATURES[k]?.label ?? k}</span>
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 rounded-r bg-series" style={{ width: `${(v / max) * 70}%` }} />
                      <span className="tabular-nums">{v.toFixed(2)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      );
    },
  },
  {
    title: "Live demo",
    live: true,
    notes: "Hand over to the live demo. Press 2 for overload and 3 for friction, square brackets change severity, 1 goes back to normal, D runs the automatic demo. Watch the verdict change within a second, and the timeline compare the AI's answer with what was actually set.",
    Body: () => (
      <>
        <Head kicker="Live demo" title="Break it on purpose." />
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-4">
            <Card><Verdict big /></Card>
            <Card title="Motor current" meta={`${avg("i", 3)} A`}>
              <Scope channel="i" unit="A" range={[0, 1.2]} ticks={[0, 0.4, 0.8, 1.2]} axis fill className="h-40" />
            </Card>
            <Card title="AI vs actual, last 60 s"><Timeline /></Card>
          </div>
          <Card title="Inject a fault"><Controls /></Card>
        </div>
      </>
    ),
  },
  {
    title: "Hardware & cost",
    notes: "Everything is off-the-shelf from a local electronics shop. The single most expensive parts are the Arduino and the 12 V adapter; the analog front-end itself is a few rupees of resistors, capacitors and one LM358. The total stays under three thousand rupees.",
    Body: () => (
      <>
        <Head kicker="Hardware" title={<>Under ₹3,000 of parts.</>} />
        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <Card>
            <ul className="grid gap-x-8 text-sm sm:grid-cols-2 sm:text-base">
              {BOM.map((b) => (
                <li key={b.item} className="flex items-baseline justify-between gap-3 border-b border-line py-2">
                  <span>{b.item}{b.qty && <span className="text-ink-2"> ×{b.qty}</span>}</span>
                  <span className="shrink-0 tabular-nums text-ink-2">{rupees(b.price)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <div className="space-y-4">
            <Stat label="Total" value={rupees(TOTAL)} sub={`${BOM.length} line items, local shop prices`} />
            <p className="text-base leading-relaxed text-ink-2">
              The analog front-end itself is one LM358, a 0.1 Ω shunt and a few resistors and capacitors. Most of the cost is the
              Arduino, the motor and its supply.
            </p>
          </div>
        </div>
      </>
    ),
  },
  {
    title: "Scaling up to industry",
    notes: "The same idea scales. In a factory the motor is a 1.5 kW induction motor and the laptop becomes an embedded microcontroller watching four sensors with real-time firmware. The industry section of this site, built on Vigil by Sidhant, simulates exactly that. Our project is the minimum version of the same pipeline.",
    Body: () => (
      <>
        <Head kicker="Extension" title="Scaling up to industry"
          lede="The same idea, sensing a motor's signals and recognising faults, on a 1.5 kW industrial induction motor with an embedded MCU." />
        <div data-noswipe><Card className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm sm:text-base">
            <thead className="text-ink-2">
              <tr className="border-b border-line"><th className="py-2 pr-4 font-normal" /><th className="py-2 pr-4 font-medium">This project</th><th className="py-2 font-medium">Industrial version</th></tr>
            </thead>
            <tbody>
              {[
                ["Motor", "12 V geared DC", "1.5 kW induction motor"],
                ["Sensors", "Current (one shunt)", "Vibration, temperature, current, speed"],
                ["Processing", "Arduino ADC → laptop, Python", "MCU: ADC + DMA, RTOS firmware, DSP"],
                ["Detection", "Random Forest, 100 trees", "Rule-based classifier + forecasting"],
                ["Output", "Web dashboard", "Control room, Modbus to the plant"],
              ].map(([k, a, b]) => (
                <tr key={k} className="border-b border-line last:border-0">
                  <th className="py-2.5 pr-4 font-normal text-ink-2">{k}</th><td className="py-2.5 pr-4">{a}</td><td className="py-2.5">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card></div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/industry" className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-series">Open the industry extension</Link>
          <Link href="/industry/control-room" className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium hover:bg-surface-2">Control room</Link>
          <Link href="/industry/firmware" className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium hover:bg-surface-2">Firmware</Link>
          <span className="text-sm text-ink-2">Industry extension based on Vigil, by Sidhant.</span>
        </div>
      </>
    ),
  },
  {
    title: "Conclusion & future work",
    notes: "Summarise: analog electronics made the current measurable and clean, and a simple model separated the three conditions. Then be honest about what is next: building the real circuit, recording real data and retraining, more fault types, running the model on the microcontroller itself, and a Hall-effect sensor for isolation.",
    Body: () => (
      <>
        <Head kicker="Conclusion" title="What we showed, and what comes next" />
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="We showed">
            <Points items={[
              "A shunt, a ×20 differential amp and a 232 Hz Sallen-Key filter make motor current clean and measurable.",
              "Eleven features over a 1 s window separate normal, overload and friction.",
              "A 100-tree Random Forest classifies them live, in simulation.",
            ]} />
          </Card>
          <Card title="Future work">
            <Points items={[
              "Build the real circuit and record real motor data.",
              "Retrain on the recordings and report real accuracy.",
              "More fault classes: bearing wear, misalignment, supply faults.",
              "On-device inference (TinyML) so no laptop is needed.",
              "Hall-effect current sensor for galvanic isolation.",
            ]} />
          </Card>
        </div>
      </>
    ),
  },
  {
    title: "Thank you",
    enter: enter("normal"),
    notes: "Thank the examiners and your guide, then invite questions. Keep the deck on this slide: the live status stays visible, and you can jump back to any slide with the arrow keys or Home and End.",
    Body: function Thanks() {
      const { live, frame } = useLive();
      return (
        <div className="space-y-8 text-center">
          <h2 className="text-6xl font-semibold tracking-tight sm:text-8xl">Thank you</h2>
          <p className="text-2xl text-ink-2 sm:text-3xl">Questions?</p>
          <p className="text-base text-ink-2 sm:text-lg">{DECK.presenter} · {DECK.guide} · {DECK.institute}</p>
          {live && frame && <div className="flex justify-center"><Verdict /></div>}
        </div>
      );
    },
  },
];
