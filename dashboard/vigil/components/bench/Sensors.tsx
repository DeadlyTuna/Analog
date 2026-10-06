'use client'

import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '@vigil/components/sim/SimProvider'
import { C } from '@vigil/lib/theme'
import { terminalWorld } from './McuBoard'
import { Y0, clamp01, damp, heatColor, heatOf } from './shared'

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export const ANCHOR = {
  vib: V(1.25, Y0 + 0.5, 0.02),
  temp: V(-0.55, Y0 + 0.3, 0.9),
  rpm: V(2.15, Y0 + 0.36, 0),
}

/** Mains supply cable from the terminal box to the contactor. */
const SUPPLY = new THREE.CatmullRomCurve3([
  V(0.15, Y0 + 0.86, 0.42),
  V(0.15, Y0 + 0.86, 0.95),
  V(0.2, Y0 + 0.5, 1.45),
  V(0.55, 0.22, 1.95),
  V(1.15, 0.07, 2.4),
  V(1.6, 0.4, 2.7),
])
export const CT_T = 0.3
export const CT_POINT = SUPPLY.getPointAt(CT_T)
const CT_TAN = SUPPLY.getTangentAt(CT_T)

/** Where each callout tag floats (bench-local coordinates). */
export const TAG_END = {
  vib: ANCHOR.vib.clone().add(V(-0.05, 1.45, 0.55)),
  temp: ANCHOR.temp.clone().add(V(-0.2, 0.85, 0.6)),
  cur: CT_POINT.clone().add(V(0.55, 0.85, 0.35)),
  rpm: ANCHOR.rpm.clone().add(V(1.05, 1.15, -0.1)),
}

const CH = ['vib', 'temp', 'cur', 'rpm'] as const
type Ch = (typeof CH)[number]
const COLOR: Record<Ch, string> = { vib: C.vib, temp: C.temp, cur: C.cur, rpm: C.rpm }
const START: Record<Ch, THREE.Vector3> = { vib: ANCHOR.vib, temp: ANCHOR.temp, cur: CT_POINT, rpm: ANCHOR.rpm }

const PACKETS = 7

