'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { useSnap } from '@vigil/components/sim/SimProvider'
import { C, rgba } from '@vigil/lib/theme'
import { fmt } from '@vigil/lib/utils'
import { BOARD_POS } from './McuBoard'
import { TAG_END } from './Sensors'
import { TOWER_POS } from './StackTower'
import { WORLD_OFFSET } from './shared'

/**
 * Callout tags are plain DOM elements rendered in the normal React tree, so hooks and context just work.
 * Each frame the scene projects a 3D anchor to screen space and writes it into the element's transform.
 */
export class TagRegistry {
  els = new Map<string, HTMLElement>()
}

const off = new THREE.Vector3(...WORLD_OFFSET)
const world = (v: THREE.Vector3) => v.clone().add(off)

export const TAGS: { id: string; at: THREE.Vector3 }[] = [
  { id: 'vib', at: world(TAG_END.vib) },
  { id: 'temp', at: world(TAG_END.temp) },
  { id: 'cur', at: world(TAG_END.cur) },
  { id: 'rpm', at: world(TAG_END.rpm) },
  { id: 'mcu', at: world(new THREE.Vector3(BOARD_POS.x, BOARD_POS.y + 0.75, BOARD_POS.z)) },
  { id: 'tower', at: world(new THREE.Vector3(TOWER_POS[0] + 0.95, 1.75, TOWER_POS[2] + 0.2)) },
  { id: 'k1', at: world(new THREE.Vector3(1.7, 1.05, 3.1)) },
]

/** Lives inside <Canvas>. */
export function TagProjector({ registry }: { registry: TagRegistry }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    for (const t of TAGS) {
      const el = registry.els.get(t.id)
      if (!el) continue
      v.copy(t.at).project(camera)
      const hidden = v.z > 1 || v.z < -1
      const hw = el.offsetWidth / 2 + 6
      const hh = el.offsetHeight / 2 + 6
      const x = Math.min(size.width - hw, Math.max(hw, (v.x * 0.5 + 0.5) * size.width))
      const y = Math.min(size.height - hh, Math.max(hh, (-v.y * 0.5 + 0.5) * size.height))
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`
      el.style.opacity = hidden ? '0' : '1'
    }
  })
  return null
}

function Slot({ id, registry, children }: { id: string; registry: TagRegistry; children: ReactNode }) {
  return (
    <div
      ref={(el) => {
        if (el) registry.els.set(id, el)
        else registry.els.delete(id)
      }}
      className="absolute left-0 top-0 will-change-transform"
      style={{ transform: 'translate3d(-999px,-999px,0)', opacity: 0 }}
    >
      {children}
    </div>
  )
}

/** DOM overlay. Place inside the same positioned container as the canvas. */
export function TagLayer({ registry, hide = [] }: { registry: TagRegistry; hide?: string[] }) {
  useEffect(() => {
    const els = registry.els
    return () => els.clear()
  }, [registry])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {(['vib', 'temp', 'cur', 'rpm'] as const).map((ch) => (
        <Slot key={ch} id={ch} registry={registry}>
          <SensorTag ch={ch} />
        </Slot>
      ))}
      {!hide.includes('mcu') && (
        <Slot id="mcu" registry={registry}>
          <McuTag />
        </Slot>
      )}
      {!hide.includes('tower') && (
        <Slot id="tower" registry={registry}>
          <TowerTag />
        </Slot>
      )}
      {!hide.includes('k1') && (
        <Slot id="k1" registry={registry}>
          <div className="whitespace-nowrap rounded border border-ink-500 bg-ink-900/85 px-1.5 py-0.5">
            <span className="label !text-[9px] !text-bone">K1 contactor</span>
          </div>
        </Slot>
      )}
    </div>
  )
}

const COLOR = { vib: C.vib, temp: C.temp, cur: C.cur, rpm: C.rpm } as const
const N = { vib: 1, temp: 2, cur: 3, rpm: 4 } as const
const NAME = { vib: 'VIB', temp: 'TEMP', cur: 'CUR', rpm: 'RPM' } as const

function SensorTag({ ch }: { ch: 'vib' | 'temp' | 'cur' | 'rpm' }) {
  const v = useSnap((s) => {
    const m = s.meas
    switch (ch) {
      case 'vib':
        return `${fmt(m.vibRms, 2)} g`
      case 'temp':
        return `${fmt(m.tempC, 1)} °C`
      case 'cur':
        return `${fmt(m.curRms, 2)} A`
      default:
        return `${fmt(m.rpm, 0)} rpm`
    }
  })
  return (
    <div className="flex items-stretch overflow-hidden whitespace-nowrap rounded-md border bg-ink-900/85 backdrop-blur" style={{ borderColor: rgba(COLOR[ch], 0.53) }}>
      <span className="grid w-[18px] place-items-center font-mono text-[10px] font-bold text-ink-950" style={{ background: COLOR[ch] }}>
        {N[ch]}
      </span>
      <span className="px-2 py-1">
        <span className="label !text-[9px]" style={{ color: COLOR[ch] }}>
          {NAME[ch]}
        </span>
        <span className="mono ml-2 text-[12px] font-medium text-bone">{v}</span>
      </span>
    </div>
  )
}

function McuTag() {
  const cpu = useSnap((s) => s.rtos.cpuLoad)
  const mhz = useSnap((s) => s.rtos.clockMHz)
  return (
    <div className="whitespace-nowrap rounded-md border border-ink-500 bg-ink-900/85 px-2.5 py-1.5 backdrop-blur">
      <div className="label !text-bone">Embedded MCU</div>
      <div className="mono mt-1 text-[10px] text-steel-200">
        {mhz} MHz · CPU {fmt(cpu * 100, 1)} %
      </div>
    </div>
  )
}

function TowerTag() {
  const state = useSnap((s) => s.state)
  const word = state === 'STARTUP' ? 'STARTING' : state
  return (
    <div
      className="whitespace-nowrap rounded-md border px-2.5 py-1.5 backdrop-blur"
      style={{ borderColor: 'color-mix(in oklab, var(--state) 50%, transparent)', background: 'rgba(15,17,18,.85)' }}
    >
      <div className="label !text-bone">Stack light</div>
      <div className="mono mt-1 text-[10px] font-medium tracking-[0.1em]" style={{ color: 'var(--state)' }}>
        {word}
      </div>
    </div>
  )
}
