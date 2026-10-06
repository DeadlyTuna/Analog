"use client";
import dynamic from "next/dynamic";
import { type ReactNode, useState, useSyncExternalStore } from "react";
import { BOM, PARTS, type PartId, TOTAL, reading, rupees } from "@/components/lab/parts";
import { Controls, OfflineNotice, STATUS, StatusIcon } from "@/components/ui";
import { recentMean, useTelemetry } from "@/lib/telemetry";

const Bench = dynamic(() => import("@/components/lab/scene"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <p className="flex items-center gap-3 text-sm text-ink-2">
        <span className="size-2 rounded-full bg-series motion-safe:animate-ping" />
        Loading the 3D bench…
      </p>
    </div>
  ),
});

const QUERY = "(prefers-reduced-motion: reduce)";
const useReducedMotion = () =>
  useSyncExternalStore(
    (cb) => {
      const q = matchMedia(QUERY);
      q.addEventListener("change", cb);
      return () => q.removeEventListener("change", cb);
    },
    () => matchMedia(QUERY).matches,
    () => false,
  );

const glass = "rounded-2xl border border-line bg-surface/80 backdrop-blur-md";
const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : "—");

function Toggle({ on, set, children }: { on: boolean; set: (on: boolean) => void; children: ReactNode }) {
  return (
    <button aria-pressed={on} onClick={() => set(!on)}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:text-ink aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-sm aria-pressed:ring-1 aria-pressed:ring-line">
      <span className={`size-1.5 rounded-full transition-colors ${on ? "bg-series" : "bg-muted"}`} />
      {children}
    </button>
  );
}

