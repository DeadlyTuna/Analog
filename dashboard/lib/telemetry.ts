import { useSyncExternalStore } from "react";

export type ClassName = "normal" | "overload" | "friction";
export const CLASSES: ClassName[] = ["normal", "overload", "friction"];
export const CHANNELS = ["i", "vs", "va", "vf", "adc"] as const;
export type Channel = (typeof CHANNELS)[number];

export type Hello = {
  source: string;
  classes: ClassName[];
  features: string[];
  circuit: { r_shunt: number; gain: number; fc: number; q: number; v_sat: number; vref: number; adc_max: number; fs: number };
  model: { accuracy: number; confusion: number[][]; importance: number[]; n_train: number; n_test: number; trees: number };
};
export type Frame = Record<Channel, number[]> & {
  t: number;
  feat: number[];
  spec: number[];
  probs: number[];
  votes: number[];
  label: ClassName;
  truth: { condition: ClassName; severity: number; rpm: number };
};
export type LogEntry = { at: number; label: ClassName; confidence: number };
export type Demo = { step: number; at: number; ms: number };
type State = { status: "connecting" | "live" | "offline"; hello?: Hello; frame?: Frame; log: LogEntry[]; demo: Demo | null };

const URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8765";
export const FS = 1000;
export const BUFFER = FS * 4; // 4 s of every stage
const DELAY = 0.15; // s of playout delay so traces scroll smoothly through network jitter

// Raw samples live outside React; canvases read them every animation frame.
export const rings = Object.fromEntries(CHANNELS.map((c) => [c, new Float32Array(BUFFER)])) as Record<Channel, Float32Array>;
let head = 0; // index of the next sample
let first = 0; // index of the first sample received
let offset: number | null = null; // client clock minus server clock, s

// Per-frame verdicts for the last 60 s (20 frames/s): frame j lives at j % HISTORY.
export const HISTORY = 60 * 20;
export const history = {
  t: new Float64Array(HISTORY), // server time, s
  pred: new Uint8Array(HISTORY), // index into CLASSES
  truth: new Uint8Array(HISTORY),
  conf: new Float32Array(HISTORY),
};
let frames = 0;
/** Frames recorded so far; the valid ones are max(0, count - HISTORY) .. count - 1. */
export const historyCount = () => frames;

const initial: State = { status: "connecting", log: [], demo: null };
let state = initial;
const listeners = new Set<() => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

let ws: WebSocket | null = null;
function connect() {
  if (ws) return;
  ws = new WebSocket(URL);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "hello") set({ hello: msg, status: "live" });
    else ingest(msg);
  };
  ws.onclose = () => {
    ws = null;
    offset = null; // next frame starts a fresh trace
    set({ status: "offline" });
    setTimeout(connect, 1000);
  };
}

function ingest(f: Frame) {
  const start = Math.round(f.t * FS);
  if (start < head - FS) frames = 0; // backend restarted: its clock went back
  if (offset === null || start < head - FS) {
    first = start; // first frame, or the backend restarted
    offset = null;
  }
  for (const c of CHANNELS) f[c].forEach((v, k) => (rings[c][(start + k) % BUFFER] = v));
  head = start + f.i.length;
  const j = frames++ % HISTORY;
  history.t[j] = f.t;
  history.pred[j] = CLASSES.indexOf(f.label);
  history.truth[j] = CLASSES.indexOf(f.truth.condition);
  history.conf[j] = Math.max(...f.probs);
  const o = performance.now() / 1000 - head / FS;
  offset = offset === null ? o : Math.min(o, offset + 5e-4); // track the fastest arrival, allow slow drift
  const log =
    state.log[0]?.label === f.label
      ? state.log
      : [{ at: Date.now(), label: f.label, confidence: Math.max(...f.probs) }, ...state.log].slice(0, 40);
  set({ frame: f, log, status: "live" });
}

/** Playback time in server seconds - always slightly behind the newest sample. */
export function now() {
  return offset === null ? head / FS : Math.min(performance.now() / 1000 - offset - DELAY, head / FS);
}
export const latest = () => head;
/** Oldest sample still valid in the rings. */
export const oldest = () => Math.max(first, head - BUFFER + 1);
export const sample = (c: Channel, k: number) => rings[c][((k % BUFFER) + BUFFER) % BUFFER];
export function recentMean(c: Channel, n: number) {
  if (head < n) return NaN;
  let s = 0;
  for (let k = head - n; k < head; k++) s += sample(c, k);
  return s / n;
}

function send(condition: ClassName, severity: number) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ condition, severity }));
}
/** Manual control: also ends the auto demo. */
export function command(condition: ClassName, severity: number) {
  stopDemo();
  send(condition, severity);
}

/** Auto demo script: [condition, severity, seconds]. Loops; lives in the module so it survives navigation. */
export const DEMO: [ClassName, number, number][] = [
  ["normal", 0.6, 8], ["overload", 0.7, 10], ["normal", 0.6, 8], ["friction", 0.6, 10],
  ["overload", 1, 10], ["normal", 0.6, 6], ["friction", 0.35, 10], ["overload", 0.4, 10],
];
let demoTimer: ReturnType<typeof setTimeout> | undefined;
function demoStep(step: number) {
  const [c, s, sec] = DEMO[step];
  send(c, s);
  set({ demo: { step, at: performance.now(), ms: sec * 1000 } });
  demoTimer = setTimeout(() => demoStep((step + 1) % DEMO.length), sec * 1000);
}
export function startDemo() {
  clearTimeout(demoTimer);
  demoStep(0);
}
export function stopDemo() {
  clearTimeout(demoTimer);
  if (state.demo) set({ demo: null });
}
/** 0..1 through the current demo step. */
export const demoProgress = () => (state.demo ? Math.min((performance.now() - state.demo.at) / state.demo.ms, 1) : 0);

export const getState = () => state;
function subscribe(l: () => void) {
  connect();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export const useTelemetry = () => useSyncExternalStore(subscribe, getState, () => initial);
