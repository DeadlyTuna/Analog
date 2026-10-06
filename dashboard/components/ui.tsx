"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CLASSES, type ClassName, command, DEMO, demoProgress, type LogEntry, startDemo, stopDemo, useTelemetry,
} from "@/lib/telemetry";

export const STATUS: Record<ClassName, { label: string; short: string; color: string; onColor: string; hint: string }> = {
  normal: {
    label: "Normal", short: "Normal", color: "var(--good)", onColor: "#fff",
    hint: "Current level and spectrum match a healthy, free-running motor.",
  },
  overload: {
    label: "Overload", short: "Overload", color: "var(--warning)", onColor: "#0b0b0b",
    hint: "Sustained high current: the motor is driving more torque than it should.",
  },
  friction: {
    label: "Mechanical fault", short: "Friction", color: "var(--critical)", onColor: "#fff",
    hint: "Periodic current spikes once per revolution: something is rubbing or binding on the shaft.",
  },
};

export function StatusIcon({ c, className = "size-5" }: { c: ClassName; className?: string }) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full transition-colors duration-500 ${className}`}
      style={{ background: STATUS[c].color, color: STATUS[c].onColor }}
    >
      <svg viewBox="0 0 24 24" className="size-[58%]" fill="none" stroke="currentColor" strokeWidth={3}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {c === "normal" ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : c === "overload" ? <path d="M12 5.5v8M12 18.5h.01" /> : <path d="M7 7l10 10M17 7L7 17" />}
      </svg>
    </span>
  );
}

export function Card({ title, meta, children, className = "" }: { title?: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-ink/20 ${className}`}>
      {title && (
        <header className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-ink-2">{title}</h2>
          {meta && <span className="text-sm tabular-nums text-ink">{meta}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Probabilities({ probs }: { probs: number[] }) {
  return (
    <ul className="space-y-3">
      {CLASSES.map((c, j) => (
        <li key={c} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 text-sm">
          <span className="flex items-center gap-2 text-ink-2">
            <span className="size-2 rounded-full" style={{ background: STATUS[c].color }} />
            {STATUS[c].label}
          </span>
          <span className="tabular-nums">{(probs[j] * 100).toFixed(1)}%</span>
          <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${probs[j] * 100}%`, background: STATUS[c].color }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Sets the simulated motor's physical condition. The model never sees this. */
export function Controls() {
  const { frame, status, demo } = useTelemetry();
  const [local, setLocal] = useState<{ c: ClassName; s: number } | null>(null);
  const c = local?.c ?? frame?.truth.condition ?? "normal";
  const s = local?.s ?? frame?.truth.severity ?? 0.6;
  const apply = (nc: ClassName, ns: number) => {
    setLocal({ c: nc, s: ns });
    command(nc, ns);
  };
  const off = status !== "live";
  // a restarted backend comes back at its defaults: follow it, not the last pick
  useEffect(() => {
    if (off) setLocal(null);
  }, [off]);
  const toggleDemo = () => {
    setLocal(null); // follow the script, not the last manual pick
    if (demo) stopDemo();
    else startDemo();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // defaultPrevented: another mounted Controls already handled it
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest("input:not([type=range]),textarea,select,[contenteditable]")) return;
      const k = e.key.toLowerCase(), n = "123".indexOf(k);
      if (k === "f") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (off) return;
      else if (n >= 0) apply(CLASSES[n], s);
      else if ((k === "[" || k === "]") && c !== "normal") apply(c, Math.round(Math.min(Math.max(s + (k === "]" ? 0.1 : -0.1), 0), 1) * 100) / 100);
      else if (k === "d") toggleDemo();
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Simulated motor condition" className="relative grid grid-cols-3 rounded-xl bg-surface-2 p-1">
        <span aria-hidden
          className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-surface shadow-sm ring-1 ring-line transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
          style={{ transform: `translateX(${CLASSES.indexOf(c) * 100}%)` }} />
        {CLASSES.map((k) => (
          <button key={k} role="radio" aria-checked={k === c} disabled={off} onClick={() => apply(k, s)}
            className="relative flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-ink-2 transition-colors hover:text-ink disabled:opacity-50 aria-checked:text-ink">
            <span className="size-2 rounded-full" style={{ background: STATUS[k].color }} />
            {STATUS[k].short}
          </button>
        ))}
      </div>
      <label className={`block transition-opacity ${c === "normal" ? "opacity-40" : ""}`}>
        <span className="flex justify-between text-sm">
          <span className="text-ink-2">Severity</span>
          <span className="tabular-nums">{Math.round(s * 100)}%</span>
        </span>
        <input type="range" min={0} max={1} step={0.01} value={s} disabled={off || c === "normal"}
          onChange={(e) => apply(c, +e.target.value)} className="mt-2 w-full accent-[var(--series)]" />
      </label>
      <div className="rounded-lg border border-line px-3 py-2.5">
        <div className="flex items-center gap-3 text-sm">
          <button role="switch" aria-checked={!!demo} aria-label="Auto demo" disabled={off} onClick={toggleDemo}
            className="group relative h-5 w-9 shrink-0 rounded-full bg-surface-2 ring-1 ring-line transition-colors disabled:opacity-50 aria-checked:bg-series">
            <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-surface shadow-sm transition-transform duration-300 group-aria-checked:translate-x-4" />
          </button>
          <span className="font-medium" aria-hidden>Auto demo</span>
          <span className="ml-auto truncate text-xs tabular-nums text-ink-2">
            {demo
              ? `Step ${demo.step + 1}/${DEMO.length} · ${STATUS[DEMO[demo.step][0]].short}${DEMO[demo.step][0] === "normal" ? "" : ` ${Math.round(DEMO[demo.step][1] * 100)}%`}`
              : "Cycles every fault"}
          </span>
        </div>
        {demo && (
          <span className="mt-2.5 block h-0.5 overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full bg-series transition-[width] duration-100 ease-linear"
              style={{ width: `${demoProgress() * 100}%` }} />
          </span>
        )}
      </div>
      {frame && (
        <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
          <span>Shaft <b className="font-semibold tabular-nums text-ink">{frame.truth.rpm.toFixed(0)} RPM</b></span>
          <span className="flex items-center gap-1.5">
            <StatusIcon c={frame.label} className="size-3.5" />
            {frame.label === frame.truth.condition ? "AI agrees" : `AI reads ${STATUS[frame.label].label}`}
          </span>
        </div>
      )}
      <p className="text-xs leading-relaxed text-ink-2">
        Changes the simulated motor&apos;s physical load. The AI never sees this setting: it only gets ADC samples.
      </p>
      <p className="hidden flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-2 sm:flex">
        {([["1 2 3", "condition"], ["[ ]", "severity"], ["D", "demo"], ["F", "fullscreen"]] as const).map(([keys, what]) => (
          <span key={what} className="flex items-center gap-1">
            {keys.split(" ").map((k) => <kbd key={k} className="kbd">{k}</kbd>)}
            {what}
          </span>
        ))}
      </p>
    </div>
  );
}

export function OfflineNotice({ className = "" }: { className?: string }) {
  const { status } = useTelemetry();
  if (status === "live") return null;
  return (
    <div className={`rise flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-surface px-5 py-4 text-sm ${className}`}>
      <span className="size-2 rounded-full bg-muted" />
      <span className="font-medium">{status === "offline" ? "Backend offline" : "Connecting to backend…"}</span>
      <span className="text-ink-2">
        Start it with <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">cd backend && python server.py</code>
      </span>
    </div>
  );
}

export function Nav() {
  const path = usePathname();
  const { status, hello } = useTelemetry();
  const live = status === "live";
  const nav = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const a = nav.current?.querySelector<HTMLElement>("[aria-current=page]");
      setPill(a ? { left: a.offsetLeft, width: a.offsetWidth } : null);
    };
    place();
    const ro = new ResizeObserver(place); // web font swap changes link widths
    ro.observe(nav.current!);
    return () => ro.disconnect();
  }, [path]);
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-page/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-ink text-page">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
              <path d="M3 12h3l2-5 3 10 3-8 2 3h5" />
            </svg>
          </span>
          <span className="hidden sm:inline">Motor Fault Detector</span>
        </Link>
        <nav ref={nav} className="relative flex gap-1 rounded-lg bg-surface-2 p-1 text-sm">
          {pill && (
            <span aria-hidden style={pill}
              className="absolute inset-y-1 rounded-md bg-surface shadow-sm ring-1 ring-line transition-[left,width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]" />
          )}
          {[["/", "Dashboard"], ["/lab", "3D Lab"], ["/how", "How it works", "How"]].map(([href, label, short]) => (
            <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
              className="relative whitespace-nowrap rounded-md px-2 py-1 text-ink-2 transition-colors hover:text-ink aria-[current=page]:text-ink sm:px-3">
              {short ? <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></> : label}
            </Link>
          ))}
        </nav>
        <Link href="/vigil" title="Embedded firmware suite (Vigil)"
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs text-ink-2 transition-colors hover:border-ink-2 hover:text-ink sm:px-2.5">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
          </svg>
          <span className="hidden md:inline">Firmware twin</span>
          <span className="sr-only md:hidden">Firmware twin</span>
        </Link>
        <span className="flex shrink-0 items-center gap-2 text-xs text-ink-2">
          <span className="relative flex size-2">
            {live && <span className="absolute inset-0 motion-safe:animate-ping rounded-full bg-good opacity-60" />}
            <span className={`relative size-2 rounded-full ${live ? "bg-good" : status === "offline" ? "bg-critical" : "bg-muted"}`} />
          </span>
          <span className="sr-only sm:not-sr-only">
            {live ? `Simulated Arduino · ${hello?.circuit.fs ?? 1000} Hz` : status === "offline" ? "Backend offline" : "Connecting…"}
          </span>
        </span>
      </div>
    </header>
  );
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A number that eases toward each new value instead of jumping. */
export function AnimatedNumber({ value, digits = 0, className = "" }: { value: number; digits?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const [first] = useState(() => (Number.isFinite(value) ? value.toFixed(digits) : "—"));
  useEffect(() => {
    const el = ref.current!;
    if (!Number.isFinite(value) || !Number.isFinite(shown.current) || reduced()) {
      shown.current = value;
      el.textContent = Number.isFinite(value) ? value.toFixed(digits) : "—";
      return;
    }
    const from = shown.current, t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min((performance.now() - t0) / 400, 1);
      shown.current = from + (value - from) * (1 - (1 - p) ** 3);
      el.textContent = shown.current.toFixed(digits);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [value, digits]);
  return <span ref={ref} className={`tabular-nums ${className}`}>{first}</span>;
}

/** Pops a notice whenever the AI's verdict changes. */
export function Toasts() {
  const { log } = useTelemetry();
  const [items, setItems] = useState<(LogEntry & { out?: boolean })[]>([]);
  const seen = useRef(log[0]?.at);
  const top = log[0];
  const changed = log.length > 1; // the first verdict after connecting is not a change
  useEffect(() => {
    if (!top || top.at === seen.current) return;
    seen.current = top.at;
    if (!changed) return;
    setItems((xs) => [...xs.slice(-2), top]);
    setTimeout(() => setItems((xs) => xs.map((x) => (x.at === top.at ? { ...x, out: true } : x))), 4000);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.at !== top.at)), 4300);
  }, [top, changed]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 top-[4.25rem] z-30 grid w-[min(20rem,calc(100vw-2rem))] gap-2">
      {items.map((e) => (
        <div key={e.at} className={`${e.out ? "toast-out" : "toast-in"} flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-lg`}>
          <StatusIcon c={e.label} className="size-8" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">{e.label === "normal" ? "Back to normal" : `${STATUS[e.label].label} detected`}</p>
            <p className="text-xs tabular-nums text-ink-2">
              {new Date(e.at).toLocaleTimeString([], { hour12: false })} · {(e.confidence * 100).toFixed(0)}% confidence
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Fixed dot grid + a glow tinted by the AI's current verdict. Purely decorative. */
export function Backdrop() {
  const { frame } = useTelemetry();
  return <div aria-hidden className="backdrop" style={{ "--glow": frame ? STATUS[frame.label].color : "transparent" } as CSSProperties} />;
}
