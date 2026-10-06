'use client'

import { useEffect, useSyncExternalStore } from 'react'

export type Quality = 'high' | 'low'

const KEY = 'vigil-quality'

let quality: Quality = 'high'
let explicit = false
let notice = false
let loaded = false
const listeners = new Set<() => void>()

function load() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const v = window.localStorage.getItem(KEY)
    if (v === 'high' || v === 'low') {
      quality = v
      explicit = true
    }
  } catch {
    /* storage blocked */
  }
}

const emit = () => listeners.forEach((l) => l())

/** Called by the user's own choice: remembered, and never overridden by the automatic fallback. */
export function chooseQuality(q: Quality) {
  load()
  quality = q
  explicit = true
  notice = false
  try {
    window.localStorage.setItem(KEY, q)
  } catch {
    /* ignore */
  }
  emit()
}

function autoDowngrade() {
  load()
  if (explicit || quality === 'low') return
  quality = 'low'
  notice = true
  emit()
}

export function dismissQualityNotice() {
  notice = false
  emit()
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useQuality(): Quality {
  return useSyncExternalStore(
    subscribe,
    () => {
      load()
      return quality
    },
    () => 'high' as Quality,
  )
}

export function useQualityNotice(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => notice,
    () => false,
  )
}

/**
 * Watches the frame rate while a 3D scene is on screen. If it stays under ~20 fps for two consecutive
 * three-second windows (after a four-second grace period for loading), rendering drops to Lite.
 */
export function useAdaptiveQuality(enabled = true) {
  useEffect(() => {
    load()
    if (!enabled || explicit || quality === 'low') return
    let raf = 0
    let frames = 0
    let start = 0
    let slow = 0
    let hiddenAt = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) {
        hiddenAt = t
        return
      }
      if (!start || hiddenAt) {
        start = t
        frames = 0
        hiddenAt = 0
        return
      }
      frames++
      if (t - start >= 3000) {
        const fps = (frames * 1000) / (t - start)
        slow = fps < 20 ? slow + 1 : 0
        if (slow >= 2) {
          cancelAnimationFrame(raf)
          autoDowngrade()
          return
        }
        start = t
        frames = 0
      }
    }
    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(loop)
    }, 4000)
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [enabled])
}
