import * as THREE from "three";
import { FS, getState, latest, now, oldest, sample } from "@/lib/telemetry";
import { CLASSES, type ClassName } from "@/lib/telemetry";
import { STATUS } from "@/components/ui";
import { P, RAILS, ROWS, railHole } from "./kit";

const FONT = "Arial, Helvetica, sans-serif";
type G = CanvasRenderingContext2D;

export function paint(w: number, h: number, draw: (g: G) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function text(g: G, s: string, x: number, y: number, px: number, color: string, opts: { align?: CanvasTextAlign; weight?: number; rot?: number } = {}) {
  g.save();
  g.translate(x, y);
  if (opts.rot) g.rotate(opts.rot);
  g.font = `${opts.weight ?? 600} ${px}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = opts.align ?? "center";
  g.textBaseline = "middle";
  g.fillText(s, 0, 0);
  g.restore();
}

/** Arduino Uno R3 top: copper traces, mounting holes and the white silkscreen. 20 px per mm. */
export const unoTop = () =>
  paint(1372, 1068, (g) => {
    const S = 20, H = 53.4;
    const X = (mm: number) => mm * S, Yp = (mm: number) => (H - mm) * S;
    g.fillStyle = "#0b7d85";
    g.fillRect(0, 0, 1372, 1068);
    const r = rng(11);
    g.lineCap = g.lineJoin = "round";
    for (let k = 0; k < 90; k++) {
      let x = 4 + r() * 60, y = 4 + r() * 46;
      g.strokeStyle = `rgba(110,215,215,${0.12 + r() * 0.1})`;
      g.lineWidth = 3 + r() * 5;
      g.beginPath();
      g.moveTo(X(x), Yp(y));
      for (let s = 0; s < 3; s++) {
        const a = Math.floor(r() * 8) * (Math.PI / 4), d = 2 + r() * 10;
        x = Math.min(66, Math.max(2, x + Math.cos(a) * d));
        y = Math.min(51, Math.max(2, y + Math.sin(a) * d));
        g.lineTo(X(x), Yp(y));
      }
      g.stroke();
      g.fillStyle = "#c9a85a";
      g.beginPath();
      g.arc(X(x), Yp(y), 7, 0, Math.PI * 2);
      g.fill();
    }
    for (const [x, y] of [[14, 2.5], [15.3, 50.7], [66.1, 7.6], [66.1, 35.5]]) {
      g.fillStyle = "#d8bb6a";
      g.beginPath();
      g.arc(X(x), Yp(y), 62, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#11151a";
      g.beginPath();
      g.arc(X(x), Yp(y), 34, 0, Math.PI * 2);
      g.fill();
    }
    const W = "#f3f6f6";
    g.strokeStyle = W;
    g.lineWidth = 4;
    const digital: [string, number][] = [["AREF", 23.88], ["GND", 26.42], ["13", 28.96], ["12", 31.5], ["~11", 34.04], ["~10", 36.58], ["~9", 39.12], ["8", 41.66],
      ["7", 45.72], ["~6", 48.26], ["~5", 50.8], ["4", 53.34], ["~3", 55.88], ["2", 58.42], ["TX→1", 60.96], ["RX←0", 63.5]];
    for (const [s, x] of digital) text(g, s, X(x), Yp(48.3), 30, W, { align: "right", rot: -Math.PI / 2 });
    const bottom: [string, number][] = [["IOREF", 30.48], ["RESET", 33.02], ["3V3", 35.56], ["5V", 38.1], ["GND", 40.64], ["GND", 43.18], ["VIN", 45.72],
      ["A0", 50.8], ["A1", 53.34], ["A2", 55.88], ["A3", 58.42], ["A4", 60.96], ["A5", 63.5]];
    for (const [s, x] of bottom) text(g, s, X(x), Yp(4.4), 30, W, { align: "left", rot: -Math.PI / 2 });
    for (const [x0, x1, y] of [[17.5, 42.9, 50.8], [44.5, 64.8, 50.8], [26.7, 47, 2.54], [49.5, 64.8, 2.54]]) g.strokeRect(X(x0), Yp(y + 1.5), X(x1 - x0), 3 * S);
    text(g, "DIGITAL (PWM~)", X(47), Yp(39.6), 36, W);
    text(g, "POWER", X(37), Yp(10.8), 30, W);
    text(g, "ANALOG IN", X(57), Yp(10.8), 30, W);
    text(g, "UNO", X(44), Yp(30.5), 190, W, { weight: 800 });
    text(g, "R3", X(60.5), Yp(27.5), 52, W, { weight: 700 });
    text(g, "L", X(23.2), Yp(43), 30, W, { align: "right" });
    text(g, "TX", X(23.2), Yp(40.6), 30, W, { align: "right" });
    text(g, "RX", X(23.2), Yp(38.2), 30, W, { align: "right" });
    text(g, "ON", X(58), Yp(38.2), 30, W, { align: "right" });
    text(g, "RESET", X(6.8), Yp(45.6), 26, W);
    text(g, "ICSP", X(61.4), Yp(27), 26, W, { rot: -Math.PI / 2 });
  });

/** 830-point breadboard top. Canvas left = -x, top = far side (-z). 120 px per cm. */
export const breadboardTop = () =>
  paint(1980, 660, (g) => {
    const S = 120;
    const X = (x: number) => (x + 8.25) * S, Z = (z: number) => (z + 2.75) * S;
    g.fillStyle = "#f2eee3";
    g.fillRect(0, 0, 1980, 660);
    const ch = g.createLinearGradient(0, Z(-0.17), 0, Z(0.17));
    ch.addColorStop(0, "#cfc8b6");
    ch.addColorStop(0.5, "#b9b19d");
    ch.addColorStop(1, "#d9d3c3");
    g.fillStyle = ch;
    g.fillRect(0, Z(-0.17), 1980, 0.34 * S);
    const stripe = (z: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(X(-7.9), Z(z) - 3, X(7.9) - X(-7.9), 6);
    };
    stripe(-2.62, "#d23c3c");
    stripe(-1.96, "#2f62c8");
    stripe(1.96, "#2f62c8");
    stripe(2.62, "#d23c3c");
    const hole = (x: number, z: number) => {
      g.fillStyle = "#8f8a7c";
      g.fillRect(X(x) - 8, Z(z) - 8, 16, 16);
      g.fillStyle = "#1f1e1b";
      g.fillRect(X(x) - 6, Z(z) - 6, 12, 12);
    };
    const rows = "abcdefghij";
    for (let c = 1; c <= 63; c++) {
      const x = (c - 32) * P;
      for (const r of rows) hole(x, ROWS[r as keyof typeof ROWS]);
      if (railHole(c)) for (const r of RAILS) hole(x, ROWS[r]);
      if (c === 1 || c % 5 === 0) {
        text(g, String(c), X(x), Z(1.72), 17, "#8a857a", { weight: 500 });
        text(g, String(c), X(x), Z(-1.72), 17, "#8a857a", { weight: 500, rot: Math.PI });
      }
    }
    for (const r of rows) {
      const z = ROWS[r as keyof typeof ROWS];
      text(g, r, X(-8.08), Z(z), 18, "#8a857a", { weight: 500 });
      text(g, r, X(8.08), Z(z), 18, "#8a857a", { weight: 500 });
    }
    for (const [z, s] of [[-2.413, "+"], [-2.159, "−"], [2.159, "−"], [2.413, "+"]] as const) {
      text(g, s, X(-8.07), Z(z), 24, s === "+" ? "#c43636" : "#2f62c8", { weight: 700 });
      text(g, s, X(8.07), Z(z), 24, s === "+" ? "#c43636" : "#2f62c8", { weight: 700 });
    }
  });

/** Self-healing cutting mat: 1 cm grid, 5 cm major lines, ruler along two edges. 20 px per cm. */
export const matTop = (w: number, d: number) =>
  paint(w * 20, d * 20, (g) => {
    const S = 20;
    g.fillStyle = "#24403a";
    g.fillRect(0, 0, w * S, d * S);
    const r = rng(3);
    for (let k = 0; k < 9000; k++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.035})`;
      g.fillRect(r() * w * S, r() * d * S, 2, 2);
    }
    const m = 3;
    for (let x = m; x <= w - m; x++) {
      g.fillStyle = x % 5 ? "rgba(220,240,230,0.09)" : "rgba(220,240,230,0.2)";
      g.fillRect(x * S - (x % 5 ? 0.5 : 1), m * S, x % 5 ? 1 : 2, (d - 2 * m) * S);
    }
    for (let z = m; z <= d - m; z++) {
      g.fillStyle = z % 5 ? "rgba(220,240,230,0.09)" : "rgba(220,240,230,0.2)";
      g.fillRect(m * S, z * S - (z % 5 ? 0.5 : 1), (w - 2 * m) * S, z % 5 ? 1 : 2);
    }
    g.fillStyle = "rgba(230,245,238,0.45)";
    for (let x = m; x <= w - m; x++) {
      const t = x % 10 === 0 ? 22 : x % 5 === 0 ? 15 : 8;
      g.fillRect(x * S - 1, m * S - t - 4, 2, t);
      if (x % 10 === 0 && x > m) text(g, String(x - m), x * S, m * S - 40, 16, "rgba(230,245,238,0.5)", { weight: 500 });
    }
    for (let z = m; z <= d - m; z++) {
      const t = z % 10 === 0 ? 22 : z % 5 === 0 ? 15 : 8;
      g.fillRect(m * S - t - 4, z * S - 1, t, 2);
    }
    text(g, "SELF-HEALING CUTTING MAT · A1", w * S - m * S, d * S - 30, 18, "rgba(230,245,238,0.35)", { align: "right", weight: 500 });
  });

