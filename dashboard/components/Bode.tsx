"use client";
import { useEffect, useRef, useState } from "react";
import { useTelemetry } from "@/lib/telemetry";

// Sallen-Key low-pass as built: unity gain, equal R, C1 = feedback cap.
export const R = 10e3, C1 = 100e-9, C2 = 47e-9, GAIN_DB = 20 * Math.log10(200e3 / 10e3);
export const FC = 1 / (2 * Math.PI * R * Math.sqrt(C1 * C2));
export const Q = 0.5 * Math.sqrt(C1 / C2);
/** |H(j2πf)| in dB for H(s) = 1 / (s²R²C1C2 + 2sRC2 + 1). */
export function db(f: number) {
  const w = 2 * Math.PI * f;
  return -10 * Math.log10((1 - w * w * R * R * C1 * C2) ** 2 + (2 * w * R * C2) ** 2);
}
// Q isn't 0.707, so the -3 dB edge sits a little above fc: solve |H|² = ½ for (f/fc)².
const k = 2 - 1 / (Q * Q);
export const F3DB = FC * Math.sqrt((k + Math.sqrt(k * k + 4)) / 2);
/** Commutator ripple: output RPM × 30:1 gearbox × 6 commutator slots. */
export const rippleHz = (rpm: number) => (rpm / 60) * 30 * 6;

export const dB = (d: number) => d.toFixed(1).replace("-", "−");
export const hz = (f: number) => (f >= 1000 ? `${+(f / 1000).toFixed(2)} kHz` : `${f >= 100 ? f.toFixed(0) : f.toFixed(1)} Hz`);

const TOP = 40, BOT = -70, H = 240, L = 44, RP = 8, T = 10, B = 24;

