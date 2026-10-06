import { STATUS } from "@/components/ui";
import { type Channel, getState, recentMean } from "@/lib/telemetry";

export type PartId = "motor" | "rig" | "shunt" | "amp" | "opamp" | "filter" | "arduino" | "laptop" | "adapter" | "breadboard";

export const PARTS: Record<PartId, { name: string; short: string; spec: string; role: string }> = {
  motor: {
    name: "12 V geared DC motor", short: "Motor", spec: "≈200 RPM output · 30:1 gearbox · L bracket",
    role: "The machine being watched. Load and friction change how much current it draws, and that current is the only thing the AI ever sees.",
  },
  rig: {
    name: "Pulley, belt and brake", short: "Load rig", spec: "Belt to a load drum · screw-down brake pad",
    role: "Creates the faults on purpose. The belt drags a load drum (overload); the pad rubs the pulley once per turn (mechanical fault).",
  },
  shunt: {
    name: "Shunt resistor", short: "Shunt", spec: "0.1 Ω · 2 W cement · low side",
    role: "Sits between the motor and ground and turns current into a small voltage: V = I × 0.1 Ω, so 0.5 A gives 50 mV.",
  },
  opamp: {
    name: "LM358 dual op-amp", short: "LM358", spec: "Runs from the Arduino 5 V · output saturates ≈3.5 V",
    role: "One chip, two amplifiers. Half A is the differential amplifier, half B the Sallen-Key low-pass filter.",
  },
  amp: {
    name: "Differential amplifier", short: "Diff amp", spec: "10 kΩ in ×2 · 200 kΩ ×2 · gain 200k / 10k = ×20",
    role: "LM358 half A. Multiplies the millivolt shunt signal by 20 so the ADC can resolve it, and rejects noise common to both inputs.",
  },
  filter: {
    name: "Sallen-Key low-pass", short: "Filter", spec: "10 kΩ ×2 · 100 nF + 47 nF · fc 232 Hz · Q 0.73",
    role: "LM358 half B at unity gain. Strips the ≈600 Hz commutator ripple and noise before sampling, so the 1 kHz ADC does not alias.",
  },
  arduino: {
    name: "Arduino Uno R3", short: "Arduino", spec: "ATmega328P · 10-bit ADC on A0 · 1 kHz · USB serial",
    role: "Samples the filtered voltage 1000 times a second and streams the counts to the laptop. Its 5 V pin also powers the op-amp.",
  },
  laptop: {
    name: "Laptop running the model", short: "Laptop", spec: "Python · 11 features · Random Forest of 100 trees",
    role: "Cuts the stream into 1 s windows, extracts features (RMS, crest factor, spectrum…) and lets 100 decision trees vote on the condition.",
  },
  adapter: {
    name: "12 V 2 A adapter", short: "12 V supply", spec: "12 V DC · 2 A max · ground shared with the Arduino",
    role: "Powers the motor through the back rails. Its ground is tied to the Arduino ground so every voltage shares one reference.",
  },
  breadboard: {
    name: "Breadboard", short: "Breadboard", spec: "830 points · 12 V rails at the back, 5 V at the front",
    role: "Holds the analog front end. The back rails carry 12 V for the motor, the front rails 5 V from the Arduino; a jumper joins the grounds.",
  },
};

export const BOM: { item: string; qty?: number; price: [number, number]; part?: PartId }[] = [
  { item: "Arduino Uno R3 (compatible)", price: [300, 400], part: "arduino" },
  { item: "12 V DC geared motor, 100–300 RPM", price: [150, 300], part: "motor" },
  { item: "12 V 2 A DC adapter", price: [300, 450], part: "adapter" },
  { item: "LM358P op-amp", qty: 2, price: [30, 50], part: "opamp" },
  { item: "0.1 Ω 2 W shunt resistor", qty: 3, price: [30, 60], part: "shunt" },
  { item: "10 kΩ potentiometer", qty: 2, price: [20, 40] },
  { item: "830-point breadboard", qty: 2, price: [150, 250], part: "breadboard" },
  { item: "Jumper wires M–M", price: [80, 120] },
  { item: "Jumper wires M–F", price: [80, 120] },
  { item: "Resistor assortment", price: [100, 200], part: "amp" },
  { item: "Capacitor assortment", price: [100, 200], part: "filter" },
  { item: "USB cable for Arduino", price: [100, 150], part: "arduino" },
  { item: "Motor mounting bracket", price: [100, 200], part: "motor" },
  { item: "Pulley / wheel + rubber belt", price: [100, 200], part: "rig" },
  { item: "Misc wires and connectors", price: [100, 100] },
];

export const rupees = ([lo, hi]: [number, number]) =>
  lo === hi ? `₹${lo.toLocaleString("en-IN")}` : `₹${lo.toLocaleString("en-IN")}–${hi.toLocaleString("en-IN")}`;
export const TOTAL = BOM.reduce<[number, number]>((s, b) => [s[0] + b.price[0], s[1] + b.price[1]], [0, 0]);

const mean = (c: Channel, d: number, unit: string) => {
  const v = recentMean(c, 100);
  return Number.isFinite(v) ? `${v.toFixed(d)} ${unit}` : "—";
};

/** Live reading for a part, read straight from the telemetry store. */
export function reading(id: PartId): string {
  const { frame, status } = getState();
  if (status !== "live" || !frame) return "No data · backend offline";
  const t = frame.truth;
  switch (id) {
    case "motor": return `${mean("i", 3, "A")} · ${t.rpm.toFixed(0)} RPM`;
    case "rig": return t.condition === "normal" ? "Disengaged · free running" : `${STATUS[t.condition].short} · ${Math.round(t.severity * 100)}%`;
    case "shunt": return `${mean("vs", 1, "mV")} across 0.1 Ω`;
    case "amp": return `${mean("va", 3, "V")} out`;
    case "opamp": return `A ${mean("va", 2, "V")} · B ${mean("vf", 2, "V")}`;
    case "filter": return `${mean("vf", 3, "V")} out`;
    case "arduino": {
      const v = recentMean("adc", 100);
      return Number.isFinite(v) ? `A0 = ${Math.round(v)} / 1023` : "—";
    }
    case "laptop": return `${STATUS[frame.label].label} · ${(Math.max(...frame.probs) * 100).toFixed(0)}%`;
    case "adapter": return `12 V · ${mean("i", 2, "A")} drawn`;
    case "breadboard": return "12 V and 5 V rails · common ground";
  }
}
