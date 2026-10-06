import { CLASS_META } from '@vigil/lib/sim/config'
import type { StoreSnapshot } from '@vigil/lib/sim/store'

export interface Headline {
  title: string
  sub: string
}

/** Plain-language one-liner for the current machine condition. */
export function headline(s: Pick<StoreSnapshot, 'state' | 'diag' | 'reason'>): Headline {
  const { state, diag } = s
  switch (state) {
    case 'OFF':
      return { title: 'Motor stopped', sub: 'The contactor is open. Start the motor to resume monitoring.' }
    case 'STARTUP':
      return { title: 'Starting up', sub: 'Limits are inhibited while the motor accelerates and the inrush current dies away.' }
    case 'TRIPPED':
      return { title: 'Protective trip', sub: s.reason }
    case 'HEALTHY':
      if (diag.cls === 'healthy') return { title: 'Running normally', sub: diag.detail }
      return { title: `Early sign: ${CLASS_META[diag.cls].label.toLowerCase()}`, sub: diag.detail }
    default:
      return {
        title: diag.cls === 'healthy' ? 'Out-of-limit reading' : CLASS_META[diag.cls].label,
        sub: diag.detail,
      }
  }
}
