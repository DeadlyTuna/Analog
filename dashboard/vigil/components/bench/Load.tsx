'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '@vigil/components/sim/SimProvider'
import { Y0, clamp01, damp, heatColor } from './shared'

const HOLES = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2)

/** Flexible coupling + brake disc: the "load" the motor drives. Calipers squeeze and glow as load rises. */
export function Load({ rotRef }: { rotRef: React.MutableRefObject<number> }) {
  const store = useStore()
  const root = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const padA = useRef<THREE.Mesh>(null)
  const padB = useRef<THREE.Mesh>(null)
  const weight = useRef<THREE.Mesh>(null)
  const s = useRef({ load: 0, mis: 0, imb: 0 })

  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b4bcc1', metalness: 1, roughness: 0.3 }), [])
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0d0f10', metalness: 0.2, roughness: 0.7 }), [])
  const rubber = useMemo(() => new THREE.MeshStandardMaterial({ color: '#241a14', roughness: 0.9 }), [])
  const frame = useMemo(() => new THREE.MeshStandardMaterial({ color: '#27323a', metalness: 0.5, roughness: 0.5 }), [])
  const discMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8d979c', metalness: 1, roughness: 0.38, emissive: new THREE.Color('#000'), emissiveIntensity: 0 }), [])
  const padMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2220', roughness: 0.8, emissive: new THREE.Color('#000'), emissiveIntensity: 0 }), [])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const live = store.sim.live
    const st = s.current
    st.load = damp(st.load, clamp01((live.load - 1) / 0.95), 3, dt)
    st.mis = damp(st.mis, live.faults.misalign, 4, dt)
    st.imb = damp(st.imb, live.faults.imbalance, 4, dt)

    if (root.current) {
      root.current.rotation.y = 0.07 * st.mis
      root.current.position.z = 0.16 * st.mis
    }
    if (spin.current) spin.current.rotation.x = rotRef.current

    // brake: pads close on the disc and glow
    const gap = 0.095 - 0.09 * st.load
    if (padA.current) padA.current.position.x = 4.3 - 0.05 - gap
    if (padB.current) padB.current.position.x = 4.3 + 0.05 + gap
    heatColor(0.2 + 0.8 * st.load, padMat.emissive)
    padMat.emissiveIntensity = 2.2 * st.load * st.load
    heatColor(0.1 + 0.6 * st.load, discMat.emissive)
    discMat.emissiveIntensity = 0.9 * Math.pow(st.load, 2.2)

    if (weight.current) {
      weight.current.visible = st.imb > 0.04
      weight.current.scale.setScalar(0.45 + 1.15 * st.imb)
    }
  })

  return (
    <group>
      {/* load base plate */}
      <mesh position={[4.1, 0.07, 0]} material={frame}>
        <boxGeometry args={[2.9, 0.14, 1.5]} />
      </mesh>

      <group ref={root}>
        {/* spinning assembly: coupling halves, shaft, brake disc */}
        <group ref={spin} position={[0, Y0, 0]}>
          <mesh position={[2.63, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={steel}>
            <cylinderGeometry args={[0.3, 0.3, 0.26, 40]} />
          </mesh>
          <mesh position={[2.9, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={rubber}>
            <cylinderGeometry args={[0.27, 0.27, 0.3, 40]} />
          </mesh>
          {Array.from({ length: 6 }, (_, i) => (
            <mesh key={i} position={[2.9, Math.cos((i / 6) * Math.PI * 2) * 0.27, Math.sin((i / 6) * Math.PI * 2) * 0.27]} material={dark}>
              <boxGeometry args={[0.31, 0.04, 0.04]} />
            </mesh>
          ))}
          <mesh position={[3.17, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={steel}>
            <cylinderGeometry args={[0.3, 0.3, 0.26, 40]} />
          </mesh>
          <mesh position={[4.15, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={steel}>
            <cylinderGeometry args={[0.12, 0.12, 2.1, 28]} />
          </mesh>
          {/* brake disc */}
          <mesh position={[4.3, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={discMat}>
            <cylinderGeometry args={[0.82, 0.82, 0.09, 64]} />
          </mesh>
          <mesh position={[4.3, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={steel}>
            <cylinderGeometry args={[0.24, 0.24, 0.16, 32]} />
          </mesh>
          {HOLES.map((a, i) => (
            <mesh key={i} position={[4.3, Math.cos(a) * 0.54, Math.sin(a) * 0.54]} rotation={[0, 0, Math.PI / 2]} material={dark}>
              <cylinderGeometry args={[0.07, 0.07, 0.1, 16]} />
            </mesh>
          ))}
          {HOLES.map((a, i) => (
            <mesh key={'v' + i} position={[4.3, Math.cos(a + 0.26) * 0.7, Math.sin(a + 0.26) * 0.7]} rotation={[a + 0.26, 0, 0]} material={dark}>
              <boxGeometry args={[0.1, 0.1, 0.03]} />
            </mesh>
          ))}
          {/* trim weight for the imbalance fault */}
          <mesh ref={weight} position={[4.3, 0.1, 0.77]} visible={false}>
            <boxGeometry args={[0.16, 0.2, 0.2]} />
            <meshStandardMaterial color="#e23a2e" emissive="#e23a2e" emissiveIntensity={0.5} roughness={0.5} />
          </mesh>
        </group>

        {/* pillow-block bearings */}
        {[3.75, 4.85].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 0.53, 0]} material={frame}>
              <boxGeometry args={[0.6, 0.78, 0.72]} />
            </mesh>
            <mesh position={[0, Y0, 0]} rotation={[0, 0, Math.PI / 2]} material={frame}>
              <cylinderGeometry args={[0.27, 0.27, 0.5, 36]} />
            </mesh>
            <mesh position={[0, Y0, 0]} rotation={[0, 0, Math.PI / 2]} material={dark}>
              <cylinderGeometry args={[0.145, 0.145, 0.52, 28]} />
            </mesh>
          </group>
        ))}

        {/* caliper on a swing arm */}
        <mesh position={[4.3, 0.85, -0.62]} material={frame}>
          <boxGeometry args={[0.2, 1.4, 0.2]} />
        </mesh>
        <mesh position={[4.3, Y0 + 0.74, -0.3]} material={frame}>
          <boxGeometry args={[0.22, 0.2, 0.9]} />
        </mesh>
        <mesh position={[4.3, Y0 + 0.78, 0]} material={frame}>
          <boxGeometry args={[0.46, 0.34, 0.5]} />
        </mesh>
        <mesh ref={padA} position={[4.2, Y0 + 0.66, 0]} material={padMat}>
          <boxGeometry args={[0.05, 0.3, 0.34]} />
        </mesh>
        <mesh ref={padB} position={[4.4, Y0 + 0.66, 0]} material={padMat}>
          <boxGeometry args={[0.05, 0.3, 0.34]} />
        </mesh>
      </group>
    </group>
  )
}
