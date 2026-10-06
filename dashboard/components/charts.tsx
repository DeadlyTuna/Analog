"use client";
import { useEffect, useRef } from "react";
import { STATUS, StatusIcon } from "@/components/ui";
import {
  CLASSES, type Channel, type ClassName, FS, getState, history, HISTORY, historyCount, latest, now, oldest, sample,
} from "@/lib/telemetry";

let cache: Record<string, string> = {};
if (typeof window !== "undefined")
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => (cache = {}));
const css = (name: string) => (cache[name] ??= getComputedStyle(document.documentElement).getPropertyValue(name).trim());
const font = (size: number) => `${size}px ${css("--font-geist-sans") || "system-ui"}`;

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, hoverX: number | null) => void;

/** A canvas redrawn every animation frame - charts never wait on React. */
function useCanvas(draw: Draw) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  });
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    let hover: number | null = null;
    const move = (e: PointerEvent) => (hover = e.offsetX);
    const leave = () => (hover = null);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerleave", leave);
    let raf = 0;
    const frame = () => {
      const dpr = devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, w, h, hover);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerleave", leave);
    };
  }, []);
  return ref;
}

function hline(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, Math.round(y) + 0.5);
  ctx.lineTo(x1, Math.round(y) + 0.5);
  ctx.stroke();
}

function crosshair(ctx: CanvasRenderingContext2D, x: number, y: number, top: number, bottom: number, text: string, w: number) {
  ctx.strokeStyle = css("--axis");
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, top);
  ctx.lineTo(Math.round(x) + 0.5, bottom);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = css("--series");
  ctx.fill();
  ctx.strokeStyle = css("--surface");
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = font(12);
  const tw = ctx.measureText(text).width + 16;
  const th = 24;
  const bx = x + 12 + tw > w ? x - 12 - tw : x + 12;
  const by = Math.max(top, Math.min(y - th - 6, bottom - th));
  ctx.beginPath();
  ctx.roundRect(bx, by, tw, th, 6);
  ctx.fillStyle = css("--surface-2");
  ctx.fill();
  ctx.strokeStyle = css("--line");
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = css("--ink");
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, bx + 8, by + th / 2);
}

