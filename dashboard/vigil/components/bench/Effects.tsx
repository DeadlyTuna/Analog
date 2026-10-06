'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '@vigil/components/sim/SimProvider'
import { C } from '@vigil/lib/theme'
import { Y0, canvasTexture, clamp01, damp, hash, heatColor, heatOf } from './shared'

const N = 140

/** Rising heat shimmer above the frame (additive points; brightness fades with age). */
export function HeatShimmer() {
  const store = useStore()
  const points = useRef<THREE.Points>(null)
  const state = useRef({ heat: 0 })
  const sprite = useMemo(
    () =>
      canvasTexture(64, 64, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
        g.addColorStop(0, 'rgba(255,255,255,1)')
        g.addColorStop(0.4, 'rgba(255,255,255,0.35)')
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
      }),
    [],
  )
  const data = useMemo(() => {
    const age = new Float32Array(N)
    const seed = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      age[i] = hash(i * 1.7)
      seed[i] = hash(i * 9.3 + 2)
    }
    return { age, seed, pos: new Float32Array(N * 3), col: new Float32Array(N * 3) }
  }, [])
  const tmp = useMemo(() => new THREE.Color(), [])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const live = store.sim.live
    const s = state.current
    s.heat = damp(s.heat, heatOf(live.tempC), 2.5, dt)
    const u = s.heat
    const geo = points.current?.geometry
    if (!geo) return
    heatColor(0.3 + 0.7 * u, tmp)
    for (let i = 0; i < N; i++) {
      data.age[i] += dt * (0.35 + 0.4 * data.seed[i])
      if (data.age[i] >= 1) {
        data.age[i] = 0
        data.seed[i] = Math.random()
      }
      const a = data.age[i]
      const sd = data.seed[i]
      data.pos[i * 3] = -1.1 + sd * 2.4 + Math.sin(a * 6 + sd * 20) * 0.06
      data.pos[i * 3 + 1] = Y0 + 0.9 + a * (1.4 + sd * 0.8)
      data.pos[i * 3 + 2] = (hash(i * 3.3) - 0.5) * 1.0 + Math.sin(a * 5 + i) * 0.08
      const fade = Math.sin(a * Math.PI) * u * u * 0.9
      data.col[i * 3] = tmp.r * fade
      data.col[i * 3 + 1] = tmp.g * fade
      data.col[i * 3 + 2] = tmp.b * fade
    }
    const p = geo.getAttribute('position') as THREE.BufferAttribute
    const c = geo.getAttribute('color') as THREE.BufferAttribute
    p.needsUpdate = true
    c.needsUpdate = true
  })

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.col, 3]} />
      </bufferGeometry>
      <pointsMaterial map={sprite} size={0.38} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation toneMapped={false} />
    </points>
  )
}

/** Shock rings that radiate from the drive-end bearing while it is damaged. */
export function BearingRings() {
  const store = useStore()
  const rings = useRef<THREE.Mesh[]>([])
  const sev = useRef(0)
  useFrame((s, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = s.clock.elapsedTime
    const f = store.sim.live.faults
    sev.current = damp(sev.current, f.bearing, 5, dt)
    const k = sev.current
    rings.current.forEach((m, i) => {
      if (!m) return
      const rate = 0.9 + 3.2 * k
      const p = (t * rate + i / 4) % 1
      m.visible = k > 0.05
      m.scale.setScalar(0.6 + p * 2.8)
      ;(m.material as THREE.MeshBasicMaterial).opacity = (1 - p) * (1 - p) * clamp01(k * 1.3)
    })
  })
  return (
    <group position={[1.42, Y0, 0]}>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) rings.current[i] = m
          }}
          rotation={[0, Math.PI / 2, 0]}
          visible={false}
        >
          <ringGeometry args={[0.26, 0.3, 48]} />
          <meshBasicMaterial color={C.stop} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}
