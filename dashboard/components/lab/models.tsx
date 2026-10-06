"use client";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getState } from "@/lib/telemetry";
import {
  ARD, BB, BBH, Boxes, Dupont, type Inst, LAPTOP, LAPTOP_YAW, M, P, Part, Resistor, ROWS, TY, Tube,
  ard, dupont, hole, lap, mat, staple, usePainted, v,
} from "./kit";
import { breadboardTop, dipTop, drawScreen, label, matTop, paint, unoTop } from "./textures";

const lift = (p: THREE.Vector3, y: number) => p.clone().setY(p.y + y);
const xyz = (p: THREE.Vector3) => p.toArray() as [number, number, number];

// ---- the cutting mat everything stands on ----
export const MAT = v(-7.5, 0, -7);
const MAT_W = 100, MAT_D = 52;

function Mat() {
  const top = usePainted(() => matTop(MAT_W, MAT_D));
  const mats = useMemo(() => {
    const side = mat("#1b302b", 0.8);
    return [side, side, new THREE.MeshStandardMaterial({ map: top, roughness: 0.92 }), side, side, side];
  }, [top]);
  return (
    <mesh position={[MAT.x, -0.15, MAT.z]} material={mats} receiveShadow>
      <boxGeometry args={[MAT_W, 0.3, MAT_D]} />
    </mesh>
  );
}

// ---- Arduino Uno R3 ----
const HEADERS: [n: number, x0: number, y: number][] = [[10, 18.8, 50.8], [8, 45.72, 50.8], [8, 27.94, 2.54], [6, 50.8, 2.54]];
const USB_Z = ard(0, 38.1).z;
export const USB_PLUG_END = v(ARD.x - 7.05, TY + 0.55, USB_Z);

const led = (c: string) =>
  new THREE.MeshStandardMaterial({ color: "#efe9d2", emissive: c, emissiveIntensity: 0, roughness: 0.3, toneMapped: false });

