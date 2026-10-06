import type { ClassName } from "@/lib/telemetry";

const W = 240, H = 84, MAX = 1.2; // 2 s of current, 0..1.2 A
const y = (a: number) => H - 6 - (a / MAX) * (H - 12);
const ripple = (t: number) => 0.012 * Math.sin(2 * Math.PI * 23 * t) + 0.008 * Math.sin(2 * Math.PI * 41 * t + 1);
const level: Record<ClassName, (t: number) => number> = {
  normal: (t) => 0.33 + ripple(t),
  overload: (t) => 0.82 + ripple(t) * 1.4,
  // one rub per revolution, ~3 Hz
  friction: (t) => 0.36 + ripple(t) + 0.42 * Math.exp(-(((((t * 3) % 1) - 0.5) / 0.045) ** 2)),
};
const path = (c: ClassName) =>
  Array.from({ length: W + 1 }, (_, x) => `${x ? "L" : "M"}${x} ${y(level[c]((x / W) * 2)).toFixed(1)}`).join("");

/** Static sketch of what the motor current looks like in each condition. */
export function Sketch({ c }: { c: ClassName }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
      aria-label={`Sketch of motor current over 2 seconds, ${c}`}>
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--axis)" />
      <line x1={0} x2={W} y1={y(0.33)} y2={y(0.33)} stroke="var(--grid)" strokeDasharray="3 3" />
      <text x={W - 2} y={y(0.33) + 11} textAnchor="end" fontSize={9} fill="var(--muted)">normal 0.33 A</text>
      <path d={path(c)} fill="none" stroke="var(--series)" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