function LiveStatus() {
  const { frame } = useTelemetry();
  const label = frame?.label ?? "normal";
  const stats: [string, string, string][] = [
    ["Confidence", fmt(frame ? Math.max(...frame.probs) * 100 : NaN, 1), "%"],
    ["Current", fmt(frame ? recentMean("i", 100) : NaN, 3), "A"],
    ["Shaft", fmt(frame ? frame.truth.rpm : NaN, 0), "RPM"],
  ];
  return (
    <section className={`${glass} p-5`}>
      <p className="text-xs text-ink-2">AI prediction · live</p>
      <div key={frame ? label : "none"} className="rise mt-2 flex items-center gap-3">
        {frame ? <StatusIcon c={label} className="size-9" /> : <span className="size-9 rounded-full bg-surface-2" />}
        <h1 className="text-2xl font-semibold tracking-tight">{frame ? STATUS[label].label : "Waiting…"}</h1>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-line">
        {stats.map(([k, v, u]) => (
          <div key={k} className="bg-surface px-3 py-2.5">
            <dt className="text-[11px] text-ink-2">{k}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {v}
              <span className="ml-0.5 text-[11px] font-normal text-ink-2">{u}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Details({ id, onBack }: { id: PartId; onBack: () => void }) {
  useTelemetry(); // live reading
  const p = PARTS[id];
  const rows = BOM.filter((b) => b.part === id);
  return (
    <div key={id} className="rise p-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-ink-2 transition-colors hover:text-ink">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 18l-6-6 6-6" />
        </svg>
        All parts
      </button>
      <h2 className="mt-3 text-lg font-semibold tracking-tight">{p.name}</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-2">{p.spec}</p>
      <div className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5">
        <p className="text-[11px] text-ink-2">Live reading</p>
        <p className="mt-0.5 font-medium tabular-nums">{reading(id)}</p>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-ink-2">{p.role}</p>
      <h3 className="mt-5 text-xs font-medium text-ink-2">Bill of materials</h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {rows.map((b) => (
          <li key={b.item} className="flex justify-between gap-3">
            <span>{b.item}{b.qty && <span className="text-ink-2"> ×{b.qty}</span>}</span>
            <span className="shrink-0 tabular-nums">{rupees(b.price)}</span>
          </li>
        ))}
        {!rows.length && <li className="text-ink-2">Not bought for the project: any laptop that runs Python works.</li>}
      </ul>
    </div>
  );
}

function PartsList({ onHover, onSelect }: { onHover: (id: PartId | null) => void; onSelect: (id: PartId) => void }) {
  const row = "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm";
  const items: { item: string; qty?: number; price?: [number, number]; part?: PartId }[] = [...BOM, { item: "Laptop running Python", part: "laptop" }];
  return (
    <div className="p-5">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-ink-2">Bill of materials</h2>
        <span className="text-sm font-semibold tabular-nums">{rupees(TOTAL)}</span>
      </header>
      <p className="mt-1 text-xs text-ink-2">India prices. Parts marked in the model fly the camera to them.</p>
      <ul className="-mx-2 mt-3">
        {items.map((b) => {
          const body = (
            <>
              <span className={`size-1.5 shrink-0 rounded-full ${b.part ? "bg-series" : "bg-transparent"}`} />
              <span className="min-w-0 flex-1">
                {b.item}
                {b.qty && <span className="text-ink-2"> ×{b.qty}</span>}
              </span>
              <span className="shrink-0 tabular-nums text-ink-2">{b.price ? rupees(b.price) : "owned"}</span>
            </>
          );
          return (
            <li key={b.item}>
              {b.part ? (
                <button className={`${row} transition-colors hover:bg-surface-2`} onClick={() => onSelect(b.part!)}
                  onMouseEnter={() => onHover(b.part!)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(b.part!)} onBlur={() => onHover(null)}>
                  {body}
                </button>
              ) : (
                <div className={row}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Lab() {
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState<PartId | null>(null);
  const [hovered, setHovered] = useState<PartId | null>(null);
  const [home, setHome] = useState(0);
  const [rot, setRot] = useState<boolean | null>(null);
  const [flw, setFlw] = useState<boolean | null>(null);
  const [labels, setLabels] = useState(true);
  const rotate = rot ?? !reduced, flow = flw ?? !reduced;
  const reset = () => {
    setSelected(null);
    setHome((h) => h + 1);
  };

  return (
    <main className="relative flex-1 lg:h-[calc(100dvh-3.5rem)] lg:flex-none lg:overflow-hidden">
      <div className="relative isolate h-[60vh] min-h-80 overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,var(--surface)_0%,var(--page)_70%)] lg:absolute lg:inset-0 lg:h-auto">
        <Bench selected={selected} hovered={hovered} onHover={setHovered} onSelect={setSelected}
          rotate={rotate} flow={flow} labels={labels} home={home} reduced={reduced} />
        <p className="pointer-events-none absolute inset-x-0 top-3 hidden text-center text-xs text-ink-2 sm:block">
          Drag to orbit · scroll to zoom · click any part
        </p>
        <div className={`${glass} absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-0.5 p-1`}>
          <Toggle on={rotate} set={setRot}>Rotate</Toggle>
          <Toggle on={flow} set={setFlw}>Signal flow</Toggle>
          <Toggle on={labels} set={setLabels}>Labels</Toggle>
          <button onClick={reset} className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:text-ink">
            Reset view
          </button>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:pointer-events-none lg:absolute lg:inset-0 lg:grid-cols-[19rem_1fr_20rem] lg:items-start">
        <div className="grid gap-4 lg:pointer-events-auto lg:col-start-3 lg:row-start-1 lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto">
          <OfflineNotice />
          <LiveStatus />
          <section className={`${glass} p-5`}>
            <h2 className="mb-4 text-sm font-medium text-ink-2">Inject a fault</h2>
            <Controls />
          </section>
        </div>
        <aside className={`${glass} lg:pointer-events-auto lg:col-start-1 lg:row-start-1 lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto`}>
          {selected ? <Details id={selected} onBack={reset} /> : <PartsList onHover={setHovered} onSelect={setSelected} />}
        </aside>
      </div>
    </main>
  );
}