const Arduino = memo(function Arduino() {
  const top = usePainted(unoTop);
  const chip = usePainted(() => dipTop(1024, 213, [["ATMEGA328P-PU", 64], ["1845   E3", 40]]));
  const leds = useMemo(() => ({ on: led("#3dff6e"), l: led("#ffae1a"), tx: led("#ffb41f"), rx: led("#ffb41f") }), []);
  const pcb = useMemo(() => {
    const edge = mat("#08585e", 0.7);
    return [edge, edge, new THREE.MeshStandardMaterial({ map: top, roughness: 0.55, metalness: 0.05 }), edge, edge, edge];
  }, [top]);
  const chipMats = useMemo(() => {
    const b = M.black();
    return [b, b, new THREE.MeshStandardMaterial({ map: chip, roughness: 0.6 }), b, b, b];
  }, [chip]);
  const { headerHoles, pins, legs, smd } = useMemo(() => {
    const headerHoles: Inst[] = HEADERS.flatMap(([n, x0, y]) =>
      Array.from({ length: n }, (_, k) => [...xyz(ard(x0 + k * 2.54, y, TY + 0.851)), 0.1, 0.004, 0.1] as Inst));
    const pins: Inst[] = [63, 65.5].flatMap((x) => [24.5, 27, 29.5].map((y) => [...xyz(ard(x, y, TY + 0.55)), 0.064, 0.6, 0.064] as Inst));
    const c = ard(45.7, 17);
    const legs: Inst[] = Array.from({ length: 28 }, (_, k) => {
      const x = c.x + ((k % 14) - 6.5) * P, s = k < 14 ? 1 : -1;
      return [x, TY + 0.42, c.z + s * 0.4, 0.06, 0.04, 0.1] as Inst;
    });
    const smd: Inst[] = [[12, 22], [12, 24.5], [14.5, 28], [19, 21], [19, 30.5], [28, 44], [31, 44], [34, 44], [62, 32], [8, 30], [8, 33], [41, 40]]
      .map(([x, y]) => [...xyz(ard(x, y, TY + 0.03)), 0.16, 0.06, 0.08] as Inst);
    return { headerHoles, pins, legs, smd };
  }, []);

  const tx = useRef({ t: -1, until: 0 });
  useFrame(({ clock }) => {
    const { frame, status } = getState();
    const s = tx.current, t = clock.elapsedTime;
    if (frame && frame.t !== s.t) {
      s.t = frame.t;
      s.until = t + 0.025;
    }
    leds.on.emissiveIntensity = 3.2;
    leds.tx.emissiveIntensity = status === "live" && t < s.until ? 7 : 0;
  });

  return (
    <Part id="arduino">
      {[[14, 2.5], [15.3, 50.7], [66.1, 7.6], [66.1, 35.5]].map(([x, y]) => (
        <mesh key={x + y} position={xyz(ard(x, y, 0.125))} material={M.rubber()}>
          <cylinderGeometry args={[0.32, 0.32, 0.25, 16]} />
        </mesh>
      ))}
      <mesh position={[ARD.x, 0.33, ARD.z]} material={pcb} castShadow receiveShadow>
        <boxGeometry args={[6.86, 0.16, 5.34]} />
      </mesh>
      {HEADERS.map(([n, x0, y]) => (
        <mesh key={x0 + y} position={xyz(ard(x0 + ((n - 1) * 2.54) / 2, y, TY + 0.425))} material={M.black()} castShadow>
          <boxGeometry args={[n * P, 0.85, P]} />
        </mesh>
      ))}
      <Boxes items={headerHoles} material={mat("#050505", 0.9)} shadow={false} />
      {/* USB-B socket with the cable plugged in */}
      <mesh position={xyz(ard(1.8, 38.1, TY + 0.55))} material={M.steel()} castShadow>
        <boxGeometry args={[1.6, 1.1, 1.2]} />
      </mesh>
      <mesh position={[ARD.x - 4.11, TY + 0.55, USB_Z]} material={M.tin()}>
        <boxGeometry args={[0.12, 0.82, 1.0]} />
      </mesh>
      <RoundedBox args={[2, 1.0, 1.25]} radius={0.12} position={[ARD.x - 5.15, TY + 0.55, USB_Z]} material={M.dark()} castShadow />
      <mesh position={[ARD.x - 6.6, TY + 0.55, USB_Z]} rotation-z={Math.PI / 2} material={M.dark()} castShadow>
        <cylinderGeometry args={[0.2, 0.32, 0.9, 16]} />
      </mesh>
      {/* DC barrel jack */}
      <mesh position={xyz(ard(5.3, 7.6, TY + 0.55))} material={M.black()} castShadow>
        <boxGeometry args={[1.42, 1.1, 0.9]} />
      </mesh>
      <mesh position={xyz(ard(-1.85, 7.6, TY + 0.6))} rotation-z={Math.PI / 2} material={mat("#050505", 0.8)}>
        <cylinderGeometry args={[0.3, 0.3, 0.04, 20]} />
      </mesh>
      <mesh position={xyz(ard(16.5, 6.5, TY + 0.085))} material={M.black()} castShadow>
        <boxGeometry args={[0.66, 0.17, 0.62]} />
      </mesh>
      {[17.5, 23.6].map((x) => (
        <group key={x} position={xyz(ard(x, 15.6, TY))}>
          <mesh position-y={0.06} material={M.black()}>
            <boxGeometry args={[0.66, 0.12, 0.66]} />
          </mesh>
          <mesh position-y={0.42} material={M.steel()} castShadow>
            <cylinderGeometry args={[0.31, 0.31, 0.62, 20]} />
          </mesh>
        </group>
      ))}
      {/* ATmega328P in its DIP-28 socket */}
      <mesh position={xyz(ard(45.7, 17, TY + 0.16))} material={mat("#2a2b2e", 0.6)} castShadow>
        <boxGeometry args={[3.81, 0.32, 1.02]} />
      </mesh>
      <mesh position={xyz(ard(45.7, 17, TY + 0.54))} material={chipMats} castShadow>
        <boxGeometry args={[3.56, 0.36, 0.74]} />
      </mesh>
      <Boxes items={legs} material={M.tin()} />
      <RoundedBox args={[1.1, 0.36, 0.46]} radius={0.12} position={xyz(ard(24.5, 26, TY + 0.18))} material={M.steel()} castShadow />
      <mesh position={xyz(ard(16.5, 35, TY + 0.05))} material={M.black()}>
        <boxGeometry args={[0.5, 0.1, 0.5]} />
      </mesh>
      <Boxes items={smd} material={mat("#3a3631", 0.5)} shadow={false} />
      <mesh position={xyz(ard(6.8, 49.3, TY + 0.15))} material={M.steel()} castShadow>
        <boxGeometry args={[0.62, 0.3, 0.62]} />
      </mesh>
      <mesh position={xyz(ard(6.8, 49.3, TY + 0.35))} material={mat("#d8c3a0", 0.5)}>
        <cylinderGeometry args={[0.19, 0.19, 0.12, 16]} />
      </mesh>
      <mesh position={xyz(ard(64.25, 27, TY + 0.125))} material={M.black()}>
        <boxGeometry args={[0.52, 0.25, 0.76]} />
      </mesh>
      <Boxes items={pins} material={M.gold()} />
      {([[leds.l, 43], [leds.tx, 40.6], [leds.rx, 38.2]] as const).map(([m, y]) => (
        <mesh key={y} position={xyz(ard(25.4, y, TY + 0.05))} material={m}>
          <boxGeometry args={[0.2, 0.1, 0.13]} />
        </mesh>
      ))}
      <mesh position={xyz(ard(59.4, 38.2, TY + 0.05))} material={leds.on}>
        <boxGeometry args={[0.2, 0.1, 0.13]} />
      </mesh>
      <Tube points={USB_CABLE} r={0.18} material={M.dark()} />
      <Dupont a={ard(38.1, 2.54, TY + 0.85)} b={hole(4, "B+")} arch={1.6} color="#d8322f" />
      <Dupont a={ard(40.64, 2.54, TY + 0.85)} b={hole(5, "B-")} arch={1.1} color="#202022" />
      <Dupont a={A0_PIN} b={hole(22, "a")} arch={2.4} color="#f2c21b" />
    </Part>
  );
});

