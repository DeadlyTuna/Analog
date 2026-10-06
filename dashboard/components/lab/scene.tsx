"use client";
import { CameraControls, ContactShadows, Environment, Html, Lightformer, useCursor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Outline, Selection, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useContext, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type ClassName, getState, recentMean, useTelemetry } from "@/lib/telemetry";
import { LabCtx, v } from "./kit";
import { ANCHORS, FLOW, MAT, MAT_D, MAT_W, Models } from "./models";
import { PARTS, type PartId, reading } from "./parts";
import { RIG_ANCHORS, Rig } from "./rig";
import { statusColor } from "./textures";

export type BenchProps = {
  selected: PartId | null; hovered: PartId | null; onHover: (id: PartId | null) => void; onSelect: (id: PartId) => void;
  rotate: boolean; flow: boolean; labels: boolean; home: number; reduced: boolean;
};

const HOME = { pos: v(30, 40, 62), target: v(-5, 2, -5) };
const ANCHOR: Record<PartId, THREE.Vector3> = { ...ANCHORS, ...RIG_ANCHORS };
const SMALL: PartId[] = ["shunt", "opamp", "amp", "filter"];
/** Direction the camera looks from when it flies to a part. */
const VIEW: Partial<Record<PartId, THREE.Vector3>> = {
  laptop: v(0.62, 0.5, 0.95), motor: v(0.25, 0.75, 1), rig: v(1, 0.6, 0.55), adapter: v(0.3, 0.9, 0.8),
};

function Camera({ selected, home, rotate, reduced, hovered }: Pick<BenchProps, "selected" | "home" | "rotate" | "reduced" | "hovered">) {
  const ref = useRef<CameraControls>(null);
  const scene = useThree((s) => s.scene);
  const idle = useRef(0); // auto-rotate waits until this time
  const first = useRef(true);
  useEffect(() => {
    ref.current?.setBoundary(new THREE.Box3(v(-55, 0, -32), v(42, 25, 18)));
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const smooth = !reduced && !first.current;
    first.current = false;
    const obj = selected && scene.getObjectByName(selected);
    if (!obj) {
      c.setLookAt(...HOME.pos.toArray(), ...HOME.target.toArray(), smooth);
      return;
    }
    const s = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
    const d = Math.max(c.getDistanceToFitSphere(s.radius) * 1.05, 6);
    const p = s.center.clone().addScaledVector((VIEW[selected] ?? v(0.5, 0.75, 1)).clone().normalize(), d);
    c.setLookAt(...p.toArray(), ...s.center.toArray(), smooth);
  }, [selected, home, reduced, scene]);
  useFrame((_, dt) => {
    if (rotate && !selected && !hovered && performance.now() > idle.current) ref.current?.rotate(Math.min(dt, 0.1) * 0.07, 0, true);
  });
  return (
    <CameraControls ref={ref} makeDefault minDistance={4} maxDistance={160} minPolarAngle={0.12} maxPolarAngle={1.42} smoothTime={0.5}
      onStart={() => (idle.current = Infinity)} onEnd={() => (idle.current = performance.now() + 4000)} />
  );
}

const bead = new THREE.IcosahedronGeometry(1, 1);
const COUNT = 46;
const o = new THREE.Object3D(); // scratch for instance matrices

