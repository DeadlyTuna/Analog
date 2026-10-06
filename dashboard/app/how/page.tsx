"use client";
import { Fragment, type ReactNode } from "react";
import { Bode, FC, Q } from "@/components/Bode";
import { Scope } from "@/components/charts";
import { Schematic } from "@/components/Schematic";
import { Card, Controls, OfflineNotice, Probabilities, STATUS, StatusIcon } from "@/components/ui";
import { CLASSES, type Channel, latest, recentMean, sample, useTelemetry } from "@/lib/telemetry";

const FEATURE_LABEL: Record<string, string> = {
  mean: "Mean current", rms: "RMS", std: "Std deviation", peak: "Peak", p2p: "Peak-to-peak",
  crest: "Crest factor", kurtosis: "Kurtosis", dom_freq: "Dominant freq", dom_amp: "Dominant amplitude",
  band_0_5: "Energy 0.5–5 Hz", band_5_50: "Energy 5–50 Hz",
};

function Stage({ n, title, spec, value, formula, note, children }: {
  n: number; title: string; spec: string; value: ReactNode; formula: string; note: string; children: ReactNode;
}) {
  return (
    <article className="flex min-w-0 flex-1 flex-col rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-ink-2">
        <span className="tabular-nums text-muted">{String(n).padStart(2, "0")}</span>
        <span className="truncate">{spec}</span>
      </div>
      <h3 className="mt-1 font-medium">{title}</h3>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-3 flex-1">{children}</div>
      <p className="mt-3 font-mono text-[11px] text-ink">{formula}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-2">{note}</p>
    </article>
  );
}