// ---- breadboard and the analog front end ----
const A0_PIN = ard(50.8, 2.54, TY + 0.85);
const SENSE = staple(hole(3, "f"), hole(15, "f"), 0.3);
const R1 = [hole(23, "g"), hole(27, "d")] as const;

function DiscCap({ a, b, code }: { a: THREE.Vector3; b: THREE.Vector3; code: string }) {
  const face = usePainted(() => label(128, 128, "#c9762c", "#3a1b06", [[code, 46]]));
  const g = useMemo(() => {
    const d = v(b.x - a.x, 0, b.z - a.z).normalize();
    let n = v(d.z, 0, -d.x);
    if (n.x * 0.5 + n.z * 0.86 < 0) n = n.negate();
    const c = a.clone().lerp(b, 0.5).setY(a.y + 0.72);
    const leg = (h: THREE.Vector3, s: number) => {
      const t = c.clone().addScaledVector(d, s * 0.1).setY(c.y - 0.2);
      return [t, lift(t, -0.12), lift(h, 0.16), lift(h, -0.1)];
    };
    return { c, quat: new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), n), legs: [leg(a, -1), leg(b, 1)] };
  }, [a, b]);
  const mats = useMemo(() => {
    const body = mat("#c9762c", 0.45);
    return [body, new THREE.MeshStandardMaterial({ map: face, roughness: 0.45 }), body];
  }, [face]);
  return (
    <group>
      <mesh position={g.c} quaternion={g.quat} material={mats} castShadow>
        <cylinderGeometry args={[0.27, 0.27, 0.13, 24]} />
      </mesh>
      {g.legs.map((pts, k) => <Tube key={k} points={pts} r={0.02} material={M.tin()} />)}
    </group>
  );
}

