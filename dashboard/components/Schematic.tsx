"use client";
import { type ReactNode, type SyntheticEvent, useEffect, useRef, useState } from "react";
import { FC, Q, db, rippleHz } from "@/components/Bode";
import { type Channel, getState, recentMean, useTelemetry } from "@/lib/telemetry";

const W = 1240, H = 432;

const RIN = {
  name: "Input resistor Rin", value: "10 kΩ",
  role: "Feeds one end of the shunt into the amplifier. A matched pair cancels noise common to both shunt wires.",
  formula: "G = Rf / Rin = 200k / 10k = 20",
};
const RLP = {
  name: "Filter resistor", value: "10 kΩ (R1 = R2 = R)",
  role: "Together with C1 and C2 sets where the low-pass starts cutting.",
  formula: "fc = 1 / 2πR√(C1·C2)",
};
const PARTS = {
  supply: {
    name: "12 V DC adapter", value: "12 V · 2 A",
    role: "Powers the motor loop only. Its (−) is tied to Arduino GND so every stage shares one reference.",
    formula: "P = V · I ≤ 24 W",
  },
  motor: {
    name: "Geared DC motor", value: "12 V · ~200 RPM · 30:1 gearbox",
    role: "The machine being watched. Load raises its current; friction adds a bump once per revolution.",
    formula: "I = (V − k·ω) / Ra",
  },
  shunt: {
    name: "Shunt resistor", value: "0.1 Ω · 2 W",
    role: "Low-side current sense: turns motor current into a small voltage without disturbing the motor.",
    formula: "V = I · R   →   1 A = 100 mV",
  },
  rin1: RIN,
  rin2: RIN,
  rg: {
    name: "Reference resistor", value: "200 kΩ to GND",
    role: "Mirrors Rf on the + input so the stage amplifies only the difference across the shunt.",
    formula: "Va = (Rf / Rin) · (V+ − V−)",
  },
  rf: { name: "Feedback resistor Rf", value: "200 kΩ", role: "Sets the gain together with Rin.", formula: "G = Rf / Rin = 20  (+26 dB)" },
  u1a: {
    name: "LM358 · half A", value: "Differential amplifier, ×20",
    role: "Lifts ~50 mV to ~1 V for the ADC. Runs from the Arduino's 5 V, so it saturates near 3.5 V.",
    formula: "Va = 20 · (V+ − V−)",
  },
  r1: RLP,
  r2: RLP,
  c1: {
    name: "Capacitor C1", value: "100 nF, feedback",
    role: "Feeds the output back to the middle node and shapes the knee of the response.",
    formula: `Q = ½√(C1 / C2) = ${Q.toFixed(2)}`,
  },
  c2: {
    name: "Capacitor C2", value: "47 nF to GND",
    role: "Shunts high frequencies at the op-amp input to ground.",
    formula: `fc = 1 / 2πR√(C1·C2) = ${FC.toFixed(0)} Hz`,
  },
  u1b: {
    name: "LM358 · half B", value: "Unity-gain Sallen-Key low-pass",
    role: `Cuts the ~600 Hz commutator ripple by ${(-db(rippleHz(200))).toFixed(1)} dB and anti-aliases before sampling.`,
    formula: "H(s) = 1 / (s²R²C1C2 + 2sRC2 + 1)",
  },
  arduino: {
    name: "Arduino Uno", value: "10-bit ADC · 5 V ref · 1 kHz",
    role: "Samples A0 every millisecond and streams the counts over USB serial. Also powers the LM358.",
    formula: "N = V / 5 V × 1023",
  },
  laptop: {
    name: "Laptop", value: "Python · Random Forest",
    role: "Turns 1 s windows into 11 features; 100 decision trees vote on the motor's condition.",
    formula: "P(class) = votes / 100",
  },
  gnd: {
    name: "Common ground", value: "12 V (−) ↔ Arduino GND",
    role: "Without this wire the ADC has no reference and reads noise.",
    formula: "every voltage is measured from here",
  },
};
type PartId = keyof typeof PARTS;

const STAGES = [
  [12, 310, "Sense", "current → voltage"],
  [334, 320, "Amplify", "differential, ×20"],
  [666, 330, "Filter", "Sallen-Key low-pass"],
  [1008, 220, "Digitise", "10-bit ADC at 1 kHz"],
] as const;

