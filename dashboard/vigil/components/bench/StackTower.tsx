'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '@vigil/components/sim/SimProvider'
import { C } from '@vigil/lib/theme'

export const TOWER_POS: [number, number, number] = [4.5, 0, 2.5]

const dim = (hex: string) => '#' + new THREE.Color(hex).multiplyScalar(0.22).getHexString()

const LAMPS = [
  { key: 'ledG', y: 1.2, c: C.go },
  { key: 'ledY', y: 1.52, c: C.caution },
  { key: 'ledR', y: 1.84, c: C.stop },
] as const

/** The andon tower: its three lamps mirror the MCU's GPIO pins and light the platform around it. */
export function StackTower() {
  const store = useStore()
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([])
  const lights = useRef<(THREE.PointLight | null)[]>([])
  const glow = useRef({ g: 0, y: 0, r: 0 })

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const g = store.sim.fw.gpio
    const target = { g: g.ledG ? 1 : 0, y: g.ledY ? 1 : 0, r: g.ledR ? 1 : 0 }
    const k = 1 - Math.exp(-30 * dt)
    const cur = glow.current
    cur.g += (target.g - cur.g) * k
    cur.y += (target.y - cur.y) * k
    cur.r += (target.r - cur.r) * k
    const vals = [cur.g, cur.y, cur.r]
    vals.forEach((v, i) => {
      const m = mats.current[i]
      if (m) m.emissiveIntensity = 0.04 + 2.3 * v
      const l = lights.current[i]
      if (l) l.intensity = 7 * v
    })
  })

  return (
    <group position={TOWER_POS}>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.34, 0.38, 0.1, 32]} />
        <meshStandardMaterial color="#1d2328" metalness={0.7} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 1.2, 16]} />
        <meshStandardMaterial color="#8d979c" metalness={1} roughness={0.35} />
      </mesh>
      {LAMPS.map((l, i) => (
        <group key={l.key} position={[0, l.y, 0]}>
          <mesh>
            <cylinderGeometry args={[0.2, 0.2, 0.3, 36]} />
            <meshStandardMaterial
              ref={(m) => {
                mats.current[i] = m
              }}
              color={dim(l.c)}
              emissive={l.c}
              emissiveIntensity={0.04}
              roughness={0.25}
              metalness={0}
              transparent
              opacity={0.96}
            />
          </mesh>
          {/* ribs */}
          {[-0.1, 0, 0.1].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <torusGeometry args={[0.2, 0.008, 6, 40]} />
              <meshStandardMaterial color="#000" transparent opacity={0.35} />
            </mesh>
          ))}
          <pointLight
            ref={(p) => {
              lights.current[i] = p
            }}
            color={l.c}
            intensity={0}
            distance={7}
            decay={2}
            position={[0, 0.1, 0.25]}
          />
        </group>
      ))}
      <mesh position={[0, 2.02, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.06, 36]} />
        <meshStandardMaterial color="#1d2328" metalness={0.7} roughness={0.45} />
      </mesh>
      <mesh position={[0, 2.12, 0]}>
        <sphereGeometry args={[0.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#8d979c" metalness={1} roughness={0.35} />
      </mesh>
    </group>
  )
}