function Shunt() {
  const face = usePainted(() => label(512, 160, "#ecebe5", "#1f1f1f", [["2W  0.1ΩJ", 72]]));
  const mats = useMemo(() => {
    const s = mat("#e6e4dc", 0.85);
    const f = new THREE.MeshStandardMaterial({ map: face, roughness: 0.85 });
    return [s, s, f, s, f, s];
  }, [face]);
  const a = hole(3, "h"), b = hole(11, "h"), y = BBH + 0.45;
  const leads = useMemo(() => [
    [lift(a, -0.1), lift(a, 0.3), a.clone().setY(y).setX(a.x + 0.06), a.clone().setY(y).setX(a.x + 0.2)],
    [lift(b, -0.1), lift(b, 0.3), b.clone().setY(y).setX(b.x - 0.06), b.clone().setY(y).setX(b.x - 0.2)],
  ], [a, b, y]);
  return (
    <Part id="shunt">
      <mesh position={[(a.x + b.x) / 2, y, a.z]} material={mats} castShadow>
        <boxGeometry args={[1.72, 0.56, 0.56]} />
      </mesh>
      {leads.map((pts, k) => <Tube key={k} points={pts} r={0.04} material={M.tin()} />)}
    </Part>
  );
}

function LM358() {
  const top = usePainted(() => dipTop(470, 320, [["LM358P", 78], ["2341  Z4", 48]]));
  const mats = useMemo(() => {
    const b = M.black();
    return [b, b, new THREE.MeshStandardMaterial({ map: top, roughness: 0.6 }), b, b, b];
  }, [top]);
  const legs = useMemo(() => [20, 21, 22, 23].flatMap((c) => [1, -1].flatMap((s) => {
    const p = hole(c, "e");
    return [[p.x, BBH + 0.13, BB.z + s * 0.36, 0.05, 0.03, 0.08], [p.x, BBH + 0.03, BB.z + s * ROWS.e, 0.05, 0.22, 0.025]] as Inst[];
  })), []);
  return (
    <Part id="opamp">
      <mesh position={[(hole(20, "e").x + hole(23, "e").x) / 2, BBH + 0.23, BB.z]} material={mats} castShadow>
        <boxGeometry args={[0.94, 0.33, 0.64]} />
      </mesh>
      <Boxes items={legs} material={M.tin()} />
    </Part>
  );
}

const Breadboard = memo(function Breadboard() {
  const top = usePainted(breadboardTop);
  const mats = useMemo(() => {
    const s = mat("#ebe6d8", 0.6);
    return [s, s, new THREE.MeshStandardMaterial({ map: top, roughness: 0.62 }), s, s, s];
  }, [top]);
  const wire = (c: string) => mat(c, 0.45);
  return (
    <>
      <Part id="breadboard">
        <mesh position={[BB.x, BBH / 2, BB.z]} material={mats} castShadow receiveShadow>
          <boxGeometry args={[16.5, BBH, 5.5]} />
        </mesh>
        <Tube points={staple(hole(11, "j"), hole(11, "T-"))} r={0.05} material={wire("#202022")} />
        <Tube points={staple(hole(20, "j"), hole(19, "T-"))} r={0.05} material={wire("#202022")} />
        <Tube points={staple(hole(23, "a"), hole(24, "B+"))} r={0.05} material={wire("#d8322f")} />
        <Tube points={staple(hole(61, "T-"), hole(61, "B-"), 0.3)} r={0.05} material={wire("#202022")} />
      </Part>
      <Shunt />
      <LM358 />
      <Part id="amp">
        <Tube points={SENSE} r={0.05} material={wire("#ee7d1f")} />
        <Resistor a={hole(15, "h")} b={hole(21, "h")} ohms={10e3} />
        <Resistor a={hole(22, "j")} b={hole(22, "T-")} ohms={10e3} />
        <Resistor a={hole(21, "i")} b={hole(20, "i")} ohms={200e3} />
        <Resistor a={hole(22, "h")} b={hole(23, "h")} ohms={200e3} />
      </Part>
      <Part id="filter">
        <Resistor a={R1[0]} b={R1[1]} ohms={10e3} />
        <Resistor a={hole(27, "b")} b={hole(20, "b")} ohms={10e3} />
        <DiscCap a={hole(27, "c")} b={hole(22, "c")} code="104" />
        <DiscCap a={hole(20, "a")} b={hole(21, "B-")} code="473" />
        <Tube points={staple(hole(21, "d"), hole(22, "d"), 0.12)} r={0.05} material={wire("#2e9e4f")} />
      </Part>
    </>
  );
});

