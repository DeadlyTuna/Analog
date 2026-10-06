'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '@vigil/components/sim/SimProvider'
import { C, mono } from '@vigil/lib/theme'
import { canvasTexture } from './shared'

export const BOARD_POS = new THREE.Vector3(-0.9, 0.5, 3.55)
export const BOARD_TILT = -0.42

/** Terminal-block positions on the board (world space), one per sensor channel. */
export function terminalWorld(i: number): THREE.Vector3 {
  const o = new THREE.Object3D()
  o.position.copy(BOARD_POS)
  o.rotation.x = BOARD_TILT
  o.updateMatrixWorld(true)
  return o.localToWorld(new THREE.Vector3(-0.75 + i * 0.4, 0.12, -0.5))
}

/** The embedded controller: STM32 on a carrier board with LEDs, buzzer and relay driven by the real GPIO state. */
export function McuBoard() {
  const store = useStore()
  const ledG = useRef<THREE.MeshStandardMaterial>(null)
  const ledY = useRef<THREE.MeshStandardMaterial>(null)
  const ledR = useRef<THREE.MeshStandardMaterial>(null)
  const buzzer = useRef<THREE.Mesh>(null)
  const relayLed = useRef<THREE.MeshStandardMaterial>(null)
  const act = useRef<THREE.MeshStandardMaterial>(null)

  const pcb = useMemo(
    () =>
      canvasTexture(1024, 666, (ctx, w, h) => {
        ctx.fillStyle = '#0b1613'
        ctx.fillRect(0, 0, w, h)
        // copper traces
        ctx.strokeStyle = '#1d3a30'
        ctx.lineWidth = 3
        for (let i = 0; i < 38; i++) {
          ctx.beginPath()
          const y = 40 + ((i * 53) % (h - 80))
          ctx.moveTo(((i * 97) % 300) + 20, y)
          ctx.lineTo(w * 0.42, y)
          ctx.lineTo(w * 0.5, y + (i % 2 ? 34 : -34))
          ctx.lineTo(w - ((i * 61) % 240) - 30, y + (i % 2 ? 34 : -34))
          ctx.stroke()
        }
        ctx.fillStyle = '#c9a85a'
        for (let i = 0; i < 90; i++) {
          ctx.beginPath()
          ctx.arc(30 + ((i * 131) % (w - 60)), 30 + ((i * 71) % (h - 60)), 3.2, 0, Math.PI * 2)
          ctx.fill()
        }
        // silkscreen
        ctx.fillStyle = '#e9efe9'
        ctx.font = `700 34px "Big Shoulders Stencil Display Variable", Impact, sans-serif`
        ctx.fillText('VIGIL-M1  REV C', 28, 56)
        ctx.font = `500 17px ${mono()}`
        ;['VIB  ADC0', 'CUR  ADC1', 'TMP  ADC4', 'RPM  TIM2'].forEach((t, i) => ctx.fillText(t, 78 + i * 190, 150))
        ctx.fillText('PA5 ●G   PA6 ●Y   PA7 ●R', w - 330, 520)
        ctx.fillText('PB0 BZR   PB1 K1', w - 330, 548)
        ctx.fillText('UART2 115200 8N1', 28, h - 30)
        ctx.strokeStyle = '#e9efe9'
        ctx.lineWidth = 2
        ctx.strokeRect(10, 10, w - 20, h - 20)
      }),
    [],
  )
  const chip = useMemo(
    () =>
      canvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#0a0b0c'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#c9cdd0'
        ctx.font = `600 26px ${mono()}`
        ctx.fillText('STM32', 62, 98)
        ctx.fillText('F411CE', 52, 130)
        ctx.font = `500 14px ${mono()}`
        ctx.fillStyle = '#7d868b'
        ctx.fillText('ARM Cortex-M4F', 52, 160)
        ctx.beginPath()
        ctx.arc(30, 30, 8, 0, Math.PI * 2)
        ctx.fillStyle = '#7d868b'
        ctx.fill()
      }),
    [],
  )

  const pins = useMemo(() => {
    const out: [number, number][] = []
    for (let i = 0; i < 12; i++) {
      const p = -0.19 + (i / 11) * 0.38
      out.push([p, -0.25], [p, 0.25], [-0.25, p], [0.25, p])
    }
    return out
  }, [])

  useFrame((s) => {
    const g = store.sim.fw.gpio
    const t = s.clock.elapsedTime
    const set = (m: THREE.MeshStandardMaterial | null, on: boolean, c: string) => {
      if (!m) return
      m.emissive.set(c)
      m.emissiveIntensity = on ? 3.2 : 0.05
    }
    set(ledG.current, g.ledG, C.go)
    set(ledY.current, g.ledY, C.caution)
    set(ledR.current, g.ledR, C.stop)
    set(relayLed.current, !g.relayTrip && store.sim.mains, C.go)
    if (act.current) {
      act.current.emissive.set(C.vib)
      act.current.emissiveIntensity = 0.4 + 1.6 * (Math.sin(t * 38) > 0.2 ? 1 : 0.2)
    }
    if (buzzer.current) buzzer.current.scale.y = g.buzzer ? 1.25 : 1
    void t
  })

  return (
    <group position={BOARD_POS} rotation={[BOARD_TILT, 0, 0]}>
      {/* stand */}
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} position={[x, -0.26, 0.3]} rotation={[-BOARD_TILT, 0, 0]}>
          <boxGeometry args={[0.07, 0.5, 0.07]} />
          <meshStandardMaterial color="#394045" metalness={0.8} roughness={0.4} />
        </mesh>
      ))}
      {/* PCB */}
      <mesh>
        <boxGeometry args={[2.1, 0.06, 1.38]} />
        <meshStandardMaterial attach="material-0" color="#0b1613" roughness={0.6} />
        <meshStandardMaterial attach="material-1" color="#0b1613" roughness={0.6} />
        <meshStandardMaterial attach="material-2" map={pcb} roughness={0.45} metalness={0.15} />
        <meshStandardMaterial attach="material-3" color="#0b1613" roughness={0.6} />
        <meshStandardMaterial attach="material-4" color="#0b1613" roughness={0.6} />
        <meshStandardMaterial attach="material-5" color="#0b1613" roughness={0.6} />
      </mesh>
      {/* MCU */}
      <mesh position={[-0.1, 0.06, 0.05]}>
        <boxGeometry args={[0.5, 0.06, 0.5]} />
        <meshStandardMaterial map={chip} roughness={0.5} metalness={0.3} />
      </mesh>
      {pins.map(([x, z], i) => (
        <mesh key={i} position={[-0.1 + x * 1.0, 0.045, 0.05 + z * 1.0]}>
          <boxGeometry args={[0.018, 0.02, 0.018]} />
          <meshStandardMaterial color="#c8ccce" metalness={1} roughness={0.3} />
        </mesh>
      ))}
      {/* activity LED */}
      <mesh position={[0.28, 0.055, -0.1]}>
        <cylinderGeometry args={[0.025, 0.025, 0.03, 12]} />
        <meshStandardMaterial ref={act} color="#0a1a20" />
      </mesh>
      {/* sensor terminal blocks */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[-0.75 + i * 0.4, 0.1, -0.5]}>
          <boxGeometry args={[0.32, 0.14, 0.2]} />
          <meshStandardMaterial color="#1f6f4d" roughness={0.6} />
        </mesh>
      ))}
      {/* status LEDs */}
      {[
        { ref: ledG, z: 0.18, c: C.go },
        { ref: ledY, z: 0.34, c: C.caution },
        { ref: ledR, z: 0.5, c: C.stop },
      ].map((l, i) => (
        <mesh key={i} position={[0.78, 0.08, l.z - 0.2]}>
          <cylinderGeometry args={[0.055, 0.055, 0.07, 18]} />
          <meshStandardMaterial ref={l.ref} color={l.c} emissive={l.c} emissiveIntensity={0.05} roughness={0.35} />
        </mesh>
      ))}
      {/* buzzer */}
      <mesh ref={buzzer} position={[0.45, 0.12, 0.38]}>
        <cylinderGeometry args={[0.15, 0.15, 0.13, 28]} />
        <meshStandardMaterial color="#0c0d0e" roughness={0.5} />
      </mesh>
      <mesh position={[0.45, 0.19, 0.38]}>
        <cylinderGeometry args={[0.025, 0.025, 0.02, 12]} />
        <meshStandardMaterial color="#000" />
      </mesh>
      {/* relay */}
      <mesh position={[-0.55, 0.13, 0.42]}>
        <boxGeometry args={[0.36, 0.2, 0.28]} />
        <meshStandardMaterial color="#1c4e8f" roughness={0.5} />
      </mesh>
      <mesh position={[-0.37, 0.24, 0.42]}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 12]} />
        <meshStandardMaterial ref={relayLed} color={C.go} emissive={C.go} emissiveIntensity={0.05} />
      </mesh>
      {/* USB / UART connector */}
      <mesh position={[0.2, 0.1, 0.66]}>
        <boxGeometry args={[0.34, 0.14, 0.14]} />
        <meshStandardMaterial color="#9aa3a8" metalness={1} roughness={0.3} />
      </mesh>

    </group>
  )
}
