'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '@vigil/components/sim/SimProvider'
import { STATE_COLOR, MONO } from '@vigil/lib/theme'
import { TOWER_POS } from './StackTower'
import { canvasTexture } from './shared'

const RADIUS = 6.4

/** The test-bench turntable: measured rings, tick marks, a soft contact shadow, and a rim that takes the machine-state colour. */
export function Platform() {
  const store = useStore()
  const rim = useRef<THREE.MeshStandardMaterial>(null)
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  const col = useMemo(() => new THREE.Color(), [])
  const target = useMemo(() => new THREE.Color(), [])

  const top = useMemo(
    () =>
      canvasTexture(1536, 1536, (ctx, w, h) => {
        const cx = w / 2
        const cy = h / 2
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2)
        g.addColorStop(0, '#171b1e')
        g.addColorStop(0.7, '#111416')
        g.addColorStop(1, '#0b0d0e')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
        ctx.translate(cx, cy)
        // measured rings
        ctx.strokeStyle = 'rgba(235,232,222,0.07)'
        ctx.lineWidth = 2
        for (const r of [0.24, 0.42, 0.6, 0.78, 0.93]) {
          ctx.beginPath()
          ctx.arc(0, 0, r * (w / 2), 0, Math.PI * 2)
          ctx.stroke()
        }
        // rim ticks + degrees
        for (let a = 0; a < 360; a += 2) {
          const major = a % 10 === 0
          const rad = (a * Math.PI) / 180
          const r0 = (w / 2) * 0.955
          const r1 = r0 + (major ? 26 : 12)
          ctx.strokeStyle = major ? 'rgba(235,232,222,0.28)' : 'rgba(235,232,222,0.12)'
          ctx.lineWidth = major ? 2.5 : 1.5
          ctx.beginPath()
          ctx.moveTo(Math.cos(rad) * r0, Math.sin(rad) * r0)
          ctx.lineTo(Math.cos(rad) * r1, Math.sin(rad) * r1)
          ctx.stroke()
          if (a % 30 === 0) {
            ctx.save()
            ctx.rotate(rad + Math.PI / 2)
            ctx.fillStyle = 'rgba(235,232,222,0.38)'
            ctx.font = `500 22px ${MONO}`
            ctx.textAlign = 'center'
            ctx.fillText(String(a), 0, -(w / 2) * 0.93)
            ctx.restore()
          }
        }
        // crosshair
        ctx.strokeStyle = 'rgba(235,232,222,0.09)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(-w / 2, 0)
        ctx.lineTo(w / 2, 0)
        ctx.moveTo(0, -h / 2)
        ctx.lineTo(0, h / 2)
        ctx.stroke()
        // bolt circle
        ctx.fillStyle = 'rgba(235,232,222,0.10)'
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2
          ctx.beginPath()
          ctx.arc(Math.cos(a) * w * 0.405, Math.sin(a) * w * 0.405, 7, 0, Math.PI * 2)
          ctx.fill()
        }
      }),
    [],
  )
  const shadow = useMemo(
    () =>
      canvasTexture(512, 256, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2)
        g.addColorStop(0, 'rgba(0,0,0,0.75)')
        g.addColorStop(0.6, 'rgba(0,0,0,0.35)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.save()
        ctx.scale(1, h / w)
        ctx.translate(0, (w - h) / 2 / (h / w))
        ctx.fillStyle = g
        ctx.fillRect(0, -w, w, w * 3)
        ctx.restore()
      }),
    [],
  )

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const state = store.sim.fw.fsm.state
    target.set(STATE_COLOR[state])
    col.lerp(target, 1 - Math.exp(-4 * dt))
    if (rim.current) {
      rim.current.emissive.copy(col)
      rim.current.emissiveIntensity = state === 'OFF' ? 0.25 : 1.3
    }
    if (glow.current) {
      glow.current.color.copy(col)
      glow.current.opacity = state === 'OFF' ? 0.02 : 0.1
    }
  })

  return (
    <group>
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[RADIUS, RADIUS + 0.1, 0.2, 96]} />
        <meshStandardMaterial color="#0e1112" metalness={0.6} roughness={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[RADIUS, 96]} />
        <meshStandardMaterial map={top} roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <torusGeometry args={[RADIUS - 0.02, 0.035, 8, 160]} />
        <meshStandardMaterial ref={rim} color="#111" emissive="#555" emissiveIntensity={0.3} />
      </mesh>
      {/* contact shadow under the machine */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.3, 0.006, 0]}>
        <planeGeometry args={[8.4, 3.6]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} />
      </mesh>
      {/* pool of state-coloured light around the tower */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[TOWER_POS[0], 0.007, TOWER_POS[2]]}>
        <circleGeometry args={[2.6, 48]} />
        <meshBasicMaterial ref={glow} color="#888" transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}
