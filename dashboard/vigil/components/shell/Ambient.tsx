'use client'

import { useEffect } from 'react'
import { useSnap } from '@vigil/components/sim/SimProvider'

/** Sets <html data-state>, which drives the --state colour that lights the whole page. */
export function StateBridge() {
  const state = useSnap((s) => s.state)
  useEffect(() => {
    document.documentElement.dataset.state = state.toLowerCase()
  }, [state])
  return null
}

export function Backdrop() {
  return <div className="backdrop" aria-hidden />
}

export function Ambient() {
  return <div className="ambient" aria-hidden />
}
