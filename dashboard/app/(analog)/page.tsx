"use client";
import { Scope, Spectrum, Timeline } from "@/components/charts";
import { AnimatedNumber, Card, Controls, OfflineNotice, Probabilities, STATUS, StatusIcon, Toasts } from "@/components/ui";
import { history, HISTORY, historyCount, useTelemetry } from "@/lib/telemetry";

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : "—");

/** Share of the recorded frames where the AI's verdict matched the simulated condition. */
function agreement() {
  const n = historyCount(), j0 = Math.max(0, n - HISTORY);
  let m = 0;
  for (let j = j0; j < n; j++) if (history.pred[j % HISTORY] === history.truth[j % HISTORY]) m++;
  return n ? (m / (n - j0)) * 100 : NaN;
}

export default function Dashboard() {
  const { frame, hello, log } = useTelemetry();
  const f = (name: string) => (frame && hello ? frame.feat[hello.features.indexOf(name)] : NaN);
  const label = frame?.label ?? "normal";
  const probs = frame?.probs ?? [0, 0, 0];
  const st = STATUS[label];
  const fault = !!frame && label !== "normal";

  const stats: [string, number, number, string][] = [
    ["RMS current", f("rms"), 3, "A"],
    ["Peak current", f("peak"), 3, "A"],
    ["Std deviation", f("std") * 1e3, 1, "mA"],
    ["Crest factor", f("crest"), 2, ""],
    ["Kurtosis", f("kurtosis"), 2, ""],
    ["Dominant freq", f("dom_freq"), 2, "Hz"],
  ];

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-12">
      <Toasts />
      <OfflineNotice className="lg:col-span-12" />

      <div className="grid min-w-0 content-start gap-4 lg:col-span-8">
        <section className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-ink/20 sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -left-24 -top-32 size-96 rounded-full opacity-20 blur-3xl transition-colors duration-700"
            style={{ background: frame ? st.color : "transparent" }} />
          <div className="relative grid gap-8 sm:grid-cols-[1fr_17rem] sm:items-center">
            <div>
              <p className="text-sm text-ink-2">Motor status · AI prediction</p>
              <div key={label} className="rise mt-3 flex items-center gap-4">
                <span className="relative grid shrink-0">
                  {fault && <span aria-hidden className="pulse-ring absolute inset-0 rounded-full" style={{ color: st.color }} />}
                  <StatusIcon c={label} className="pop size-12" />
                </span>
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{frame ? st.label : "Waiting…"}</h1>
              </div>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-2">{frame ? st.hint : "No data from the Arduino yet."}</p>
            </div>
            <div>
              <div className="mb-4 flex items-baseline justify-between">
                <span className="text-sm text-ink-2">Confidence</span>
                <span className="text-2xl font-semibold"><AnimatedNumber value={Math.max(...probs) * 100} digits={1} />%</span>
              </div>
              <Probabilities probs={probs} />
            </div>
          </div>
        </section>

        <Card title="Prediction timeline · last 60 s"
          meta={<>AI matched <AnimatedNumber value={agreement()} />% <span className="text-ink-2">of the time</span></>}>
          <Timeline />
        </Card>

        <Card title="Motor current" meta={<>{fmt(f("mean"), 3)} A <span className="text-ink-2">· 1 s avg</span></>}>
          <Scope channel="i" range={[0, 1.2]} ticks={[0, 0.4, 0.8, 1.2]} unit="A" axis fill className="h-64" />
        </Card>

        <Card title="Frequency spectrum · 1 s window" meta={<>peak {fmt(f("dom_freq"), 2)} Hz</>}>
          <Spectrum className="h-48" />
        </Card>
      </div>

      <div className="grid min-w-0 content-start gap-4 lg:col-span-4">
        <Card title="Fault simulation">
          <Controls />
        </Card>

        <Card title="Signal features">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line">
            {stats.map(([k, v, d, u]) => (
              <div key={k} className="bg-surface p-3">
                <dt className="text-xs text-ink-2">{k}</dt>
                <dd className="mt-1 text-lg font-semibold">
                  <AnimatedNumber value={v} digits={d} />
                  {u && <span className="ml-1 text-xs font-normal text-ink-2">{u}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Event log" meta={<span className="text-ink-2">{log.length} changes</span>}>
          <ol className="-my-2 max-h-72 divide-y divide-line overflow-y-auto">
            {log.map((e) => (
              <li key={e.at} className="rise flex items-center gap-3 py-2.5 text-sm">
                <StatusIcon c={e.label} className="size-5" />
                <span>{STATUS[e.label].label}</span>
                <span className="ml-auto text-xs tabular-nums text-ink-2">
                  {new Date(e.at).toLocaleTimeString([], { hour12: false })} · {(e.confidence * 100).toFixed(0)}%
                </span>
              </li>
            ))}
            {!log.length && <li className="py-2.5 text-sm text-ink-2">No events yet.</li>}
          </ol>
        </Card>
      </div>
    </main>
  );
}