/** Small printed label: dark or light body with centred lines of text. */
export const label = (w: number, h: number, bg: string, fg: string, lines: [string, number][], extra?: (g: G) => void) =>
  paint(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    extra?.(g);
    const total = lines.reduce((s, [, px]) => s + px * 1.25, 0);
    let y = (h - total) / 2;
    for (const [s, px] of lines) {
      text(g, s, w / 2, y + px * 0.62, px, fg, { weight: 700 });
      y += px * 1.25;
    }
  });

/** DIP package top: notch at +x (canvas right) and pin-1 dot at the far +x corner. */
export const dipTop = (w: number, h: number, lines: [string, number][]) =>
  label(w, h, "#18181a", "#9b9b9b", lines, (g) => {
    g.fillStyle = "#0c0c0d";
    g.beginPath();
    g.arc(w, h / 2, h * 0.16, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(w - h * 0.2, h * 0.2, h * 0.07, 0, Math.PI * 2);
    g.fill();
  });

// ---- laptop screen: a mini live dashboard ----
let tokens: Record<string, string> = {};
const token = (n: string, fallback: string) =>
  (tokens[n] ??= getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fallback);
if (typeof window !== "undefined") matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => (tokens = {}));
export const statusColor = (c: ClassName) => token(`--${c === "normal" ? "good" : c === "overload" ? "warning" : "critical"}`, "#888");

