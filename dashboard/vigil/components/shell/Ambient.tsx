'use client'

import { useEffect } from 'react'
import { useSnap } from '@vigil/components/sim/SimProvider'

/** Sets <html data-state>, which drives the --state colour inside .industry. Cleared when leaving the extension. */
export function StateBridge() {
  const state = useSnap((s) => s.state)
  useEffect(() => {
    document.documentElement.dataset.state = state.toLowerCase()
  }, [state])
  useEffect(() => () => void delete document.documentElement.dataset.state, [])
  return null
}