// ---- laptop ----
const KEY_ROWS = [Array(14).fill(1), [...Array(13).fill(1), 1.6], [1.6, ...Array(12).fill(1), 1], [1.85, ...Array(11).fill(1), 1.75], [2.35, ...Array(10).fill(1), 2.25], [1, 1, 1, 1.25, 5.6, 1.25, 1, 1, 1]];
const KEY_Z = [-8.5, -7.15, -5.35, -3.55, -1.75, 0.05];
const LID_TILT = -0.28;
export const SCREEN = lap(0, 1.5 + 10.65 * Math.cos(LID_TILT), -10.35 + 10.65 * Math.sin(LID_TILT) + 0.5);
const LAPTOP_PLUG = lap(18.4, 0.75, 3);

const Laptop = memo(function Laptop() {
  const screen = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 500;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { g: c.getContext("2d")!, t, m: new THREE.MeshBasicMaterial({ map: t, color: "#dcdcdc", toneMapped: false }) };
  }, []);
  useEffect(() => () => screen.t.dispose(), [screen]);
  const acc = useRef(1);
  useFrame((_, dt) => {
    if ((acc.current += dt) < 1 / 30) return;
    acc.current = 0;
    drawScreen(screen.g, 800, 500);
    screen.t.needsUpdate = true;
  });
  const keys = useMemo(() => KEY_ROWS.flatMap((row, r) => {
    const u = 1.8, w = row.reduce((s, k) => s + k, 0) * u;
    let x = -w / 2;
    return row.map((k) => {
      const item: Inst = [x + (k * u) / 2, 1.56, KEY_Z[r], k * u - 0.28, 0.12, r ? 1.52 : 0.8];
      x += k * u;
      return item;
    });
  }), []);
  const alu = mat("#c3c7cd", 0.3, 0.9);
  return (
    <Part id="laptop">
      <group position={LAPTOP} rotation-y={LAPTOP_YAW}>
        <RoundedBox args={[30.4, 1.5, 21.2]} radius={0.55} smoothness={4} position-y={0.75} material={alu} castShadow receiveShadow />
        <Boxes items={keys} material={mat("#1e1f22", 0.55)} />
        <mesh position={[0, 1.502, 5.6]} rotation-x={-Math.PI / 2} material={mat("#b3b8bf", 0.22, 0.85)}>
          <planeGeometry args={[11.5, 7]} />
        </mesh>
        <mesh position={[0, 1.4, -10.45]} rotation-z={Math.PI / 2} material={mat("#3a3d42", 0.4, 0.7)}>
          <cylinderGeometry args={[0.42, 0.42, 25, 16]} />
        </mesh>
        <group position={[0, 1.5, -10.35]} rotation-x={LID_TILT}>
          <RoundedBox args={[30.4, 20.6, 0.5]} radius={0.24} smoothness={4} position={[0, 10.3, -0.26]} material={alu} castShadow />
          <mesh position={[0, 10.3, 0.004]} material={mat("#0a0a0b", 0.2)}>
            <planeGeometry args={[30, 20.2]} />
          </mesh>
          <mesh position={[0, 10.65, 0.01]} material={screen.m}>
            <planeGeometry args={[28, 17.5]} />
          </mesh>
          <mesh position={[0, 19.85, 0.012]} material={mat("#1d2733", 0.2)}>
            <circleGeometry args={[0.12, 12]} />
          </mesh>
        </group>
        {/* USB-A plug in the right-hand port */}
        <mesh position={[15.2, 0.75, 3]} material={mat("#050505", 0.8)}>
          <boxGeometry args={[0.05, 0.5, 1.3]} />
        </mesh>
        <mesh position={[15.38, 0.75, 3]} material={M.tin()}>
          <boxGeometry args={[0.36, 0.46, 1.2]} />
        </mesh>
        <RoundedBox args={[1.9, 0.82, 1.5]} radius={0.12} position={[16.5, 0.75, 3]} material={M.dark()} castShadow />
        <mesh position={[17.9, 0.75, 3]} rotation-z={-Math.PI / 2} material={M.dark()} castShadow>
          <cylinderGeometry args={[0.2, 0.3, 0.9, 16]} />
        </mesh>
      </group>
    </Part>
  );
});

