import type { FsmState } from '@vigil/lib/sim/config'

/** The brand mark: a three-lamp andon stack light. Lit segments follow the machine state. */
export function StackGlyph({ state, size = 28 }: { state: FsmState; size?: number }) {
  const red = state === 'CRITICAL' || state === 'TRIPPED'
  const amber = state === 'WARNING'
  const green = state === 'HEALTHY'
  const test = state === 'STARTUP'
  const lamp = (y: number, color: string, on: boolean, delay: string) => (
    <g>
      {on && <rect x="5" y={y - 1.5} width="22" height="10" rx="4" fill={color} opacity="0.22" filter="url(#glow)" />}
      <rect
        x="8.5"
        y={y}
        width="15"
        height="6"
        rx="2"
        fill={on || test ? color : '#2a3034'}
        style={test ? { animation: `pulse-dot 1.1s ${delay} infinite` } : undefined}
        opacity={on || test ? 1 : 0.9}
      />
    </g>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={`Machine state: ${state.toLowerCase()}`}>
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>
      {lamp(3, '#ff4338', red, '0s')}
      {lamp(10.2, '#ffb21e', amber, '0.18s')}
      {lamp(17.4, '#2ee67c', green, '0.36s')}
      <rect x="6" y="24.6" width="20" height="3.2" rx="1.2" fill="#3a4146" />
      <rect x="14.2" y="23" width="3.6" height="2" fill="#566067" />
    </svg>
  )
}