function Row({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode[] }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-ink-2">{subtitle}</p>
      </div>
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        {children.map((c, j) => (
          <Fragment key={j}>
            {j > 0 && <div aria-hidden className="flow-r mx-auto h-6 w-1 shrink-0 self-center lg:h-1 lg:w-6" />}
            {c}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

const avg = (c: Channel, d: number) => {
  const v = recentMean(c, 100);
  return Number.isFinite(v) ? v.toFixed(d) : "—";
};

export default function HowItWorks() {
  const { frame, hello } = useTelemetry();
  const c = hello?.circuit;
  const f = (name: string) => (frame && hello ? frame.feat[hello.features.indexOf(name)] : NaN);
  const votes = frame?.votes ?? [];
  const counts = CLASSES.map((_, j) => votes.filter((v) => v === j).length);
  const label = frame?.label ?? "normal";
  const head = latest();
  const amps = c ? `${(c.vref / c.adc_max / c.gain / c.r_shunt * 1e3).toFixed(2)} mA per count` : "";

  const hardware = [
    <Stage key="m" n={1} title="DC motor" spec="12 V geared · 200 RPM" value={<>{avg("i", 3)}<small className="ml-1 text-sm font-normal text-ink-2">A</small></>}
      formula="I = I₀ + k·τload" note="Load and friction change how much current it draws.">
      <Scope channel="i" unit="A" seconds={1.5} />
    </Stage>,
    <Stage key="s" n={2} title="Shunt resistor" spec={`${c?.r_shunt ?? 0.1} Ω · 2 W`} value={<>{avg("vs", 1)}<small className="ml-1 text-sm font-normal text-ink-2">mV</small></>}
      formula="V = I · R" note="Turns the current into a tiny voltage.">
      <Scope channel="vs" unit="mV" digits={1} seconds={1.5} />
    </Stage>,
    <Stage key="a" n={3} title="Differential amp" spec={`LM358 · gain ×${c?.gain ?? 20}`} value={<>{avg("va", 3)}<small className="ml-1 text-sm font-normal text-ink-2">V</small></>}
      formula="V = (Rf / Rin) · ΔV" note="Lifts millivolts to volts. Noise and brush spikes come along too.">
      <Scope channel="va" unit="V" seconds={1.5} />
    </Stage>,
    <Stage key="f" n={4} title="Sallen-Key low-pass" spec={`2nd order · fc ${c ? c.fc.toFixed(0) : 232} Hz`} value={<>{avg("vf", 3)}<small className="ml-1 text-sm font-normal text-ink-2">V</small></>}
      formula="fc = 1 / 2πR√(C₁C₂)" note="Removes commutator ripple and noise before sampling (anti-aliasing).">
      <Scope channel="vf" unit="V" seconds={1.5} />
    </Stage>,
    <Stage key="d" n={5} title="Arduino ADC" spec={`10-bit · ${c?.fs ?? 1000} Hz`} value={avg("adc", 0)}
      formula="N = V / 5 V × 1023" note="Digitises the clean voltage into counts.">
      <Scope channel="adc" unit="" digits={0} seconds={1.5} />
    </Stage>,
  ];

  const laptop = [
    <Stage key="u" n={6} title="Serial in" spec="115200 baud" value={head ? sample("adc", head - 1) : "—"}
      formula="I = N × 5 / 1023 ÷ (G · R)" note={`Python converts counts back to amps (${amps}).`}>
      <ol className="overflow-hidden rounded-lg bg-surface-2 px-3 py-2 font-mono text-[11px] leading-[1.35rem] text-ink-2">
        {head > 0 && Array.from({ length: 5 }, (_, j) => head - 5 + j).map((k) => (
          <li key={k} className="flex justify-between"><span className="text-muted">#{k}</span><span className="text-ink">{sample("adc", k)}</span></li>
        ))}
      </ol>
    </Stage>,
    <Stage key="x" n={7} title="Feature extraction" spec="1 s window · FFT" value={<>{hello?.features.length ?? 11}<small className="ml-1 text-sm font-normal text-ink-2">features</small></>}
      formula="RMS = √(Σ xᵢ² / N)" note="Time-domain stats plus FFT band energies.">
      <dl className="grid h-28 grid-cols-2 content-start gap-x-3 gap-y-1 text-xs">
        {["rms", "std", "crest", "kurtosis", "dom_freq", "band_5_50"].map((k) => (
          <Fragment key={k}>
            <dt className="truncate text-ink-2">{FEATURE_LABEL[k]}</dt>
            <dd className="text-right tabular-nums">{Number.isFinite(f(k)) ? f(k).toFixed(3) : "—"}</dd>
          </Fragment>
        ))}
      </dl>
    </Stage>,
    <Stage key="r" n={8} title="Random Forest" spec={`${hello?.model.trees ?? 100} decision trees`}
      value={<>{Math.max(...counts)}<small className="ml-1 text-sm font-normal text-ink-2">/ {votes.length || 100} votes</small></>}
      formula="P(class) = votes / trees" note="Every tree votes on the features. The forest averages them.">
      <div className="mx-auto grid w-32 grid-cols-10 gap-[3px]">
        {(votes.length ? votes : Array(100).fill(-1)).map((v: number, j: number) => (
          <span key={j} className="aspect-square rounded-full bg-surface-2 transition-colors duration-300"
            style={v >= 0 ? { background: STATUS[CLASSES[v]].color } : undefined} />
        ))}
      </div>
    </Stage>,
    <Stage key="v" n={9} title="Verdict" spec="smoothed over ~200 ms"
      value={<span key={label} className="rise flex items-center gap-2"><StatusIcon c={label} className="size-6" />{frame ? STATUS[label].label : "—"}</span>}
      formula="label = argmax P(class)" note="Shown on the dashboard with its confidence.">
      <Probabilities probs={frame?.probs ?? [0, 0, 0]} />
    </Stage>,
  ];

  const m = hello?.model;
  const importance = m && hello
    ? hello.features.map((k, j) => [k, m.importance[j]] as const).sort((a, b) => b[1] - a[1])
    : [];
  const maxImp = importance[0]?.[1] ?? 1;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6">
      <OfflineNotice />
      <header className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">How the detector works</h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-ink-2">
            Every stage below is live. Change the motor&apos;s condition and watch the signal travel through the analog
            front-end, get digitised by the Arduino, turned into features, and voted on by {m?.trees ?? 100} decision trees.
          </p>
        </div>
        <Card><Controls /></Card>
      </header>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
          <h2 className="font-semibold">The circuit</h2>
          <p className="text-sm text-ink-2">Analog front-end as built on the breadboard, with live probes</p>
        </div>
        <Card><Schematic /></Card>
      </section>

      <Row title="Hardware" subtitle="Analog front-end on the breadboard">{hardware}</Row>

      <div className="flex flex-col items-center" aria-hidden>
        <div className="flow h-8 w-1" />
        <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2">USB serial · one ADC count per sample</span>
        <div className="flow h-8 w-1" />
      </div>

      <Row title="Laptop" subtitle="Python signal processing and AI">{laptop}</Row>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card title="Filter response" meta={`fc ${FC.toFixed(0)} Hz · Q ${Q.toFixed(2)}`} className="lg:col-span-2">
          <Bode />
        </Card>

        <Card title="Held-out accuracy" className="flex flex-col">
          <p className="text-5xl font-semibold tracking-tight">{m ? (m.accuracy * 100).toFixed(1) : "—"}%</p>
          {m && <p className="mt-2 text-sm text-ink-2">{m.n_test} test windows · {m.n_train} training windows</p>}
          <p className="mt-auto pt-4 text-xs leading-relaxed text-ink-2">
            Trained on simulator data, so this is optimistic. Record real motor windows and retrain with{" "}
            <code className="rounded bg-surface-2 px-1 font-mono">python train.py</code> once the circuit is built.
          </p>
        </Card>

        <Card title="Confusion matrix · rows = true class">
          {m && (
            <table className="w-full table-fixed border-separate border-spacing-0.5 text-sm">
              <thead>
                <tr>
                  <th />
                  {CLASSES.map((k) => <th key={k} className="pb-1 text-xs font-normal text-ink-2">{STATUS[k].short}</th>)}
                </tr>
              </thead>
              <tbody>
                {m.confusion.map((row, r) => {
                  const total = row.reduce((a, b) => a + b, 0) || 1;
                  return (
                    <tr key={r}>
                      <th className="pr-2 text-left text-xs font-normal text-ink-2">{STATUS[CLASSES[r]].short}</th>
                      {row.map((v, j) => {
                        const pct = (v / total) * 100;
                        return (
                          <td key={j} title={`true ${CLASSES[r]}, predicted ${CLASSES[j]}: ${v}`}
                            className={`h-12 rounded-md text-center tabular-nums ${pct > 55 ? "text-white" : "text-ink"}`}
                            style={{ background: `color-mix(in oklab, var(--series) ${Math.max(pct, 4)}%, var(--surface-2))` }}>
                            {v}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Feature importance" className="lg:col-span-2">
          <ul className="space-y-2">
            {importance.map(([k, v]) => (
              <li key={k} className="grid grid-cols-[7.5rem_1fr] items-center gap-3 text-xs" title={`${FEATURE_LABEL[k]}: ${v.toFixed(3)}`}>
                <span className="truncate text-ink-2">{FEATURE_LABEL[k] ?? k}</span>
                <span className="flex items-center gap-2">
                  <span className="h-2 rounded-r bg-series" style={{ width: `${(v / maxImp) * 80}%` }} />
                  <span className="tabular-nums">{v.toFixed(3)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </main>
  );
}
