"use client";
import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Select } from "@react-three/postprocessing";
import type { PartId } from "./parts";

// ---- layout: everything in cm, mat surface at y = 0, +z towards the viewer ----
export const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const P = 0.254; // 0.1" pitch

export const ARD = v(0, 0, 6); // Uno PCB centre
export const TY = 0.41; // Uno PCB top (0.25 feet + 1.6 mm board)
/** Point on the Uno from the official drawing: mm from the bottom-left corner, y towards the digital header. */
export const ard = (xmm: number, ymm: number, y = TY) => v(ARD.x + xmm / 10 - 3.43, y, ARD.z + 2.67 - ymm / 10);

export const BB = v(13.5, 0, 6); // breadboard centre
export const BBH = 0.85; // breadboard top
export const ROWS = {
  a: 1.397, b: 1.143, c: 0.889, d: 0.635, e: 0.381, f: -0.381, g: -0.635, h: -0.889, i: -1.143, j: -1.397,
  "T+": -2.413, "T-": -2.159, "B-": 2.159, "B+": 2.413,
};
export type Row = keyof typeof ROWS;
export const RAILS: Row[] = ["T+", "T-", "B-", "B+"];
/** Rail holes come in groups of five. */
export const railHole = (col: number) => col >= 3 && col <= 61 && (col - 3) % 6 !== 5;
export const hole = (col: number, row: Row) => v(BB.x + (col - 32) * P, BBH, BB.z + ROWS[row]);

export const LAPTOP = v(-27, 0, -5);
export const LAPTOP_YAW = 0.5;
export const lap = (x: number, y: number, z: number) => v(x, y, z).applyAxisAngle(v(0, 1, 0), LAPTOP_YAW).add(LAPTOP);

// ---- materials: one shared instance per look ----
const cache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, roughness = 0.5, metalness = 0) {
  const k = `${color}${roughness}${metalness}`;
  let m = cache.get(k);
  if (!m) cache.set(k, (m = new THREE.MeshStandardMaterial({ color, roughness, metalness })));
  return m;
}
export const M = {
  black: () => mat("#1c1d1f", 0.55),
  dark: () => mat("#2b2d31", 0.6),
  tin: () => mat("#d4d7db", 0.28, 1),
  steel: () => mat("#b9bdc2", 0.32, 1),
  gold: () => mat("#d9b45a", 0.3, 1),
  brass: () => mat("#c9a14a", 0.35, 1),
  bracket: () => mat("#2f3338", 0.45, 0.6),
  rubber: () => mat("#141414", 0.85),
};

/** Canvas texture made once per mount and freed on unmount. */
export function usePainted(make: () => THREE.Texture) {
  const t = useMemo(make, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => t.dispose(), [t]);
  return t;
}

// ---- primitives ----
export type Inst = [x: number, y: number, z: number, sx: number, sy: number, sz: number];
const unit = new THREE.BoxGeometry(1, 1, 1);

/** Many small boxes (pins, holes, keys) in one draw call. */
export function Boxes({ items, material, shadow = true }: { items: Inst[]; material: THREE.Material; shadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current!, o = new THREE.Object3D();
    items.forEach(([x, y, z, sx, sy, sz], k) => {
      o.position.set(x, y, z);
      o.scale.set(sx, sy, sz);
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingBox();
    m.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[unit, material, items.length]} castShadow={shadow} receiveShadow />;
}

/** Wire or cable along a smooth curve through points. */
export function Tube({ points, r, material, closed = false }: { points: THREE.Vector3[]; r: number; material: THREE.Material; closed?: boolean }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points, closed, "centripetal"), [points, closed]);
  const segs = Math.max(12, Math.round(curve.getLength() * 5));
  return (
    <mesh castShadow receiveShadow material={material}>
      <tubeGeometry args={[curve, segs, r, 8, closed]} />
    </mesh>
  );
}

const up = (p: THREE.Vector3, y: number) => p.clone().setY(p.y + y);

/** Solid-core breadboard jumper: a low staple, or a gentle arch when long. */
export function staple(a: THREE.Vector3, b: THREE.Vector3, h = 0.22) {
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  const d = v(b.x - a.x, 0, b.z - a.z).normalize();
  if (L < 1.5)
    return [up(a, -0.1), up(a, h * 0.7), up(a, h).addScaledVector(d, 0.07), up(b, h).addScaledVector(d, -0.07), up(b, h * 0.7), up(b, -0.1)];
  const H = h + L * 0.06;
  const at = (t: number, y: number) => a.clone().lerp(b, t).setY(a.y + y);
  return [up(a, -0.1), up(a, H * 0.55), at(0.12, H * 0.92), at(0.5, H), at(0.88, H * 0.92), up(b, H * 0.55), up(b, -0.1)];
}

