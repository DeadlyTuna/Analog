'use client'

import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { StoreContext } from '@vigil/components/sim/SimProvider'
import { useMediaQuery } from '@vigil/lib/useMediaQuery'
import type { SimStore } from '@vigil/lib/sim/store'
import { BearingRings, HeatShimmer } from './Effects'
import { Load } from './Load'
import { McuBoard } from './McuBoard'
import { Motor } from './Motor'
import { Platform } from './Platform'
import { Sensors } from './Sensors'
import { StackTower } from './StackTower'
import { WORLD_OFFSET } from './shared'
import { TagProjector, type TagRegistry } from './tags'

export interface BenchProps {
  store: SimStore
  tags?: TagRegistry
  autoRotate?: boolean
  /** allow dragging to orbit */
  interactive?: boolean
  quality?: 'high' | 'low'
  /** shift the scene to the right of centre by this fraction of the viewport width (hero layout) */
  shift?: number
  preset?: 'room' | 'hero'
}

const PRESET = {
  room: { pos: new THREE.Vector3(7.2, 4.9, 8.7), target: new THREE.Vector3(0.45, 1.3, 0.35), fov: 31 },
  hero: { pos: new THREE.Vector3(10.4, 6.0, 12.8), target: new THREE.Vector3(0.4, 0.9, 0.4), fov: 31 },
}

function World() {
  const rot = useRef(0)
  return (
    <group position={WORLD_OFFSET}>
      <Platform />
      <Motor rotRef={rot} />
      <Load rotRef={rot} />
      <Sensors rotRef={rot} />
      <McuBoard />
      <StackTower />
      <HeatShimmer />
      <BearingRings />
    </group>
  )
}

/** Eases the camera in from a wide shot, and applies the horizontal view offset for the hero layout. */
function CameraRig({ preset, shift, controls }: { preset: 'room' | 'hero'; shift: number; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera, size } = useThree()
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)')
  const t0 = useRef(-1)
  const done = useRef(false)
  const p = PRESET[preset]
  // portrait / narrow canvases need more distance to keep the whole bench in frame
  const aspect = size.width / Math.max(1, size.height)
  const back = Math.min(2.1, Math.max(1, 1.1 / aspect))
  const end = useMemo(() => p.target.clone().add(p.pos.clone().sub(p.target).multiplyScalar(back)), [p, back])
  const start = useMemo(() => end.clone().multiplyScalar(1.45).setY(end.y * 1.7), [end])

  useEffect(() => {
    const c = camera as THREE.PerspectiveCamera
    c.fov = p.fov
    if (shift) c.setViewOffset(size.width, size.height, -size.width * shift, 0, size.width, size.height)
    else c.clearViewOffset()
    c.updateProjectionMatrix()
    return () => c.clearViewOffset()
  }, [camera, size.width, size.height, shift, p.fov])

  const touched = useRef(false)

  // keep the whole bench in frame when the canvas is resized or the phone is rotated
  useEffect(() => {
    if (!done.current || touched.current) return
    camera.position.copy(end)
    controls.current?.target.copy(p.target)
    controls.current?.update()
  }, [end, camera, controls, p.target])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const stop = () => {
      done.current = true
      touched.current = true
    }
    c.addEventListener('start', stop)
    return () => c.removeEventListener('start', stop)
  }, [controls])

  useFrame((s) => {
    if (done.current) return
    if (t0.current < 0) t0.current = s.clock.elapsedTime
    const k = reduce ? 1 : Math.min(1, (s.clock.elapsedTime - t0.current) / 2.6)
    const e = 1 - Math.pow(1 - k, 3.2)
    camera.position.lerpVectors(start, end, e)
    controls.current?.target.copy(p.target)
    controls.current?.update()
    if (k >= 1) done.current = true
  })
  return null
}

function Rig({ autoRotate, interactive, preset, shift }: Pick<BenchProps, 'autoRotate' | 'interactive' | 'preset' | 'shift'>) {
  const controls = useRef<OrbitControlsImpl>(null)
  const pr = preset ?? 'room'
  return (
    <>
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableZoom={false}
        enableRotate={interactive !== false}
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate}
        autoRotateSpeed={0.45}
        minPolarAngle={0.35}
        maxPolarAngle={1.5}
        target={PRESET[pr].target}
      />
      <CameraRig preset={pr} shift={shift ?? 0} controls={controls} />
    </>
  )
}

export default function BenchScene({ store, tags, autoRotate: autoRotateProp = false, interactive = true, quality = 'high', shift = 0, preset = 'room' }: BenchProps) {
  const high = quality === 'high'
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)')
  const autoRotate = autoRotateProp && !reduce
  return (
    <Canvas
      key={quality}
      dpr={high ? [1, 1.75] : 1}
      camera={{ position: PRESET[preset].pos.toArray(), fov: PRESET[preset].fov, near: 0.1, far: 80 }}
      gl={{ antialias: !high, powerPreference: 'high-performance', alpha: false }}
      flat={high}
      style={{ touchAction: interactive ? 'pan-y' : 'auto' }}
    >
      <StoreContext.Provider value={store}>
        <color attach="background" args={['#0b0d0f']} />
        <ambientLight intensity={0.3} />
        <directionalLight position={[6, 9, 6]} intensity={2.3} color="#fff1dc" />
        <directionalLight position={[-7, 4, -5]} intensity={1.2} color="#7fcfff" />
        <hemisphereLight args={['#6c7f8a', '#0b0d0e', 0.45]} />
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={3.4} position={[0, 7, 0]} scale={[16, 4, 1]} rotation-x={Math.PI / 2} />
          <Lightformer form="rect" intensity={1.8} position={[-9, 3, 4]} scale={[7, 6, 1]} rotation-y={Math.PI / 2} />
          <Lightformer form="rect" intensity={1.2} position={[9, 2, -5]} scale={[7, 5, 1]} rotation-y={-Math.PI / 2} color="#9ad7ff" />
          <Lightformer form="ring" intensity={1.4} position={[0, 2, 10]} scale={6} color="#ffe9c9" />
        </Environment>
        <World />
        {tags && <TagProjector registry={tags} />}
        <Rig autoRotate={autoRotate} interactive={interactive} preset={preset} shift={shift} />
        {high && (
          <EffectComposer multisampling={4} enableNormalPass={false}>
            <Bloom intensity={0.95} luminanceThreshold={1} luminanceSmoothing={0.25} mipmapBlur radius={0.75} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        )}
      </StoreContext.Provider>
    </Canvas>
  )
}