/** Glowing samples travelling shunt → amp → filter → A0 → USB → laptop, at a speed set by the live current. */
function Flow({ on }: { on: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(FLOW, false, "centripetal"), []);
  const len = useMemo(() => curve.getLength(), [curve]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  useEffect(() => () => material.dispose(), [material]);
  const colors = useMemo(() => Object.fromEntries((["normal", "overload", "friction"] as ClassName[])
    .map((c) => {
      const k = new THREE.Color(statusColor(c));
      return [c, k.multiplyScalar(2.4 / (0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b))]; // same glow for every status
    })) as Record<ClassName, THREE.Color>, []);
  const u = useRef(0);
  useFrame((_, dt) => {
    const m = ref.current!;
    const { frame, status } = getState();
    m.visible = on && status === "live" && !!frame;
    if (!m.visible || !frame) return;
    const amps = recentMean("i", 50);
    u.current = (u.current + (Math.min(dt, 0.1) * (5 + 30 * (Number.isFinite(amps) ? amps : 0))) / len) % 1;
    material.color.lerp(colors[frame.label], 1 - Math.exp(-dt * 6));
    for (let k = 0; k < COUNT; k++) {
      const t = (u.current + k / COUNT) % 1;
      curve.getPointAt(t, o.position);
      o.scale.setScalar(0.15 * Math.min(1, t / 0.02, (1 - t) / 0.03));
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[bead, material, COUNT]} frustumCulled={false} />;
}

function Tip({ id }: { id: PartId }) {
  useTelemetry(); // refresh the reading at the stream rate
  return (
    <div className="pointer-events-none w-max max-w-60 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-xl border border-line bg-surface/90 px-3 py-2 shadow-lg backdrop-blur-md">
      <p className="text-sm font-medium text-ink">{PARTS[id].name}</p>
      <p className="mt-0.5 text-xs tabular-nums text-ink-2">{reading(id)}</p>
      <p className="mt-1 text-[11px] text-muted">Click for details</p>
    </div>
  );
}

function Labels({ show }: { show: boolean }) {
  const { hovered, hover, select } = useContext(LabCtx);
  const refs = useRef<Partial<Record<PartId, HTMLButtonElement | null>>>({});
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    for (const id of SMALL) {
      const el = refs.current[id];
      if (!el) continue;
      const near = camera.position.distanceTo(ANCHOR[id]) < 34;
      el.style.opacity = near ? "1" : "0";
      el.style.pointerEvents = near ? "auto" : "none";
    }
  });
  return (
    <>
      {(Object.keys(ANCHOR) as PartId[]).map((id) => (
        <Html key={id} position={ANCHOR[id]} zIndexRange={[10, 0]}>
          {hovered === id ? (
            <Tip id={id} />
          ) : show ? (
            <button
              ref={(el) => {
                refs.current[id] = el;
              }}
              onClick={() => select(id)}
              onPointerEnter={() => hover(id)}
              onPointerLeave={() => hover(null)}
              className="-translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-line bg-surface/85 px-2.5 py-1 text-xs font-medium text-ink shadow-sm backdrop-blur transition-opacity duration-300 hover:bg-surface"
              style={{ opacity: SMALL.includes(id) ? 0 : 1 }}
            >
              {PARTS[id].short}
            </button>
          ) : null}
        </Html>
      ))}
    </>
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#f2f5ff", "#2c2a25", 0.6]} />
      <directionalLight castShadow position={[30, 62, 30]} intensity={2.6} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03}>
        <orthographicCamera attach="shadow-camera" args={[-62, 62, 44, -44, 1, 200]} />
      </directionalLight>
      <directionalLight position={[-45, 28, -42]} intensity={1.2} color="#cddcff" />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={1} position={[0, 60, 0]} rotation-x={Math.PI / 2} scale={[90, 50, 1]} />
        <Lightformer form="rect" intensity={0.7} position={[-70, 22, 0]} rotation-y={Math.PI / 2} scale={[60, 16, 1]} />
        <Lightformer form="rect" intensity={0.5} position={[70, 16, -10]} rotation-y={-Math.PI / 2} scale={[50, 12, 1]} />
        <Lightformer form="circle" intensity={1.2} position={[25, 30, 70]} scale={12} />
      </Environment>
    </>
  );
}

function Cursor() {
  const { hovered } = useContext(LabCtx);
  useCursor(!!hovered);
  return null;
}

export default function Bench({ selected, hovered, onHover, onSelect, rotate, flow, labels, home, reduced }: BenchProps) {
  const ctx = useMemo(() => ({ selected, hovered, hover: onHover, select: onSelect }), [selected, hovered, onHover, onSelect]);
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 30, near: 0.5, far: 600, position: HOME.pos.toArray() }}
      className="touch-none"
    >
      <LabCtx.Provider value={ctx}>
        <Lights />
        <Selection>
          <EffectComposer multisampling={4} autoClear={false}>
            <Outline blur edgeStrength={4} visibleEdgeColor={0x8cbcff} hiddenEdgeColor={0x2f5c9c} />
            <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.25} intensity={1.15} radius={0.7} />
            <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          </EffectComposer>
          <Models />
          <Rig />
        </Selection>
        <ContactShadows position={[MAT.x, -0.31, MAT.z]} scale={[MAT_W + 16, MAT_D + 16]} opacity={0.45} blur={2.6} far={4} resolution={512} frames={1} />
        <Flow on={flow} />
        <Labels show={labels} />
        <Cursor />
        <Camera selected={selected} home={home} rotate={rotate} reduced={reduced} hovered={hovered} />
      </LabCtx.Provider>
    </Canvas>
  );
}