/** Sensors, their cables to the MCU, packets flowing along the cables, and the supply cable + contactor. */
export function Sensors({ rotRef }: { rotRef: React.MutableRefObject<number> }) {
  const store = useStore()
  const cableCurves = useMemo(
    () =>
      CH.map((ch, i) => {
        const a = START[ch]
        const b = terminalWorld(i)
        const lane = 0.06 + i * 0.07
        return new THREE.CatmullRomCurve3([
          a.clone(),
          a.clone().add(V(0.05, -0.18, 0.18)),
          V(THREE.MathUtils.lerp(a.x, b.x, 0.35) + lane * 0.4, 0.1 + i * 0.012, THREE.MathUtils.lerp(a.z, b.z, 0.4) + 0.35),
          V(THREE.MathUtils.lerp(a.x, b.x, 0.8), 0.1 + i * 0.012, THREE.MathUtils.lerp(a.z, b.z, 0.82)),
          b.clone().add(V(0, 0.22, -0.1)),
          b.clone().add(V(0, 0.03, 0)),
        ])
      }),
    [],
  )
  const tubes = useMemo(
    () => cableCurves.map((c) => new THREE.TubeGeometry(c, 90, 0.022, 8, false)),
    [cableCurves],
  )
  const supplyTube = useMemo(() => new THREE.TubeGeometry(SUPPLY, 120, 0.05, 10, false), [])
  const outTube = useMemo(
    () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(1.9, 0.5, 2.9), V(2.6, 0.2, 3.3), V(3.4, 0.07, 3.9), V(4.4, 0.07, 4.6)]), 40, 0.05, 8, false),
    [],
  )

  const packets = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const ringVib = useRef<THREE.Mesh[]>([])
  const capVib = useRef<THREE.MeshStandardMaterial>(null)
  const dotTemp = useRef<THREE.MeshStandardMaterial>(null)
  const clampCur = useRef<THREE.MeshStandardMaterial>(null)
  const ledRpm = useRef<THREE.MeshStandardMaterial>(null)
  const contLed = useRef<THREE.MeshStandardMaterial>(null)
  const st = useRef({ vib: 0, heat: 0, cur: 0 })

  useFrame((s, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = s.clock.elapsedTime
    const live = store.sim.live
    const k = st.current
    k.vib = damp(k.vib, clamp01((live.vibRms - 0.18) / 0.5), 6, dt)
    k.heat = damp(k.heat, heatOf(live.tempC), 3, dt)
    k.cur = damp(k.cur, clamp01(live.iRms / 9), 6, dt)

    // packets travelling along the sensor cables
    const pm = packets.current
    if (pm) {
      const active = live.powered || live.rpm > 30
      const col = new THREE.Color()
      for (let c = 0; c < CH.length; c++) {
        const speed = 0.22 + 0.25 * (c === 0 ? k.vib : c === 1 ? k.heat : c === 2 ? k.cur : 0.4)
        for (let p = 0; p < PACKETS; p++) {
          const u = (t * speed + p / PACKETS + c * 0.17) % 1
          cableCurves[c].getPointAt(u, tmp)
          dummy.position.copy(tmp)
          const sc = active ? 1 : 0.0001
          dummy.scale.setScalar(sc)
          dummy.updateMatrix()
          const i = c * PACKETS + p
          pm.setMatrixAt(i, dummy.matrix)
          col.set(COLOR[CH[c]])
          pm.setColorAt(i, col)
        }
      }
      pm.instanceMatrix.needsUpdate = true
      if (pm.instanceColor) pm.instanceColor.needsUpdate = true
    }

    // accelerometer: cap glow + expanding rings
    if (capVib.current) capVib.current.emissiveIntensity = 0.6 + 2.4 * k.vib
    ringVib.current.forEach((m, i) => {
      if (!m) return
      const rate = 1.6 + 2.2 * k.vib
      const p = (t * rate + i / 3) % 1
      m.scale.setScalar(1 + p * (1.2 + 1.6 * k.vib))
      const mat = m.material as THREE.MeshBasicMaterial
      mat.opacity = (1 - p) * (0.15 + 0.7 * k.vib) * (live.powered ? 1 : 0.2)
    })
    // RTD dot follows heat
    if (dotTemp.current) {
      heatColor(0.2 + 0.8 * k.heat, dotTemp.current.emissive)
      dotTemp.current.emissiveIntensity = 0.5 + 3 * k.heat
    }
    if (clampCur.current) clampCur.current.emissiveIntensity = 0.3 + 2.6 * k.cur
    // tacho LED flashes when the magnet passes the head
    if (ledRpm.current) {
      const phase = Math.cos(rotRef.current)
      ledRpm.current.emissiveIntensity = 0.15 + 5 * Math.pow(Math.max(0, phase), 40) * (live.rpm > 30 ? 1 : 0)
    }
    if (contLed.current) {
      contLed.current.emissive.set(live.powered ? C.go : C.stop)
      contLed.current.emissiveIntensity = 2.2
    }
  })

  const ctQuat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), CT_TAN.clone().normalize()), [])

  return (
    <group>
      {/* cables to the MCU */}
      {tubes.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color={COLOR[CH[i]]} emissive={COLOR[CH[i]]} emissiveIntensity={0.18} roughness={0.55} />
        </mesh>
      ))}
      <instancedMesh ref={packets} args={[undefined, undefined, CH.length * PACKETS]} frustumCulled={false}>
        <sphereGeometry args={[0.04, 10, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* supply cable + contactor */}
      <mesh geometry={supplyTube}>
        <meshStandardMaterial color="#0c0d0e" roughness={0.6} />
      </mesh>
      <mesh geometry={outTube}>
        <meshStandardMaterial color="#0c0d0e" roughness={0.6} />
      </mesh>
      <group position={[1.7, 0.36, 2.95]}>
        <mesh>
          <boxGeometry args={[0.95, 0.72, 0.62]} />
          <meshStandardMaterial color="#6d777d" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.02, 0.32]}>
          <boxGeometry args={[0.8, 0.5, 0.02]} />
          <meshStandardMaterial color="#2a3238" metalness={0.4} roughness={0.6} />
        </mesh>
        <mesh position={[-0.25, 0.1, 0.34]}>
          <cylinderGeometry args={[0.045, 0.045, 0.03, 16]} />
          <meshStandardMaterial ref={contLed} color={C.go} emissive={C.go} emissiveIntensity={2} />
        </mesh>
        <mesh position={[0.1, 0.1, 0.335]}>
          <boxGeometry args={[0.32, 0.12, 0.01]} />
          <meshStandardMaterial color="#e9e6dc" />
        </mesh>
      </group>

      {/* 1 — accelerometer on the drive-end bearing */}
      <group position={ANCHOR.vib}>
        <mesh>
          <boxGeometry args={[0.2, 0.14, 0.2]} />
          <meshStandardMaterial color="#c4cbcf" metalness={1} roughness={0.28} />
        </mesh>
        <mesh position={[0, 0.085, 0]}>
          <boxGeometry args={[0.15, 0.03, 0.15]} />
          <meshStandardMaterial ref={capVib} color={C.vib} emissive={C.vib} emissiveIntensity={0.8} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            ref={(m) => {
              if (m) ringVib.current[i] = m
            }}
            position={[0, 0.1, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.12, 0.14, 40]} />
            <meshBasicMaterial color={C.vib} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
        ))}
      </group>

      {/* 2 — RTD pad on the frame */}
      <group position={ANCHOR.temp}>
        <mesh>
          <boxGeometry args={[0.18, 0.16, 0.14]} />
          <meshStandardMaterial color="#1a1d1f" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.075]}>
          <cylinderGeometry args={[0.04, 0.04, 0.02, 16]} />
          <meshStandardMaterial ref={dotTemp} color={C.temp} emissive={C.temp} emissiveIntensity={0.6} />
        </mesh>
      </group>

      {/* 3 — hall-effect current clamp on the supply cable */}
      <group position={CT_POINT} quaternion={ctQuat}>
        <mesh>
          <torusGeometry args={[0.13, 0.05, 14, 40]} />
          <meshStandardMaterial ref={clampCur} color={C.cur} emissive={C.cur} emissiveIntensity={0.4} metalness={0.3} roughness={0.4} />
        </mesh>
      </group>

      {/* 4 — hall tacho head over the shaft collar */}
      <group position={ANCHOR.rpm}>
        <mesh>
          <boxGeometry args={[0.13, 0.2, 0.13]} />
          <meshStandardMaterial color="#2a3036" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.115, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.02, 12]} />
          <meshStandardMaterial ref={ledRpm} color={C.rpm} emissive={C.rpm} emissiveIntensity={0.2} />
        </mesh>
        <mesh position={[0, 0.22, -0.28]}>
          <boxGeometry args={[0.05, 0.44, 0.05]} />
          <meshStandardMaterial color="#2a3036" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.1, -0.15]}>
          <boxGeometry args={[0.05, 0.05, 0.3]} />
          <meshStandardMaterial color="#2a3036" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>

      <Leader ch="vib" at={ANCHOR.vib} />
      <Leader ch="temp" at={ANCHOR.temp} />
      <Leader ch="cur" at={CT_POINT} />
      <Leader ch="rpm" at={ANCHOR.rpm} />
    </group>
  )
}

function Leader({ ch, at }: { ch: Ch; at: THREE.Vector3 }) {
  return <Line points={[at, TAG_END[ch]]} color={COLOR[ch]} lineWidth={1} transparent opacity={0.55} />
}
