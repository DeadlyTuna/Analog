'use client'

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { SimStore, type StoreSnapshot } from '@vigil/lib/sim/store'

/** Exported so the 3D canvas (a separate React root) can re-provide the same store inside itself. */
export const StoreContext = createContext<SimStore | null>(null)
const Ctx = StoreContext

export function SimProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new SimStore())

  useEffect(() => {
    store.start()
    // safety net: never leave the simulator held if the splash does not run
    const t = window.setTimeout(() => store.release(), 4000)
    return () => {
      window.clearTimeout(t)
      store.stop()
    }
  }, [store])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

/** The store itself — stable for the lifetime of the app. Use for actions and for reading sim buffers in rAF loops. */
export function useStore(): SimStore {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be used inside <SimProvider>')
  return s
}

/**
 * Subscribe to a slice of the snapshot. The selector result is cached per snapshot and compared with
 * `isEqual`, so a component only re-renders when its slice actually changes.
 */
export function useSnap<T>(select: (s: StoreSnapshot) => T, isEqual: (a: T, b: T) => boolean = Object.is): T {
  const store = useStore()
  const cache = useRef<{ snap: StoreSnapshot; value: T } | null>(null)
  const selectRef = useRef(select)
  const eqRef = useRef(isEqual)
  useEffect(() => {
    selectRef.current = select
    eqRef.current = isEqual
  })

  const get = () => {
    const snap = store.getSnapshot()
    const c = cache.current
    if (c && c.snap === snap) return c.value
    const next = selectRef.current(snap)
    if (c && eqRef.current(c.value, next)) {
      cache.current = { snap, value: c.value }
      return c.value
    }
    cache.current = { snap, value: next }
    return next
  }
  return useSyncExternalStore(store.subscribe, get, get)
}

/** The whole snapshot (re-renders at ~15 Hz). Prefer `useSnap(selector)` for hot components. */
export function useFullSnap(): StoreSnapshot {
  return useSnap((s) => s)
}

export const shallowEqual = <T,>(a: T, b: T): boolean => {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const ka = Object.keys(a) as (keyof T)[]
  const kb = Object.keys(b) as (keyof T)[]
  if (ka.length !== kb.length) return false
  for (const k of ka) if (!Object.is(a[k], b[k])) return false
  return true
}