export function Bode() {
  const { frame, hello } = useTelemetry();
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current!;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pw = w - L - RP, ph = H - T - B;
  const X = (f: number) => L + (Math.log10(f) / 4) * pw;
  const Y = (d: number) => T + ((TOP - Math.min(Math.max(d, BOT), TOP)) / (TOP - BOT)) * ph;
  const nyq = (hello?.circuit.fs ?? 1000) / 2;
  const fr = Math.round(rippleHz(frame?.truth.rpm || 200));
  const curve = Array.from({ length: 241 }, (_, j) => 10 ** (j / 60))
    .map((f, j) => `${j ? "L" : "M"}${X(f).toFixed(1)} ${Y(db(f)).toFixed(1)}`).join("");
  const minor = [1, 10, 100, 1000].flatMap((d) => [2, 3, 4, 5, 6, 7, 8, 9].map((m) => m * d));
  const text = (size = 11, tone = "muted") => ({ fontSize: size, fill: `var(--${tone})` });

  let tip = null;
  if (hover !== null) {
    const x = X(hover), y = Y(db(hover)), label = `${hz(hover)}  ·  ${dB(db(hover))} dB`;
    const tw = label.length * 6.4 + 16, th = 24;
    const bx = x + 12 + tw > w ? x - 12 - tw : x + 12, by = Math.max(T, Math.min(y - th - 6, T + ph - th));
    tip = (
      <g>
        <line x1={x} x2={x} y1={T} y2={T + ph} stroke="var(--axis)" />
        <circle cx={x} cy={y} r={4} fill="var(--series)" stroke="var(--surface)" strokeWidth={2} />
        <rect x={bx} y={by} width={tw} height={th} rx={6} fill="var(--surface-2)" stroke="var(--line)" />
        <text x={bx + 8} y={by + 16} {...text(12, "ink")}>{label}</text>
      </g>
    );
  }

  return (
    <div>
      <div ref={box} className="h-60 touch-pan-y">
        {pw > 0 && (
          <svg width={w} height={H} className="block select-none" role="img"
            aria-label={`Sallen-Key low-pass magnitude response: fc ${FC.toFixed(0)} Hz, ${db(fr).toFixed(1)} dB at the ${fr} Hz commutator ripple`}
            onPointerMove={(e) => {
              const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
              setHover(x < L ? null : 10 ** Math.min(4, ((x - L) / pw) * 4));
            }}
            onPointerLeave={() => setHover(null)}>
            <rect x={L} y={T} width={X(50) - L} height={ph} fill="var(--series)" opacity={0.07} />
            <rect x={X(nyq)} y={T} width={L + pw - X(nyq)} height={ph} fill="var(--surface-2)" />
            {minor.map((f) => <line key={f} x1={X(f)} x2={X(f)} y1={T} y2={T + ph} stroke="var(--grid)" strokeOpacity={0.5} />)}
            {[1, 10, 100, 1000, 10000].map((f, j) => (
              <g key={f}>
                <line x1={X(f)} x2={X(f)} y1={T} y2={T + ph} stroke="var(--grid)" />
                <text x={X(f)} y={H - 6} textAnchor={j === 0 ? "start" : j === 4 ? "end" : "middle"} {...text()}>{hz(f).replace(".0 ", " ")}</text>
              </g>
            ))}
            {[40, 20, 0, -20, -40, -60].map((d) => (
              <g key={d}>
                <line x1={L} x2={L + pw} y1={Y(d)} y2={Y(d)} stroke="var(--grid)" />
                <text x={L - 8} y={Y(d) + 4} textAnchor="end" {...text()}>{d > 0 ? `+${d}` : d === 0 ? "0 dB" : `−${-d}`}</text>
              </g>
            ))}
            <line x1={L} x2={L + pw} y1={T + ph} y2={T + ph} stroke="var(--axis)" />

            <text x={L + 6} y={T + ph - 8} {...text()}>fault band &lt; 50 Hz</text>
            <text x={L + pw - 6} y={T + 14} textAnchor="end" {...text()}>aliasing zone</text>
            <line x1={X(nyq)} x2={X(nyq)} y1={T} y2={T + ph} stroke="var(--axis)" />
            <line x1={L} x2={L + pw} y1={Y(GAIN_DB)} y2={Y(GAIN_DB)} stroke="var(--muted)" strokeDasharray="4 4" />
            <text x={L + 6} y={Y(GAIN_DB) - 6} {...text()}>diff-amp gain +{GAIN_DB.toFixed(0)} dB</text>
            <line x1={X(FC)} x2={X(FC)} y1={T} y2={T + ph} stroke="var(--muted)" strokeDasharray="3 3" />
            <text x={X(FC) - 6} y={Y(0) - 8} textAnchor="end" {...text(11, "ink-2")}>fc {FC.toFixed(0)} Hz</text>

            <path d={curve} fill="none" stroke="var(--series)" strokeWidth={2} strokeLinejoin="round" />
            {[FC, fr].map((f) => <circle key={f} cx={X(f)} cy={Y(db(f))} r={4} fill="var(--series)" stroke="var(--surface)" strokeWidth={2} />)}
            <text x={X(fr) + 8} y={Y(db(fr)) - 22} {...text(11, "ink-2")}>ripple {fr} Hz</text>
            <text x={X(fr) + 8} y={Y(db(fr)) - 8} {...text(11, "ink")} fontWeight={600}>{dB(db(fr))} dB</text>
            {tip}
          </svg>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-2">
        Computed from the parts: at fc the gain is 20·log₁₀Q = {dB(db(FC))} dB and the −3 dB edge is {F3DB.toFixed(0)} Hz.
        Fault features below 50 Hz pass flat, the {fr} Hz commutator ripple leaves {(-db(fr)).toFixed(1)} dB down
        (×{(10 ** (db(fr) / 20)).toFixed(2)}), and everything past the {nyq} Hz Nyquist limit of the {nyq * 2} Hz ADC is at least{" "}
        {(-db(nyq)).toFixed(1)} dB down before it can alias. The diff amp adds a flat +{GAIN_DB.toFixed(0)} dB on top.
      </p>
    </div>
  );
}