const WIRES = [
  "M60 96V222M60 246V400M60 96H240V126M240 174V224M240 284V400", // motor loop
  "M240 214H360M410 214H500M450 214V226M450 276V290", // + input
  "M240 340H360M410 340H480V254H500M480 310H510M570 310H600V234M580 234H680", // − input, Rf, output
  "M530 209V78H1040V120H1062M530 259V272", // 5 V rail, V−
  "M730 234H775M825 234H890M848 234V270M848 278V294M752 234V150H866M874 150H985V254M890 274H878V330H985V254M970 254H1062",
  "M1062 306H1040V400M1138 190H1166", // GND pin, USB
].join("");
const JUNCTIONS = [[240, 214], [240, 340], [240, 400], [450, 214], [480, 310], [600, 234], [752, 234], [848, 234], [985, 254]];

/** Resistor zigzag between two points, 6 peaks. */
function zig(x1: number, y1: number, x2: number, y2: number) {
  const ux = (x2 - x1) / 12, uy = (y2 - y1) / 12, s = 6 / Math.hypot(ux, uy);
  let d = `M${x1} ${y1}`;
  for (let j = 0; j < 6; j++) {
    const a = j % 2 ? -s : s;
    d += `L${x1 + ux * (2 * j + 1) - uy * a} ${y1 + uy * (2 * j + 1) + ux * a}`;
  }
  return `${d}L${x2} ${y2}`;
}
const ground = (x: number, y: number) => `M${x - 10} ${y}H${x + 10}M${x - 6} ${y + 4}H${x + 6}M${x - 2} ${y + 8}H${x + 2}`;

function Txt({ x, y, size = 11, tone = "ink-2", anchor, weight, mono, children }: {
  x: number; y: number; size?: number; tone?: string; anchor?: "start" | "middle" | "end"; weight?: number; mono?: boolean; children: ReactNode;
}) {
  return (
    <text x={x} y={y} fontSize={size} fill={`var(--${tone})`} stroke="none" textAnchor={anchor} fontWeight={weight}
      className={mono ? "font-mono" : "tabular-nums"}>
      {children}
    </text>
  );
}

/** Live meter on a node: 0.1 s average of one channel, 20 Hz. */
function Probe({ x, y, tx, ty, w = 66, label, c, unit, digits }: {
  x: number; y: number; tx: number; ty: number; w?: number; label: string; c: Channel; unit: string; digits: number;
}) {
  useTelemetry();
  const v = recentMean(c, 100);
  return (
    <g pointerEvents="none">
      <line x1={x} y1={y} x2={Math.min(Math.max(x, tx), tx + w)} y2={Math.min(Math.max(y, ty), ty + 34)} stroke="var(--series)" strokeWidth={1} />
      <rect x={tx} y={ty} width={w} height={34} rx={7} fill="var(--surface)" stroke="var(--line)" strokeWidth={1} />
      <circle cx={tx + 10} cy={ty + 11} r={3} fill="var(--series)" stroke="none" />
      <Txt x={tx + 17} y={ty + 14} size={10}>{label}</Txt>
      <Txt x={tx + 8} y={ty + 28} size={12} tone="ink" weight={600}>
        {Number.isFinite(v) ? v.toFixed(digits) : "—"}{unit && ` ${unit}`}
      </Txt>
      <circle cx={x} cy={y} r={4} fill="var(--series)" stroke="var(--surface)" strokeWidth={2} />
    </g>
  );
}