/** Scrolling oscilloscope trace of one stage of the signal chain. */
export function Scope({
  channel, range, ticks, unit, digits = 3, seconds = 3, axis = false, fill = false, className = "h-16",
}: {
  /** Fixed y-range; omit to auto-range (eased) around the visible signal. */
  channel: Channel; range?: [number, number]; ticks?: number[]; unit: string; digits?: number;
  seconds?: number; axis?: boolean; fill?: boolean; className?: string;
}) {
  const auto = useRef<[number, number] | null>(null);
  const ref = useCanvas((ctx, w, h, hx) => {
    const L = axis ? 48 : 0, B = axis ? 22 : 0, T = 6;
    const pw = w - L, ph = h - B - T;
    const t1 = now(), t0 = t1 - seconds;
    const head = latest();
    const k0 = Math.max(Math.ceil(t0 * FS), oldest());
    const k1 = Math.min(Math.floor(t1 * FS), head - 1);
    let [lo, hi] = range ?? auto.current ?? [0, 1];
    if (!range && k1 > k0) {
      let mn = Infinity, mx = -Infinity;
      for (let k = k0; k <= k1; k++) {
        const v = sample(channel, k);
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      const pad = Math.max((mx - mn) * 0.15, Math.abs(mx) * 0.02, 1e-3);
      const target: [number, number] = [mn - pad, mx + pad];
      const a = auto.current ?? target;
      auto.current = [a[0] + (target[0] - a[0]) * 0.08, a[1] + (target[1] - a[1]) * 0.08];
      [lo, hi] = auto.current;
    }
    const X = (t: number) => L + ((t - t0) / seconds) * pw;
    const Y = (v: number) => T + (1 - (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * ph;

    if (axis) {
      ctx.font = font(11);
      ctx.fillStyle = css("--muted");
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (const v of ticks ?? [lo, hi]) {
        hline(ctx, L, w, Y(v), css(v === lo ? "--axis" : "--grid"));
        ctx.fillText(`${v} ${unit}`, L - 10, Y(v));
      }
      ctx.textBaseline = "top";
      for (let s = 0; s <= seconds; s++) {
        ctx.textAlign = s === 0 ? "right" : "center";
        ctx.fillText(s === 0 ? "now" : `−${s} s`, X(t1 - s), h - B + 8);
      }
    }

    if (k1 <= k0) return;
    const color = css("--series");
    ctx.beginPath();
    for (let k = k0; k <= k1; k++) {
      const x = X(k / FS), y = Y(sample(channel, k));
      if (k === k0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();
    if (fill) {
      ctx.lineTo(X(k1 / FS), Y(lo));
      ctx.lineTo(X(k0 / FS), Y(lo));
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (hx !== null && hx > L) {
      const k = Math.min(Math.max(Math.round((t0 + ((hx - L) / pw) * seconds) * FS), k0), k1);
      const v = sample(channel, k);
      const text = `${v.toFixed(digits)}${unit ? ` ${unit}` : ""}  ·  ${(k / FS - t1).toFixed(2)} s`;
      crosshair(ctx, X(k / FS), Y(v), T, T + ph, text, w);
    }
  });
  return <canvas ref={ref} className={`block w-full ${className}`} />;
}

const niceStep = (x: number) => {
  const p = 10 ** Math.floor(Math.log10(x));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= x)!;
};

/** FFT of the 1 s window the model sees, eased between frames. */
export function Spectrum({ className = "h-48" }: { className?: string }) {
  const eased = useRef<number[]>([]);
  const top = useRef(5);
  const ref = useCanvas((ctx, w, h, hx) => {
    const { frame, hello } = getState();
    if (!frame || !hello) return;
    const spec = frame.spec, e = eased.current;
    for (let j = 0; j < spec.length; j++) e[j] = e[j] === undefined ? spec[j] : e[j] + (spec[j] - e[j]) * 0.2;
    e.length = spec.length;
    top.current += (Math.max(2, ...e) * 1.15 - top.current) * 0.08;

    const maxHz = 40, df = maxHz / (spec.length - 1);
    const L = 48, B = 22, T = 8;
    const pw = w - L, ph = h - B - T;
    const X = (f: number) => L + (f / maxHz) * pw;
    const Y = (a: number) => T + (1 - Math.min(a, top.current) / top.current) * ph;

    ctx.font = font(11);
    ctx.fillStyle = css("--muted");
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const step = niceStep(top.current / 3);
    for (let v = 0; v <= top.current; v += step) {
      hline(ctx, L, w, Y(v), css(v === 0 ? "--axis" : "--grid"));
      ctx.fillText(`${+v.toFixed(1)} mA`, L - 10, Y(v));
    }
    ctx.textBaseline = "top";
    for (let f = 0; f <= maxHz; f += 10) {
      ctx.textAlign = f === maxHz ? "right" : f === 0 ? "left" : "center";
      ctx.fillText(`${f} Hz`, X(f), h - B + 8);
    }

    const color = css("--series");
    ctx.beginPath();
    e.forEach((a, j) => (j ? ctx.lineTo(X(j * df), Y(a)) : ctx.moveTo(X(0), Y(a))));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.lineTo(X(maxHz), Y(0));
    ctx.lineTo(X(0), Y(0));
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;

    // label the dominant peak only
    const dom = frame.feat[hello.features.indexOf("dom_freq")];
    if (dom <= maxHz && hx === null) {
      const j = Math.round(dom / df), x = X(j * df), y = Y(e[j] ?? 0);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = css("--surface");
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = font(12);
      ctx.fillStyle = css("--ink-2");
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${dom.toFixed(2)} Hz`, x + 8, Math.max(y - 4, T + 14));
    }
    if (hx !== null && hx > L) {
      const j = Math.min(Math.max(Math.round((((hx - L) / pw) * maxHz) / df), 0), e.length - 1);
      crosshair(ctx, X(j * df), Y(e[j]), T, T + ph, `${(j * df).toFixed(2)} Hz  ·  ${e[j].toFixed(2)} mA`, w);
    }
  });
  return <canvas ref={ref} className={`block w-full ${className}`} />;
}

const TOKEN: Record<ClassName, string> = { normal: "--good", overload: "--warning", friction: "--critical" };
const LANE = 20, LANES = [18, 66], SECONDS = 60;

/** Last 60 s of AI verdicts against the condition the simulator was actually set to. */
export function Timeline() {
  const ref = useCanvas((ctx, w, h, hx) => {
    const n = historyCount(), j0 = Math.max(0, n - HISTORY);
    const t1 = now(), t0 = t1 - SECONDS;
    const X = (t: number) => ((t - t0) / SECONDS) * w;
    const T = (j: number) => history.t[j % HISTORY];
    // a frame lasts until the next one, unless the stream had a gap
    const end = (j: number) => (j + 1 < n && T(j + 1) - T(j) < 0.2 ? T(j + 1) : T(j) + 0.05);
    const lanes = [["AI prediction", history.pred], ["Actual (simulated)", history.truth]] as const;

    ctx.font = font(12);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    lanes.forEach(([name, data], li) => {
      const y = LANES[li];
      ctx.fillStyle = css("--ink");
      ctx.fillText(name, 0, y - 17);
      ctx.beginPath();
      ctx.roundRect(0, y, w, LANE, 4);
      ctx.fillStyle = css("--surface-2");
      ctx.fill();
      for (let s = j0; s < n; ) {
        let e = s;
        while (e + 1 < n && data[(e + 1) % HISTORY] === data[s % HISTORY] && end(e) === T(e + 1)) e++;
        const x0 = Math.max(X(T(s)), 0), x1 = Math.min(X(end(e)), w) - (e + 1 < n ? 2 : 0); // 2px gap between segments
        if (x1 > x0) {
          ctx.beginPath();
          ctx.roundRect(x0, y, Math.max(x1 - x0, 1), LANE, 4);
          ctx.fillStyle = css(TOKEN[CLASSES[data[s % HISTORY]]]);
          ctx.fill();
        }
        s = e + 1;
      }
    });

    ctx.font = font(11);
    ctx.fillStyle = css("--muted");
    for (let s = 0; s <= SECONDS; s += 15) {
      ctx.textAlign = s === 0 ? "right" : s === SECONDS ? "left" : "center";
      ctx.fillText(s === 0 ? "now" : `−${s} s`, w - (s / SECONDS) * w, LANES[1] + LANE + 8);
    }

    if (hx === null || !n) return;
    const t = t0 + (hx / w) * SECONDS;
    let j = n - 1;
    while (j > j0 && T(j) > t) j--;
    if (T(j) > t || end(j) < t) return;
    const bottom = LANES[1] + LANE;
    ctx.strokeStyle = css("--ink-2");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(hx) + 0.5, 0);
    ctx.lineTo(Math.round(hx) + 0.5, bottom);
    ctx.stroke();

    const pred = CLASSES[history.pred[j % HISTORY]], truth = CLASSES[history.truth[j % HISTORY]];
    const rows: [string, ClassName | null][] = [
      [`${(t - t1).toFixed(1).replace("-", "−")} s`, null],
      [`AI: ${STATUS[pred].label} · ${(history.conf[j % HISTORY] * 100).toFixed(0)}%`, pred],
      [`Actual: ${STATUS[truth].label}`, truth],
    ];
    ctx.font = font(12);
    const bw = Math.max(...rows.map(([s]) => ctx.measureText(s).width)) + 30, bh = rows.length * 18 + 10;
    const bx = hx + 10 + bw > w ? hx - 10 - bw : hx + 10;
    ctx.beginPath();
    ctx.roundRect(bx, 0, bw, bh, 6);
    ctx.fillStyle = css("--surface-2");
    ctx.fill();
    ctx.strokeStyle = css("--line");
    ctx.stroke();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    rows.forEach(([s, c], r) => {
      const y = 14 + r * 18;
      if (c) {
        ctx.beginPath();
        ctx.arc(bx + 12, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = css(TOKEN[c]);
        ctx.fill();
      }
      ctx.fillStyle = css(c ? "--ink" : "--ink-2");
      ctx.fillText(s, bx + (c ? 22 : 10), y);
    });
  });
  return (
    <div>
      <canvas ref={ref} role="img" aria-label="AI prediction and actual motor condition over the last 60 seconds"
        className="block h-28 w-full" />
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
        {CLASSES.map((c) => (
          <li key={c} className="flex items-center gap-1.5">
            <StatusIcon c={c} className="size-3.5" />
            {STATUS[c].label}
          </li>
        ))}
      </ul>
    </div>
  );
}
