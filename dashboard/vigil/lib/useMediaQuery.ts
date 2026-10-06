'use client'

import { useSyncExternalStore } from 'react'

/** SSR-safe matchMedia. Returns `fallback` on the server and during hydration. */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  )
}