export function Schematic() {
  const [tip, setTip] = useState<{ id: PartId; x: number; y: number; below: boolean } | null>(null);
  const outer = useRef<HTMLDivElement>(null);
  const flow = useRef<SVGPathElement>(null);

  // Charge dots crawl round the motor loop at a speed set by the measured current.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, off = 0, last = performance.now();
    const tick = (t: number) => {
      const i = getState().status === "live" ? recentMean("i", 50) : 0;
      off = (off - ((Number.isFinite(i) ? i : 0) * 80 * (t - last)) / 1000) % 14;
      last = t;
      flow.current?.setAttribute("stroke-dashoffset", off.toFixed(2));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const show = (id: PartId) => (e: SyntheticEvent<SVGGElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), o = outer.current!.getBoundingClientRect();
    const below = r.top - o.top < 160;
    setTip({ id, x: Math.min(Math.max(r.left + r.width / 2 - o.left - 128, 0), o.width - 256), y: (below ? r.bottom : r.top) - o.top, below });
  };
  const part = (id: PartId, [x, y, w, h]: number[], body: ReactNode) => {
    const p = PARTS[id], on = tip?.id === id;
    return (
      <g tabIndex={0} role="img" aria-label={`${p.name}, ${p.value}. ${p.role} ${p.formula}`}
        onPointerEnter={show(id)} onFocus={show(id)} onBlur={() => setTip(null)}
        onPointerLeave={(e) => e.pointerType !== "touch" && setTip(null)}
        className="cursor-help outline-none" style={on ? { color: "var(--ink)" } : undefined}>
        <rect x={x} y={y} width={w} height={h} rx={8} stroke="none"
          style={{ fill: on ? "color-mix(in oklab, var(--series) 14%, transparent)" : "transparent", transition: "fill .15s" }} />
        {body}
      </g>
    );
  };
  const p = tip && PARTS[tip.id];

  return (
    <div ref={outer} className="relative">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[860px] text-ink-2" fill="none" stroke="currentColor"
          strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" role="group"
          aria-label="Schematic: 12 V motor with 0.1 Ω low-side shunt, LM358 ×20 differential amplifier, 232 Hz Sallen-Key low-pass, Arduino Uno A0, USB to laptop"
          onPointerDown={(e) => e.target === e.currentTarget && setTip(null)}>
          {STAGES.map(([x, w, title, sub], j) => (
            <g key={title}>
              <rect x={x} y={16} width={w} height={360} rx={14} stroke="var(--muted)" strokeOpacity={0.6} strokeWidth={1} strokeDasharray="5 5" />
              <circle cx={x + 24} cy={36} r={10} fill="var(--ink)" stroke="none" />
              <Txt x={x + 24} y={40} tone="surface" weight={700} anchor="middle">{j + 1}</Txt>
              <Txt x={x + 42} y={41} size={14} tone="ink" weight={600}>{title}</Txt>
              <Txt x={x + 42} y={58}>{sub}</Txt>
            </g>
          ))}

          <path d={WIRES} />
          {JUNCTIONS.map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r={3.5} fill="currentColor" stroke="none" />)}
          <Txt x={780} y={94} anchor="middle">+5 V rail · Arduino 5V → LM358 V+</Txt>
          <Txt x={76} y={366} tone="ink" mono>Vs = I × 0.1 Ω</Txt>
          <Txt x={680} y={352} tone="ink" mono>fc = 1 / 2πR√(C1·C2) = {FC.toFixed(0)} Hz</Txt>
          <Txt x={680} y={368} tone="ink" mono>Q = ½√(C1 / C2) = {Q.toFixed(2)}</Txt>

          {part("supply", [30, 206, 128, 56], <>
            <path d="M46 222H74M52 230H68M46 238H74M52 246H68" />
            <Txt x={38} y={220} size={13} anchor="middle">+</Txt>
            <Txt x={84} y={234} size={13} tone="ink" weight={600}>12 V</Txt>
            <Txt x={84} y={250}>2 A adapter</Txt>
          </>)}
          {part("motor", [112, 122, 156, 56], <>
            <circle cx={240} cy={150} r={24} />
            <Txt x={240} y={156} size={16} tone="ink" weight={600} anchor="middle">M</Txt>
            <Txt x={206} y={146} size={12} tone="ink" anchor="end">Geared motor</Txt>
            <Txt x={206} y={162} anchor="end">12 V · 200 RPM</Txt>
          </>)}
          {part("shunt", [226, 222, 96, 64], <>
            <path d={zig(240, 224, 240, 284)} />
            <Txt x={256} y={252} size={12} tone="ink">R shunt</Txt>
            <Txt x={256} y={268}>0.1 Ω · 2 W</Txt>
          </>)}

          {part("rin1", [354, 186, 62, 36], <>
            <path d={zig(360, 214, 410, 214)} />
            <Txt x={385} y={199} tone="ink" anchor="middle">Rin 10 kΩ</Txt>
          </>)}
          {part("rin2", [354, 326, 62, 44], <>
            <path d={zig(360, 340, 410, 340)} />
            <Txt x={385} y={362} tone="ink" anchor="middle">Rin 10 kΩ</Txt>
          </>)}
          {part("rg", [396, 222, 66, 80], <>
            <path d={zig(450, 226, 450, 276)} />
            <path d={ground(450, 290)} />
            <Txt x={440} y={250} tone="ink" anchor="end">200 kΩ</Txt>
            <Txt x={440} y={264} size={10} anchor="end">to GND</Txt>
          </>)}
          {part("rf", [504, 296, 72, 44], <>
            <path d={zig(510, 310, 570, 310)} />
            <Txt x={540} y={332} tone="ink" anchor="middle">Rf 200 kΩ</Txt>
          </>)}
          {part("u1a", [496, 188, 90, 92], <>
            <path d="M500 194V274L580 234Z" />
            <path d={ground(530, 272)} />
            <Txt x={507} y={218} size={13}>+</Txt>
            <Txt x={507} y={258} size={13}>−</Txt>
            <Txt x={538} y={238} size={10} anchor="middle">U1A</Txt>
            <Txt x={520} y={150} size={12} tone="ink" anchor="end">LM358 · U1A</Txt>
            <Txt x={520} y={166} tone="ink" anchor="end" mono>G = Rf / Rin = ×20</Txt>
          </>)}

          {part("r1", [674, 200, 62, 40], <>
            <path d={zig(680, 234, 730, 234)} />
            <Txt x={705} y={219} tone="ink" anchor="middle">R1 10 kΩ</Txt>
          </>)}
          {part("r2", [769, 200, 62, 40], <>
            <path d={zig(775, 234, 825, 234)} />
            <Txt x={800} y={219} tone="ink" anchor="middle">R2 10 kΩ</Txt>
          </>)}
          {part("c1", [836, 118, 70, 50], <>
            <path d="M866 138V162M874 138V162" />
            <Txt x={870} y={130} tone="ink" anchor="middle">C1 100 nF</Txt>
          </>)}
          {part("c2", [776, 258, 92, 50], <>
            <path d="M836 270H860M836 278H860" />
            <path d={ground(848, 294)} />
            <Txt x={830} y={279} tone="ink" anchor="end">C2 47 nF</Txt>
          </>)}
          {part("u1b", [886, 214, 90, 86], <>
            <path d="M890 214V294L970 254Z" />
            <Txt x={897} y={238} size={13}>+</Txt>
            <Txt x={897} y={278} size={13}>−</Txt>
            <Txt x={928} y={258} size={10} anchor="middle">U1B</Txt>
          </>)}

          {part("arduino", [1058, 92, 84, 242], <>
            <rect x={1062} y={96} width={76} height={234} rx={8} />
            <Txt x={1070} y={124} size={10}>5V</Txt>
            <Txt x={1070} y={258} size={10}>A0</Txt>
            <Txt x={1070} y={310} size={10}>GND</Txt>
            <Txt x={1100} y={166} size={13} tone="ink" weight={600} anchor="middle">Arduino</Txt>
            <Txt x={1100} y={182} anchor="middle">Uno R3</Txt>
            <Txt x={1100} y={210} size={10} tone="muted" anchor="middle">ATmega328P</Txt>
            <Txt x={1100} y={224} size={10} tone="muted" anchor="middle">10-bit ADC</Txt>
          </>)}
          {part("laptop", [1146, 160, 82, 96], <>
            <rect x={1166} y={172} width={50} height={34} rx={3} />
            <path d="M1158 212H1224" strokeWidth={3} />
            <path d="M1174 192l6-6 5 10 6-12 5 8 5-4 6 4" stroke="var(--series)" strokeWidth={1.5} />
            <Txt x={1152} y={184} size={9} tone="muted" anchor="middle">USB</Txt>
            <Txt x={1191} y={232} size={12} tone="ink" anchor="middle">Laptop</Txt>
            <Txt x={1191} y={248} anchor="middle">Python · RF</Txt>
          </>)}
          {part("gnd", [56, 392, 990, 38], <>
            <path d="M60 400H1040M140 400V408" />
            <path d={ground(140, 408)} />
            <Txt x={620} y={424} anchor="middle">Common ground: 12 V (−) tied to Arduino GND</Txt>
          </>)}

          <path ref={flow} d="M60 222V96H240V126M240 174V224M240 284V400H60V246" stroke="var(--series)" strokeWidth={3.5}
            strokeDasharray="0 14" pointerEvents="none" />

          <Probe x={190} y={96} tx={156} ty={52} label="I motor" c="i" unit="A" digits={3} />
          <Probe x={240} y={214} tx={252} ty={174} label="V shunt" c="vs" unit="mV" digits={1} />
          <Probe x={600} y={234} tx={566} ty={184} label="V amp" c="va" unit="V" digits={3} />
          <Probe x={985} y={200} tx={910} ty={180} label="V filt" c="vf" unit="V" digits={3} />
          <Probe x={1036} y={254} tx={1014} ty={264} w={44} label="ADC" c="adc" unit="" digits={0} />
        </svg>
      </div>
      {tip && p && (
        <div role="tooltip" className="pointer-events-none absolute z-10 w-64 rounded-xl border border-line bg-surface-2 p-3 text-xs shadow-lg"
          style={{ left: tip.x, top: tip.y, transform: tip.below ? "translateY(8px)" : "translateY(calc(-100% - 8px))" }}>
          <p className="font-medium text-ink">{p.name}</p>
          <p className="mt-0.5 tabular-nums text-ink-2">{p.value}</p>
          <p className="mt-2 leading-relaxed text-ink-2">{p.role}</p>
          <p className="mt-2 rounded-md bg-surface px-2 py-1 font-mono text-[11px] text-ink">{p.formula}</p>
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-ink-2">
        Hover, tap or tab to any part for its value, role and formula. Probe tags show live 0.1 s averages; the dots on the
        motor loop flow at a speed set by the measured current.
      </p>
    </div>
  );
}
