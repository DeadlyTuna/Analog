"use client";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import { getState } from "@/lib/telemetry";
import { M, Part, Tube, hole, mat, v } from "./kit";

// 37 mm gear motor on an L bracket; output shaft is offset 7 mm above the motor axis.
const MX = 9.6, MY = 2.6, MZ = -4.5; // gearbox front face centre
const SY = MY + 0.7; // output shaft height
const WX = MX + 1.6; // pulley centre
const BX = WX + 0.4; // belt plane (pulley groove)
const PX = WX - 0.4; // brake surface
const DZ = MZ - 8.5; // load drum
const R = 2.4, RB = 2.2; // pulley rim, belt pitch radius
export const RIG_ANCHORS = { motor: v(MX - 4, MY + 2.5, MZ), rig: v(BX, SY + 3.3, DZ) };

const lathe = (pts: number[][], seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const GEARBOX = lathe([[1.75, 0], [1.85, 0.08], [1.85, 0.75], [1.79, 0.8], [1.85, 0.85], [1.85, 1.55], [1.79, 1.6], [1.85, 1.65], [1.85, 2.32], [1.78, 2.4], [1.62, 2.4]]);
const CAN = lathe([[1.62, 2.4], [1.65, 2.48], [1.65, 5.6]]);
const CAP = lathe([[1.65, 5.6], [1.6, 5.75], [1.45, 5.85], [0.5, 5.9], [0.45, 6.05], [0, 6.05]]);
const PULLEY = lathe([[0.3, -0.95], [0.75, -0.95], [0.75, -0.8], [2.3, -0.8], [2.4, -0.7], [2.4, -0.05], [2.36, 0.05], [2.1, 0.4], [2.36, 0.75], [2.3, 0.8], [0.75, 0.8], [0.75, 0.95], [0.3, 0.95]], 64);
const DRUM = lathe([[0.3, -0.75], [0.6, -0.75], [0.6, -0.6], [2.3, -0.6], [2.4, -0.5], [2.4, -0.4], [2.1, 0], [2.4, 0.4], [2.4, 0.5], [2.3, 0.6], [0.6, 0.6], [0.6, 0.75], [0.3, 0.75]], 64);

function belt() {
  const pts: THREE.Vector3[] = [];
  const arc = (cz: number, a0: number, a1: number) => {
    for (let k = 0; k <= 14; k++) {
      const a = a0 + ((a1 - a0) * k) / 14;
      pts.push(v(BX, SY + RB * Math.sin(a), cz + RB * Math.cos(a)));
    }
  };
  arc(MZ, -Math.PI / 2, Math.PI / 2);
  [0.25, 0.5, 0.75].forEach((t) => pts.push(v(BX, SY + RB, MZ + (DZ - MZ) * t)));
  arc(DZ, Math.PI / 2, (3 * Math.PI) / 2);
  [0.25, 0.5, 0.75].forEach((t) => pts.push(v(BX, SY - RB, DZ + (MZ - DZ) * t)));
  return pts;
}

const SPARKS = 70;
const sparkGeo = new THREE.IcosahedronGeometry(0.05, 0);
const o = new THREE.Object3D(); // scratch for instance matrices

export const Rig = memo(function Rig() {
  const pulley = useRef<THREE.Group>(null);
  const drum = useRef<THREE.Group>(null);
  const beltRef = useRef<THREE.Group>(null);
  const pad = useRef<THREE.Group>(null);
  const sparks = useRef<THREE.InstancedMesh>(null);
  const can = useMemo(() => new THREE.MeshStandardMaterial({ color: "#949aa2", metalness: 0.85, roughness: 0.36, emissive: "#ff7a2e", emissiveIntensity: 0 }), []);
  const sparkMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffb347").multiplyScalar(6), toneMapped: false }), []);
  const beltPts = useMemo(belt, []);
  const sim = useRef({
    engage: 0, brake: 0, heat: 0, spawn: 0,
    p: Array.from({ length: SPARKS }, () => v(0, 0, 0)), vel: Array.from({ length: SPARKS }, () => v(0, 0, 0)), life: new Float32Array(SPARKS),
  });
  const leads = useMemo(() => ({
    red: [v(MX - 6.15, MY + 0.5, MZ - 0.95), v(MX - 7, MY + 0.4, MZ - 1), v(3.4, 0.25, -2.2), v(5.6, 0.3, 1.8), v(6.3, 0.9, 3.3), hole(4, "T+").setY(1.3), hole(4, "T+").setY(0.75)],
    black: [v(MX - 6.15, MY + 0.5, MZ + 0.95), v(MX - 7, MY + 0.4, MZ + 1), v(3.9, 0.25, -0.8), v(5.4, 0.3, 2.6), v(6.0, 0.9, 4.2), hole(3, "j").setY(1.3), hole(3, "j").setY(0.75)],
  }), []);

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.1);
    const { frame, status } = getState();
    const live = status === "live" && frame;
    const cond = live ? frame.truth.condition : "normal", sev = live ? frame.truth.severity : 0;
    const w = live ? (frame.truth.rpm / 60) * Math.PI * 2 : 0;
    const s = sim.current;
    const ease = (x: number, to: number, rate: number) => x + (to - x) * (1 - Math.exp(-dt * rate));
    s.engage = ease(s.engage, cond === "overload" ? 1 : 0, 4);
    s.brake = ease(s.brake, cond === "friction" ? 0.35 + 0.65 * sev : 0, 5);
    s.heat = ease(s.heat, cond === "overload" ? sev : 0, 0.6);
    pulley.current!.rotation.x += w * dt;
    drum.current!.rotation.x += w * dt * s.engage;
    beltRef.current!.visible = s.engage > 0.03;
    beltRef.current!.scale.setScalar(0.92 + 0.08 * s.engage);
    pad.current!.position.y = 0.6 * Math.max(0, 1 - s.brake / 0.35);
    can.emissiveIntensity = s.heat * 3;

    const m = sparks.current!;
    const contact = s.brake > 0.33 && w > 0.5;
    s.spawn += contact ? dt * 170 * (s.brake - 0.2) : 0;
    for (let k = 0; k < SPARKS; k++) {
      if (s.life[k] <= 0 && s.spawn >= 1) {
        s.spawn--;
        s.life[k] = 0.25 + Math.random() * 0.35;
        s.p[k].set(PX + (Math.random() - 0.5) * 0.6, SY + R, MZ + 0.1);
        s.vel[k].set((Math.random() - 0.5) * 3, -1 + Math.random() * 7, 9 + Math.random() * 14);
      }
      if (s.life[k] > 0) {
        s.life[k] -= dt;
        s.vel[k].y -= 45 * dt;
        s.p[k].addScaledVector(s.vel[k], dt);
        if (s.p[k].y < 0.05) s.life[k] = 0;
      }
      o.position.copy(s.p[k]);
      o.scale.setScalar(Math.max(0, s.life[k]) * 3.2);
      o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
    }
    s.spawn = Math.min(s.spawn, 3);
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <Part id="motor">
        <group position={[MX, MY, MZ]} rotation-z={Math.PI / 2}>
          <mesh geometry={GEARBOX} material={mat("#c8cbcf", 0.3, 0.95)} castShadow />
          <mesh geometry={CAN} material={can} castShadow />
          <mesh geometry={CAP} material={M.black()} castShadow />
        </group>
        {[-0.95, 0.95].map((dz) => (
          <mesh key={dz} position={[MX - 6, MY + 0.5, MZ + dz]} material={M.brass()}>
            <boxGeometry args={[0.32, 0.36, 0.06]} />
          </mesh>
        ))}
        <Tube points={leads.red} r={0.055} material={mat("#d8322f", 0.45)} />
        <Tube points={leads.black} r={0.055} material={mat("#202022", 0.45)} />
        {/* L bracket */}
        <mesh position={[MX + 0.125, 2.5, MZ]} material={M.bracket()} castShadow receiveShadow>
          <boxGeometry args={[0.25, 5, 4.4]} />
        </mesh>
        <mesh position={[MX - 1.65, 0.125, MZ]} material={M.bracket()} castShadow receiveShadow>
          <boxGeometry args={[3.8, 0.25, 4.4]} />
        </mesh>
        {[[MY - 0.9, -1.1], [MY - 0.9, 1.1], [MY + 1.5, -1.3], [MY + 1.5, 1.3]].map(([y, dz]) => (
          <mesh key={`${y}${dz}`} position={[MX + 0.28, y, MZ + dz]} rotation-z={Math.PI / 2} material={M.steel()}>
            <cylinderGeometry args={[0.18, 0.18, 0.08, 12]} />
          </mesh>
        ))}
        {[-1.4, 1.4].map((dz) => (
          <mesh key={dz} position={[MX - 2.8, 0.28, MZ + dz]} material={M.steel()}>
            <cylinderGeometry args={[0.22, 0.22, 0.07, 12]} />
          </mesh>
        ))}
        <mesh position={[MX + 0.42, SY, MZ]} rotation-z={Math.PI / 2} material={M.steel()} castShadow>
          <cylinderGeometry args={[0.6, 0.6, 0.35, 24]} />
        </mesh>
        <mesh position={[(MX + 0.6 + WX + 1.15) / 2, SY, MZ]} rotation-z={Math.PI / 2} material={mat("#dfe2e5", 0.18, 1)}>
          <cylinderGeometry args={[0.3, 0.3, WX + 1.15 - MX - 0.6, 16]} />
        </mesh>
      </Part>

      <Part id="rig">
        <group ref={pulley} position={[WX, SY, MZ]}>
          <mesh geometry={PULLEY} rotation-z={-Math.PI / 2} material={mat("#d3d7db", 0.28, 0.95)} castShadow receiveShadow />
          {[0, 1, 2].map((k) => (
            <mesh key={k} position={[0.81, 1.45 * Math.cos((k * 2 * Math.PI) / 3), 1.45 * Math.sin((k * 2 * Math.PI) / 3)]} rotation-z={Math.PI / 2} material={mat("#3b3f45", 0.6, 0.4)}>
              <cylinderGeometry args={[0.42, 0.42, 0.02, 20]} />
            </mesh>
          ))}
          <mesh position={[0.815, 0, -1.95]} material={mat("#d8322f", 0.5)}>
            <boxGeometry args={[0.02, 0.18, 0.62]} />
          </mesh>
        </group>
        <group ref={beltRef}>
          <Tube points={beltPts} r={0.12} material={M.rubber()} closed />
        </group>
        <group ref={drum} position={[BX, SY, DZ]}>
          <mesh geometry={DRUM} rotation-z={-Math.PI / 2} material={mat("#8f959c", 0.4, 0.9)} castShadow receiveShadow />
          <mesh position={[0.61, 0, 1.5]} material={mat("#d8322f", 0.5)}>
            <boxGeometry args={[0.02, 0.18, 0.6]} />
          </mesh>
        </group>
        {[-1.05, 1.05].map((dx) => (
          <group key={dx} position={[BX + dx, 0, DZ]}>
            <mesh position-y={(SY + 0.6) / 2} material={M.bracket()} castShadow receiveShadow>
              <boxGeometry args={[0.3, SY + 0.6, 1.4]} />
            </mesh>
            <mesh position-y={SY} rotation-z={Math.PI / 2} material={M.black()}>
              <cylinderGeometry args={[0.5, 0.5, 0.42, 20]} />
            </mesh>
          </group>
        ))}
        <mesh position={[BX, SY, DZ]} rotation-z={Math.PI / 2} material={M.steel()}>
          <cylinderGeometry args={[0.25, 0.25, 2.9, 12]} />
        </mesh>
        <RoundedBox args={[3.2, 0.25, 2.8]} radius={0.08} position={[BX, 0.125, DZ]} material={M.bracket()} receiveShadow />
        {/* brake: post, arm and a screw-down pad over the pulley's brake surface */}
        <RoundedBox args={[1.8, 0.25, 1.8]} radius={0.08} position={[WX + 1.6, 0.125, MZ]} material={M.bracket()} receiveShadow />
        <mesh position={[WX + 1.6, 3.7, MZ]} material={M.bracket()} castShadow>
          <boxGeometry args={[0.5, 7.4, 0.5]} />
        </mesh>
        <mesh position={[WX + 0.55, 7.2, MZ]} material={M.bracket()} castShadow>
          <boxGeometry args={[2.6, 0.4, 0.6]} />
        </mesh>
        <group ref={pad} position={[PX, 0, MZ]}>
          <mesh position-y={SY + R + 0.175} material={mat("#4a3326", 0.9)} castShadow>
            <boxGeometry args={[0.7, 0.35, 1.3]} />
          </mesh>
          <mesh position-y={SY + R + 0.4} material={M.steel()} castShadow>
            <boxGeometry args={[0.76, 0.1, 1.36]} />
          </mesh>
          <mesh position-y={SY + R + 1.25} material={M.steel()}>
            <cylinderGeometry args={[0.1, 0.1, 1.6, 10]} />
          </mesh>
          <mesh position-y={SY + R + 2.2} material={M.black()} castShadow>
            <cylinderGeometry args={[0.38, 0.38, 0.35, 18]} />
          </mesh>
        </group>
      </Part>
      <instancedMesh ref={sparks} args={[sparkGeo, sparkMat, SPARKS]} frustumCulled={false} />
    </>
  );
});