function glyph(g: G, c: ClassName, x: number, y: number, r: number) {
  g.fillStyle = statusColor(c);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = STATUS[c].onColor;
  g.lineWidth = r * 0.24;
  g.lineCap = g.lineJoin = "round";
  g.beginPath();
  const k = r / 12;
  if (c === "normal") {
    g.moveTo(x - 7 * k, y + 0.5 * k);
    g.lineTo(x - 2.5 * k, y + 5 * k);
    g.lineTo(x + 7 * k, y - 4.5 * k);
  } else if (c === "overload") {
    g.moveTo(x, y - 6.5 * k);
    g.lineTo(x, y + 1.5 * k);
    g.moveTo(x, y + 6.5 * k);
    g.lineTo(x, y + 6.6 * k);
  } else {
    g.moveTo(x - 5 * k, y - 5 * k);
    g.lineTo(x + 5 * k, y + 5 * k);
    g.moveTo(x + 5 * k, y - 5 * k);
    g.lineTo(x - 5 * k, y + 5 * k);
  }
  g.stroke();
}

export function drawScreen(g: G, W: number, H: number) {
  const { frame, hello, status } = getState();
  const live = status === "live" && !!frame;
  g.fillStyle = "#0e1013";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#16191d";
  g.fillRect(0, 0, W, 40);
  text(g, "Motor Fault Detector", 22, 20, 16, "#e9eaec", { align: "left" });
  g.fillStyle = live ? statusColor("normal") : "#6b7078";
  g.beginPath();
  g.arc(W - 128, 20, 5, 0, Math.PI * 2);
  g.fill();
  text(g, live ? "Live · 1000 Hz" : "Offline", W - 116, 20, 14, "#a7acb3", { align: "left", weight: 500 });

  text(g, "AI PREDICTION", 28, 70, 12, "#8b9097", { align: "left" });
  if (live) {
    glyph(g, frame.label, 52, 112, 24);
    text(g, STATUS[frame.label].label, 90, 113, 36, "#f4f5f6", { align: "left", weight: 700 });
    text(g, `Confidence ${(Math.max(...frame.probs) * 100).toFixed(1)}%`, 28, 160, 16, "#c3c6cb", { align: "left", weight: 500 });
    CLASSES.forEach((c, j) => {
      const y = 72 + j * 34, x0 = W - 300;
      g.fillStyle = statusColor(c);
      g.beginPath();
      g.arc(x0 + 5, y, 5, 0, Math.PI * 2);
      g.fill();
      text(g, STATUS[c].short, x0 + 16, y, 13, "#c3c6cb", { align: "left", weight: 500 });
      text(g, `${(frame.probs[j] * 100).toFixed(0)}%`, W - 28, y, 13, "#e9eaec", { align: "right" });
      g.fillStyle = "#23272d";
      g.fillRect(x0 + 90, y - 3, 140, 6);
      g.fillStyle = statusColor(c);
      g.fillRect(x0 + 90, y - 3, 140 * frame.probs[j], 6);
    });
  } else {
    text(g, "Waiting for Arduino…", 28, 112, 30, "#c3c6cb", { align: "left", weight: 700 });
  }

  const L = 64, R = W - 24, T = 210, B = H - 64;
  text(g, "Motor current · last 2 s", 28, T - 18, 13, "#8b9097", { align: "left" });
  g.font = `500 12px ${FONT}`;
  for (const a of [0, 0.4, 0.8, 1.2]) {
    const y = B - (a / 1.2) * (B - T);
    g.fillStyle = a ? "#20242a" : "#353a42";
    g.fillRect(L, Math.round(y), R - L, 1);
    text(g, `${a.toFixed(1)} A`, L - 10, y, 12, "#7d828a", { align: "right", weight: 500 });
  }
  if (live) {
    const t1 = now(), t0 = t1 - 2;
    const k0 = Math.max(Math.ceil(t0 * FS), oldest()), k1 = Math.min(Math.floor(t1 * FS), latest() - 1);
    if (k1 > k0) {
      g.beginPath();
      for (let k = k0; k <= k1; k += 2) {
        const x = L + ((k / FS - t0) / 2) * (R - L), y = B - (Math.min(Math.max(sample("i", k), 0), 1.2) / 1.2) * (B - T);
        if (k === k0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokeStyle = token("--series", "#3987e5");
      g.lineWidth = 2;
      g.stroke();
    }
  }
  g.fillStyle = "#16191d";
  g.fillRect(0, H - 40, W, 40);
  text(g, `Random Forest · ${hello?.model.trees ?? 100} trees · 11 features`, 22, H - 20, 13, "#a7acb3", { align: "left", weight: 500 });
  if (hello) text(g, `Test accuracy ${(hello.model.accuracy * 100).toFixed(1)}%`, W - 22, H - 20, 13, "#a7acb3", { align: "right", weight: 500 });
}