const USB_CABLE = [
  LAPTOP_PLUG, v(-8.4, 0.55, -11.75), v(-6.6, 0.2, -11.6), v(-5.2, 0.2, -8.5), v(-5.4, 0.2, -3.5),
  v(-7.6, 0.2, 0.8), v(-8.9, 0.22, 3.4), v(-8.4, 0.55, USB_Z), v(-7.7, 0.92, USB_Z), USB_PLUG_END,
];

// ---- 12 V adapter and the DC-jack screw terminal behind the breadboard ----
const BRICK = v(31, 0, -3);
const BRICK_YAW = -0.35;
const brk = (x: number, y: number, z: number) => v(x, y, z).applyAxisAngle(v(0, 1, 0), BRICK_YAW).add(BRICK);
const JACK = v(24.2, 0, 2.3);

const Adapter = memo(function Adapter() {
  const sticker = usePainted(() => label(480, 300, "#d6d8db", "#222", [["12V ⎓ 2A", 64], ["INPUT 100–240V~ 50/60Hz", 24], ["OUTPUT 12.0V ⎓ 2.0A · 24W", 24]]));
  const power = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d9ffe0", emissive: "#2dff6a", emissiveIntensity: 3, toneMapped: false }), []);
  const cables = useMemo(() => ({
    dc: [brk(-4.5, 1.1, 0.9), brk(-6, 0.25, 1.4), v(27.6, 0.25, 4.6), v(27.4, 0.42, 2.3), v(26.95, 0.55, JACK.z)],
    ac: [brk(4.5, 1.1, -1), brk(6.5, 0.25, -2.5), v(40.5, 0.25, -14), v(40, 0.25, -30), v(39.5, 0.2, -32.9), v(39.4, -3, -34)],
    red: [lift(v(JACK.x - 1.45, 0.62, JACK.z - 0.33), 0), v(JACK.x - 2.1, 0.75, JACK.z - 0.4), v(21, 1.25, 3.5), lift(hole(57, "T+"), 0.4), lift(hole(57, "T+"), -0.1)],
    black: [v(JACK.x - 1.45, 0.62, JACK.z + 0.33), v(JACK.x - 2.1, 0.7, JACK.z + 0.5), v(21.4, 1.0, 3.85), lift(hole(58, "T-"), 0.4), lift(hole(58, "T-"), -0.1)],
  }), []);
  return (
    <Part id="adapter">
      <group position={BRICK} rotation-y={BRICK_YAW}>
        <RoundedBox args={[7.2, 3, 4.6]} radius={0.5} smoothness={4} position-y={1.5} material={mat("#1a1b1d", 0.7)} castShadow receiveShadow />
        <mesh position={[0.3, 3.004, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[4.6, 2.9]} />
          <meshStandardMaterial map={sticker} roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh position={[-2.9, 3.01, 1.6]} material={power}>
          <cylinderGeometry args={[0.13, 0.13, 0.04, 12]} />
        </mesh>
        <mesh position={[-4, 1.1, 0.9]} rotation-z={Math.PI / 2} material={mat("#1a1b1d", 0.7)}>
          <cylinderGeometry args={[0.2, 0.32, 1, 12]} />
        </mesh>
        <mesh position={[4, 1.1, -1]} rotation-z={-Math.PI / 2} material={mat("#1a1b1d", 0.7)}>
          <cylinderGeometry args={[0.24, 0.36, 1, 12]} />
        </mesh>
      </group>
      <Tube points={cables.dc} r={0.16} material={mat("#1a1b1d", 0.6)} />
      <Tube points={cables.ac} r={0.22} material={mat("#1a1b1d", 0.6)} />
      {/* barrel plug into a DC-jack-to-screw-terminal adapter */}
      <mesh position={[JACK.x + 2.1, 0.55, JACK.z]} rotation-z={Math.PI / 2} material={M.black()} castShadow>
        <cylinderGeometry args={[0.32, 0.42, 1.6, 16]} />
      </mesh>
      <mesh position={[JACK.x + 0.4, 0.55, JACK.z]} rotation-z={Math.PI / 2} material={M.black()} castShadow>
        <cylinderGeometry args={[0.55, 0.55, 1.8, 20]} />
      </mesh>
      <mesh position={[JACK.x - 0.95, 0.5, JACK.z]} material={mat("#1f8a4c", 0.5)} castShadow>
        <boxGeometry args={[1, 1, 1.3]} />
      </mesh>
      {[-0.33, 0.33].map((dz) => (
        <mesh key={dz} position={[JACK.x - 0.95, 1.02, JACK.z + dz]} material={M.steel()}>
          <cylinderGeometry args={[0.2, 0.2, 0.05, 12]} />
        </mesh>
      ))}
      <Tube points={cables.red} r={0.05} material={mat("#d8322f", 0.45)} />
      <Tube points={cables.black} r={0.05} material={mat("#202022", 0.45)} />
    </Part>
  );
});

export const Models = memo(function Models() {
  return (
    <>
      <Mat />
      <Arduino />
      <Breadboard />
      <Laptop />
      <Adapter />
    </>
  );
});

// ---- where labels sit, and the path the signal takes ----
export const ANCHORS: Record<"arduino" | "laptop" | "adapter" | "breadboard" | "shunt" | "opamp" | "amp" | "filter", THREE.Vector3> = {
  arduino: ard(30, 27, 2.6),
  laptop: lap(0, 23.5, -16.5),
  adapter: brk(0, 5, 0),
  breadboard: lift(hole(46, "e"), 1),
  shunt: lift(hole(7, "h"), 1.3),
  opamp: lift(hole(21.5, "e"), 1.3),
  amp: lift(hole(17, "i"), 1.5),
  filter: lift(hole(25, "b"), 1.5),
};

const lifted = (pts: THREE.Vector3[], y: number) => pts.map((p) => lift(p, y));
export const FLOW = [
  lift(hole(3, "h"), 0.9),
  ...lifted(SENSE.slice(1, -1), 0.08),
  lift(hole(15, "h"), 0.55), lift(hole(18, "h"), 0.55), lift(hole(21, "h"), 0.55),
  lift(hole(21, "f"), 0.62), lift(hole(23, "f"), 0.62),
  lift(R1[0], 0.6), lift(R1[0].clone().lerp(R1[1], 0.5), 0.55), lift(R1[1], 0.5),
  lift(hole(27, "b"), 0.55), lift(hole(23.5, "b"), 0.55), lift(hole(20, "b"), 0.55),
  lift(hole(20, "e"), 0.62), lift(hole(22, "e"), 0.62), lift(hole(22, "a"), 0.9),
  ...lifted(dupont(A0_PIN, hole(22, "a"), 2.4).reverse(), 0.08),
  lift(A0_PIN, 0.6), ard(50.8, 8, TY + 0.4), ard(45.7, 17, TY + 1.05), ard(30, 30, TY + 0.4), ard(16.5, 35, TY + 0.4), ard(4, 38.1, TY + 1.45), v(ARD.x - 5.6, TY + 1.32, USB_Z),
  ...lifted([...USB_CABLE].reverse(), 0.26),
  lap(14, 1.9, 3), lap(6, 1.9, -6), lap(0, 2.4, -10.2), SCREEN,
];

export { MAT_W, MAT_D };
