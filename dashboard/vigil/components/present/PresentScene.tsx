'use client'

import { Environment, Lightformer } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Load } from '@vigil/components/bench/Load'
import { McuBoard } from '@vigil/components/bench/McuBoard'
import { Motor } from '@vigil/components/bench/Motor'
import { Sensors } from '@vigil/components/bench/Sensors'
import { StackTower } from '@vigil/components/bench/StackTower'
import { WORLD_OFFSET, damp } from '@vigil/components/bench/shared'
import { StoreContext } from '@vigil/components/sim/SimProvider'
import type { SimStore } from '@vigil/lib/sim/store'
import { SLIDES } from './slides'

const OFF = new THREE.Vector3(...WORLD_OFFSET)
const SHIFT = { left: -1, right: 1, center: 0 } as const

/** A flat stage that takes the slide's ink colour, with a bright rim — replaces the dark turntable so the bench sits *on* the colour. */
function Stage({ index }: { index: React.RefObject<number> }) {
  const disc = useRef<THREE.MeshBasicMaterial>(null)
  const rim = useRef<THREE.MeshBasicMaterial>(null)
  const col = useMemo(() => ({ a: new THREE.Color(), b: new THREE.Color() }), [])
  useFrame((_, dt) => {
    const sl = SLIDES[index.current ?? 0]
    const k = 1 - Math.exp(-3 * Math.min(dt, 0.05))
    if (disc.current) disc.current.color.lerp(col.a.set(sl.bg).lerp(col.b.set(sl.ink === '#ffffff' ? '#000000' : '#ffffff'), 0.3), k)
    if (rim.current) rim.current.color.lerp(col.b.set(sl.pop), k)
  })
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]}>
        <circleGeometry args={[6.4, 96]} />
        <meshBasicMaterial ref={disc} color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]}>
        <ringGeometry args={[6.4, 6.62, 96]} />
        <meshBasicMaterial ref={rim} color="#ffffff" toneMapped={false} />
      </mesh>
    </group>
  )
}

function World({ index }: { index: React.RefObject<number> }) {
  const rot = useRef(0)
  return (
    <group position={WORLD_OFFSET}>
      <Stage index={index} />
      <Motor rotRef={rot} />
      <Load rotRef={rot} />
      <Sensors rotRef={rot} />
      <McuBoard />
      <StackTower />
    </group>
  )
}

/** Flies the camera to each slide's pose. Position, target, field of view and sideways offset are all eased, so slides never cut. */
function Rig({ index }: { index: React.RefObject<number> }) {
  const { camera, size } = useThree()
  const cur = useRef({ pos: new THREE.Vector3(14, 9, 17), look: new THREE.Vector3(0.8, 0.9, 0.6), fov: 30, shift: 0, init: false })
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), l: new THREE.Vector3(), d: new THREE.Vector3() }), [])

  useFrame((s, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const sl = SLIDES[index.current ?? 0]
    const c = cur.current
    const aspect = size.width / Math.max(1, size.height)
    const narrow = aspect < 1
    const t = s.clock.elapsedTime

    tmp.l.set(...sl.cam.look).add(OFF)
    tmp.p.set(...sl.cam.pos).add(OFF)
    // gentle sway around the subject
    const sway = Math.sin(t * 0.38) * (sl.drift ?? 0) * 2.4
    tmp.d.copy(tmp.p).sub(tmp.l)
    // portrait / narrow windows need more distance
    if (narrow) tmp.d.multiplyScalar(Math.min(2.2, 1 / aspect + 0.25))
    else if (aspect < 1.5) tmp.d.multiplyScalar(1 + (1.5 - aspect) * 0.5)
    // side layouts leave the model only half the screen
    if (!narrow) tmp.d.multiplyScalar(1 + 1.15 * Math.abs(SHIFT[sl.model]))
    tmp.d.applyAxisAngle(new THREE.Vector3(0, 1, 0), sway)
    tmp.p.copy(tmp.l).add(tmp.d)

    const k = c.init ? 2.2 : 100
    c.init = true
    c.pos.x = damp(c.pos.x, tmp.p.x, k, dt)
    c.pos.y = damp(c.pos.y, tmp.p.y, k, dt)
    c.pos.z = damp(c.pos.z, tmp.p.z, k, dt)
    c.look.x = damp(c.look.x, tmp.l.x, k * 1.15, dt)
    c.look.y = damp(c.look.y, tmp.l.y, k * 1.15, dt)
    c.look.z = damp(c.look.z, tmp.l.z, k * 1.15, dt)
    c.fov = damp(c.fov, sl.cam.fov ?? 30, k, dt)
    c.shift = damp(c.shift, narrow ? 0 : SHIFT[sl.model] * Math.min(0.33, 0.27 + Math.max(0, 1.78 - aspect) * 0.14), 3, dt)

    const cam = camera as THREE.PerspectiveCamera
    cam.position.copy(c.pos)
    cam.lookAt(c.look)
    cam.fov = c.fov
    if (Math.abs(c.shift) > 0.002) cam.setViewOffset(size.width, size.height, -size.width * c.shift, 0, size.width, size.height)
    else cam.clearViewOffset()
    cam.updateProjectionMatrix()
  })
  return null
}

export default function PresentScene({ store, index }: { store: SimStore; index: React.RefObject<number> }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [14, 9, 17], fov: 30, near: 0.1, far: 90 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <StoreContext.Provider value={store}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[6, 9, 6]} intensity={2.6} color="#fff6e8" />
        <directionalLight position={[-7, 4, -5]} intensity={1.4} color="#bfe6ff" />
        <hemisphereLight args={['#ffffff', '#40305a', 0.7]} />
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={3.6} position={[0, 7, 0]} scale={[16, 4, 1]} rotation-x={Math.PI / 2} />
          <Lightformer form="rect" intensity={2.2} position={[-9, 3, 4]} scale={[7, 6, 1]} rotation-y={Math.PI / 2} />
          <Lightformer form="rect" intensity={1.6} position={[9, 2, -5]} scale={[7, 5, 1]} rotation-y={-Math.PI / 2} color="#ffffff" />
          <Lightformer form="ring" intensity={1.6} position={[0, 2, 10]} scale={6} color="#ffffff" />
        </Environment>
        <World index={index} />
        <Rig index={index} />
      </StoreContext.Provider>
    </Canvas>
  )
}