/** Dupont jumper: plastic housings on both pins, wire arching between them. */
export function dupont(a: THREE.Vector3, b: THREE.Vector3, arch: number) {
  const top = Math.max(a.y, b.y) + 1.4 + arch;
  const mid = a.clone().lerp(b, 0.5).setY(top);
  return [up(a, 1.38), up(a, 2), a.clone().lerp(b, 0.22).setY(top - arch * 0.2), mid, b.clone().lerp(a, 0.22).setY(top - arch * 0.2), up(b, 2), up(b, 1.38)];
}
export function Dupont({ a, b, arch, color }: { a: THREE.Vector3; b: THREE.Vector3; arch: number; color: string }) {
  const pts = useMemo(() => dupont(a, b, arch), [a, b, arch]);
  return (
    <group>
      {[a, b].map((p, k) => (
        <mesh key={k} position={[p.x, p.y + 0.7, p.z]} material={M.black()} castShadow>
          <boxGeometry args={[0.25, 1.4, 0.25]} />
        </mesh>
      ))}
      <Tube points={pts} r={0.06} material={mat(color, 0.45)} />
    </group>
  );
}

// ---- resistors ----
const BAND = ["#141414", "#6b3b16", "#d02a2a", "#f07a12", "#f2cf1c", "#2c9a45", "#2a5fd6", "#7b3fc4", "#8b8b8b", "#f4f4f4"];
/** First digit, second digit, multiplier colours for a 4-band resistor. */
export function bands(ohms: number) {
  const e = Math.floor(Math.log10(ohms) + 1e-9) - 1;
  const d = Math.round(ohms / 10 ** e);
  return [BAND[Math.floor(d / 10)], BAND[d % 10], BAND[e]];
}

const body = new THREE.LatheGeometry(
  [[0, -0.315], [0.075, -0.31], [0.115, -0.29], [0.122, -0.24], [0.12, -0.17], [0.103, -0.13], [0.1, 0], [0.103, 0.13], [0.12, 0.17], [0.122, 0.24], [0.115, 0.29], [0.075, 0.31], [0, 0.315]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 20);
const bandBig = new THREE.CylinderGeometry(0.126, 0.126, 0.05, 20, 1, true);
const bandSmall = new THREE.CylinderGeometry(0.106, 0.106, 0.045, 20, 1, true);
const Y = v(0, 1, 0);

/** Through-hole resistor from hole a to hole b: flat when the span allows, otherwise standing up. */
export function Resistor({ a, b, ohms }: { a: THREE.Vector3; b: THREE.Vector3; ohms: number }) {
  const g = useMemo(() => {
    if (Math.hypot(b.x - a.x, b.z - a.z) > 0.85) {
      const d = v(b.x - a.x, 0, b.z - a.z).normalize();
      const pos = a.clone().lerp(b, 0.5).setY(a.y + 0.34);
      const lead = (h: THREE.Vector3, s: number) =>
        [up(h, -0.1), h.clone().setY(pos.y - 0.09), h.clone().setY(pos.y).addScaledVector(d, s * 0.07), pos.clone().addScaledVector(d, -s * 0.3)];
      return { pos, quat: new THREE.Quaternion().setFromUnitVectors(Y, d), leads: [lead(a, 1), lead(b, -1)] };
    }
    const pos = up(a, 0.47), top = up(a, 0.78);
    return {
      pos, quat: new THREE.Quaternion(),
      leads: [[up(a, -0.1), up(a, 0.16)], [top, up(top, 0.12), a.clone().lerp(b, 0.5).setY(top.y + 0.2), up(b, 0.82), up(b, 0.4), up(b, -0.1)]],
    };
  }, [a, b]);
  const [c1, c2, c3] = bands(ohms);
  return (
    <group>
      <group position={g.pos} quaternion={g.quat}>
        <mesh geometry={body} material={mat("#d9c49b", 0.55)} castShadow />
        <mesh geometry={bandBig} material={mat(c1, 0.5)} position-y={-0.215} />
        <mesh geometry={bandSmall} material={mat(c2, 0.5)} position-y={-0.1} />
        <mesh geometry={bandSmall} material={mat(c3, 0.5)} position-y={-0.02} />
        <mesh geometry={bandBig} material={M.gold()} position-y={0.215} />
      </group>
      {g.leads.map((pts, k) => <Tube key={k} points={pts} r={0.022} material={M.tin()} />)}
    </group>
  );
}

// ---- interaction: every clickable assembly is a Part ----
type Lab = { hovered: PartId | null; selected: PartId | null; hover: (id: PartId | null) => void; select: (id: PartId) => void };
export const LabCtx = createContext<Lab>({ hovered: null, selected: null, hover: () => {}, select: () => {} });

export function Part({ id, children }: { id: PartId; children: ReactNode }) {
  const { hovered, selected, hover, select } = useContext(LabCtx);
  return (
    <Select enabled={hovered === id || selected === id}>
      <group
        name={id}
        onPointerOver={(e) => (e.stopPropagation(), hover(id))}
        onPointerOut={() => hover(null)}
        onClick={(e) => (e.stopPropagation(), select(id))}
      >
        {children}
      </group>
    </Select>
  );
}
