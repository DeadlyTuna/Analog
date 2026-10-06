'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '@vigil/components/sim/SimProvider'
import { C, MONO } from '@vigil/lib/theme'
import { RATED } from '@vigil/lib/sim/config'
import { Y0, canvasTexture, clamp01, damp, hash, heatColor, heatOf } from './shared'

const FINS = 30
const R = 0.68

/** The motor itself: finned frame, end shields, fan + cowl, shaft, terminal box. Shakes with vibration, glows with heat. */
export function Motor({ rotRef }: { rotRef: React.MutableRefObject<number> }) {
  const store = useStore()
  const shake = useRef<THREE.Group>(null)
  const fan = useRef<THREE.Group>(null)
  const shaft = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const debris = useRef<THREE.Mesh>(null)
  const arcs = useRef<THREE.Group>(null)
  const finMesh = useRef<THREE.InstancedMesh>(null)
  const state = useRef({ heat: 0, vib: 0, blocked: 0, arc: 0 })

  const paint = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2b3942', metalness: 0.55, roughness: 0.42, emissive: new THREE.Color('#000'), emissiveIntensity: 0 }),
    [],
  )
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b4bcc1', metalness: 1, roughness: 0.28 }), [])
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0d0f10', metalness: 0.2, roughness: 0.7 }), [])
  const boxMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#34454f', metalness: 0.5, roughness: 0.5, emissive: new THREE.Color('#000') }), [])

  const nameplate = useMemo(
    () =>
      canvasTexture(512, 270, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, w, h)
        g.addColorStop(0, '#c9ced0')
        g.addColorStop(0.5, '#e4e7e6')
        g.addColorStop(1, '#a9b0b3')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#1b1f21'
        ctx.font = `700 40px "Big Shoulders Stencil Display Variable", Impact, sans-serif`
        ctx.fillText('VIGIL-M1  3~ INDUCTION MOTOR', 24, 56)
        ctx.font = `500 26px ${MONO}`
        const rows = [
          `${RATED.kW} kW   ${RATED.volts} V   ${RATED.freq} Hz`,
          `${RATED.current} A    ${RATED.rpm} min⁻¹   S1`,
          `IP55   Cl.F   ${RATED.poles} POLE   IE2`,
          'SER. 0042-7-A   2026',
        ]
        rows.forEach((r, i) => ctx.fillText(r, 24, 106 + i * 40))
        ctx.strokeStyle = '#1b1f21'
        ctx.lineWidth = 3
        ctx.strokeRect(6, 6, w - 12, h - 12)
        for (const [x, y] of [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18]]) {
          ctx.beginPath()
          ctx.arc(x, y, 4, 0, Math.PI * 2)
          ctx.fillStyle = '#6a7276'
          ctx.fill()
        }
      }),
    [],
  )

  // fins are instanced: one draw call for 30 boxes
  const finMatrices = useMemo(() => {
    const o = new THREE.Object3D()
    const arr: THREE.Matrix4[] = []
    for (let i = 0; i < FINS; i++) {
      const th = (i / FINS) * Math.PI * 2
      o.position.set(0, Y0 + Math.cos(th) * (R + 0.075), Math.sin(th) * (R + 0.075))
      o.rotation.set(th, 0, 0)
      o.updateMatrix()
      arr.push(o.matrix.clone())
    }
    return arr
  }, [])

  // fan blades
  const blades = useMemo(() => Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2), [])
  const slots = useMemo(() => Array.from({ length: 14 }, (_, i) => (i / 14) * Math.PI * 2), [])
  const spokes = useMemo(() => Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2), [])

  const arcGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 3 * 10), 3))
    return g
  }, [])
  const arcMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#cfe6ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), [])
  const arcLines = useMemo(() => [0, 1, 2].map(() => new THREE.Line(arcGeo.clone(), arcMat)), [arcGeo, arcMat])

  useFrame((s, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const sim = store.sim
    const live = sim.live
    const t = s.clock.elapsedTime
    const st = state.current
    const f = live.faults

    // fin matrices (once)
    if (finMesh.current && !finMesh.current.userData.ready) {
      finMatrices.forEach((m, i) => finMesh.current!.setMatrixAt(i, m))
      finMesh.current.instanceMatrix.needsUpdate = true
      finMesh.current.userData.ready = true
    }

    // heat → emissive paint
    st.heat = damp(st.heat, heatOf(live.tempC), 3, dt)
    const u = st.heat
    heatColor(u, paint.emissive)
    paint.emissiveIntensity = 1.5 * Math.pow(u, 1.25)
    boxMat.emissive.copy(paint.emissive)
    boxMat.emissiveIntensity = paint.emissiveIntensity * 0.6
    if (light.current) {
      light.current.intensity = 14 * u * u
      heatColor(u, light.current.color)
    }

    // vibration → shake (amplitude above the healthy baseline, exaggerated)
    const excess = Math.max(0, live.vibRms - 0.2)
    st.vib = damp(st.vib, excess, 6, dt)
    const a = st.vib * 0.085 * clamp01(live.omega / 120)
    if (shake.current) {
      shake.current.position.set(
        a * (Math.sin(t * 71) + 0.6 * Math.sin(t * 113 + 1.1)),
        a * 0.8 * (Math.sin(t * 89 + 0.4) + 0.5 * Math.sin(t * 137)),
        a * 0.7 * Math.sin(t * 61 + 2.1),
      )
      shake.current.rotation.z = a * 0.15 * Math.sin(t * 83)
    }

    // rotation (visual speed is scaled down so the eye can follow it)
    const vis = (live.rpm / RATED.rpm) * 7.2
    rotRef.current += vis * dt
    if (fan.current) fan.current.rotation.x = rotRef.current
    if (shaft.current) shaft.current.rotation.x = rotRef.current

    // blocked cooling → debris over the cowl
    st.blocked = damp(st.blocked, f.cooling, 4, dt)
    if (debris.current) {
      const m = debris.current.material as THREE.MeshStandardMaterial
      m.opacity = 0.94 * clamp01(st.blocked * 1.6)
      debris.current.visible = m.opacity > 0.02
    }

    // electrical arcs at the terminal box
    st.arc = damp(st.arc, f.electrical, 5, dt)
    if (arcs.current) {
      const visible = st.arc > 0.04 && live.powered
      arcs.current.visible = visible
      if (visible) {
        arcLines.forEach((line, k) => {
          const on = hash(Math.floor(t * 24) + k * 7.3) < 0.35 + 0.5 * st.arc
          line.visible = on
          if (!on) return
          const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute
          const n = pos.count
          const x0 = 0.15 + (hash(k * 3.1 + Math.floor(t * 24)) - 0.5) * 0.3
          for (let i = 0; i < n; i++) {
            const p = i / (n - 1)
            const jitter = Math.sin(p * Math.PI)
            pos.setXYZ(
              i,
              x0 + p * (-0.35 + k * 0.35) + (hash(i * 5.7 + t * 40 + k) - 0.5) * 0.14 * jitter,
              Y0 + 0.92 - p * 0.28 + (hash(i * 9.1 + t * 50 + k) - 0.5) * 0.12 * jitter,
              0.18 + p * 0.5 + (hash(i * 2.3 + t * 33 + k) - 0.5) * 0.14 * jitter,
            )
          }
          pos.needsUpdate = true
        })
      }
    }
  })

  return (
    <group>
      <group ref={shake}>
        {/* frame */}
        <mesh position={[0, Y0, 0]} rotation={[0, 0, Math.PI / 2]} material={paint}>
          <cylinderGeometry args={[R, R, 1.9, 64]} />
        </mesh>
        <instancedMesh ref={finMesh} args={[undefined, undefined, FINS]} material={paint}>
          <boxGeometry args={[1.7, 0.16, 0.07]} />
        </instancedMesh>
        {/* frame end rings */}
        {[-0.93, 0.93].map((x) => (
          <mesh key={x} position={[x, Y0, 0]} rotation={[0, 0, Math.PI / 2]} material={paint}>
            <cylinderGeometry args={[R + 0.06, R + 0.06, 0.12, 64]} />
          </mesh>
        ))}
        {/* drive-end shield + bearing boss */}
        <mesh position={[1.07, Y0, 0]} rotation={[0, 0, Math.PI / 2]} material={paint}>
          <cylinderGeometry args={[R + 0.02, R + 0.02, 0.2, 64]} />
        </mesh>
        <mesh position={[1.25, Y0, 0]} rotation={[0, 0, Math.PI / 2]} material={paint}>
          <cylinderGeometry args={[0.36, 0.4, 0.22, 48]} />
        </mesh>
        <mesh position={[1.38, Y0, 0]} rotation={[0, 0, Math.PI / 2]} material={dark}>
          <cylinderGeometry args={[0.22, 0.22, 0.05, 40]} />
        </mesh>
        {/* non-drive end + cowl */}
        <mesh position={[-1.07, Y0, 0]} rotation={[0, 0, Math.PI / 2]} material={paint}>
          <cylinderGeometry args={[R + 0.02, R + 0.02, 0.2, 64]} />
        </mesh>
        <mesh position={[-1.5, Y0, 0]} rotation={[0, 0, Math.PI / 2]} material={paint}>
          <cylinderGeometry args={[0.54, 0.7, 0.66, 56, 1, true]} />
        </mesh>
        <mesh position={[-1.5, Y0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.535, 0.695, 0.66, 56, 1, true]} />
          <meshStandardMaterial color="#05080a" side={THREE.BackSide} roughness={0.9} />
        </mesh>
        {/* air-inlet slots */}
        {slots.map((a, i) => (
          <mesh key={i} position={[-1.38, Y0 + Math.cos(a) * 0.64, Math.sin(a) * 0.64]} rotation={[a, 0, 0]} material={dark}>
            <boxGeometry args={[0.22, 0.03, 0.1]} />
          </mesh>
        ))}
        {/* grille */}
        {[0.2, 0.38, 0.52].map((r) => (
          <mesh key={r} position={[-1.83, Y0, 0]} rotation={[0, Math.PI / 2, 0]} material={paint}>
            <torusGeometry args={[r, 0.012, 8, 48]} />
          </mesh>
        ))}
        {spokes.map((a, i) => (
          <group key={i} position={[-1.83, Y0, 0]} rotation={[a, 0, 0]}>
            <mesh position={[0, 0.3, 0]} material={paint}>
              <boxGeometry args={[0.02, 0.6, 0.02]} />
            </mesh>
          </group>
        ))}
        {/* fan (visible through the grille) */}
        <group ref={fan} position={[-1.55, Y0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} material={dark}>
            <cylinderGeometry args={[0.14, 0.14, 0.14, 24]} />
          </mesh>
          {blades.map((a, i) => (
            <group key={i} rotation={[a, 0, 0]}>
              <mesh position={[0, 0.32, 0]} rotation={[0.55, 0, 0]} material={steel}>
                <boxGeometry args={[0.035, 0.34, 0.15]} />
              </mesh>
            </group>
          ))}
        </group>
        {/* cardboard-and-lint blockage for the cooling-failure fault */}
        <mesh ref={debris} position={[-1.855, Y0, 0]} rotation={[0, Math.PI / 2, 0]} visible={false}>
          <circleGeometry args={[0.6, 40]} />
          <meshStandardMaterial color="#4a3f31" roughness={1} transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>

        {/* shaft + key */}
        <group ref={shaft} position={[0, Y0, 0]}>
          <mesh position={[1.9, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={steel}>
            <cylinderGeometry args={[0.12, 0.12, 1.2, 32]} />
          </mesh>
          <mesh position={[2.1, 0.115, 0]} material={steel}>
            <boxGeometry args={[0.4, 0.04, 0.06]} />
          </mesh>
          {/* speed-sensing collar with a magnet */}
          <mesh position={[2.15, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={dark}>
            <cylinderGeometry args={[0.17, 0.17, 0.1, 32]} />
          </mesh>
          <mesh position={[2.15, 0.165, 0]}>
            <boxGeometry args={[0.07, 0.03, 0.07]} />
            <meshStandardMaterial color={C.bone} emissive={C.bone} emissiveIntensity={0.5} />
          </mesh>
        </group>

        {/* feet */}
        {[-0.58, 0.58].map((z) => (
          <mesh key={z} position={[0.05, Y0 - 0.76, z * 1.08]} material={paint}>
            <boxGeometry args={[1.5, 0.3, 0.24]} />
          </mesh>
        ))}

        {/* terminal box */}
        <group position={[0.15, Y0 + R + 0.2, 0]}>
          <mesh material={boxMat}>
            <boxGeometry args={[0.64, 0.34, 0.5]} />
          </mesh>
          <mesh position={[0, 0.19, 0]} material={boxMat}>
            <boxGeometry args={[0.7, 0.05, 0.56]} />
          </mesh>
          {[[-0.28, -0.22], [0.28, -0.22], [-0.28, 0.22], [0.28, 0.22]].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.225, z]} material={steel}>
              <cylinderGeometry args={[0.025, 0.025, 0.03, 12]} />
            </mesh>
          ))}
          <mesh position={[0, 0.02, 0.255]}>
            <planeGeometry args={[0.5, 0.26]} />
            <meshStandardMaterial map={nameplate} roughness={0.35} metalness={0.6} />
          </mesh>
          <mesh position={[0, -0.02, 0.35]} rotation={[Math.PI / 2, 0, 0]} material={dark}>
            <cylinderGeometry args={[0.07, 0.07, 0.2, 20]} />
          </mesh>
        </group>
        {/* lifting eye */}
        <mesh position={[-0.45, Y0 + R + 0.22, 0]} rotation={[0, Math.PI / 2, 0]} material={steel}>
          <torusGeometry args={[0.1, 0.028, 10, 24]} />
        </mesh>
      </group>

      {/* arcs + heat light stay with the shaking frame visually but are cheap */}
      <group ref={arcs} visible={false}>
        {arcLines.map((l, i) => (
          <primitive key={i} object={l} />
        ))}
      </group>
      <pointLight ref={light} position={[0, Y0 + 0.2, 0.3]} intensity={0} distance={5} decay={2} />

      {/* base plate (does not shake) */}
      <mesh position={[0.3, 0.07, 0]}>
        <boxGeometry args={[4.4, 0.14, 1.95]} />
        <meshStandardMaterial color="#1c2226" metalness={0.6} roughness={0.5} />
      </mesh>
      {[[-1.7, -0.78], [-1.7, 0.78], [2.3, -0.78], [2.3, 0.78]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.16, z]} material={steel}>
          <cylinderGeometry args={[0.06, 0.06, 0.06, 6]} />
        </mesh>
      ))}
    </group>
  )
}
