'use client'

import { useSnap } from '@vigil/components/sim/SimProvider'
import { C } from '@vigil/lib/theme'
import { MCU } from '@vigil/lib/sim/config'
import { fmt } from '@vigil/lib/utils'

/** Block diagram of the controller: sensors in on the left, GPIO out on the right, UART links below. Lit by live activity. */

const IN = [
  { y: 110, name: 'VIBRATION', pin: 'PA0 · ADC1_IN0', c: C.vib },
  { y: 200, name: 'CURRENT', pin: 'PA1 · ADC1_IN1', c: C.cur },
  { y: 290, name: 'TEMPERATURE', pin: 'PA4 · ADC1_IN4', c: C.temp },
  { y: 380, name: 'TACHO', pin: 'PA15 · TIM2_CH1', c: C.rpm },
] as const

const OUT = [
  { y: 96, name: 'LED GREEN', pin: 'PA5', c: C.go, k: 'ledG' },
  { y: 168, name: 'LED AMBER', pin: 'PA6', c: C.caution, k: 'ledY' },
  { y: 240, name: 'LED RED', pin: 'PA7', c: C.stop, k: 'ledR' },
  { y: 312, name: 'BUZZER', pin: 'PB0', c: C.bone, k: 'buzzer' },
  { y: 384, name: 'RELAY K1 TRIP', pin: 'PB1', c: C.forecast, k: 'relayTrip' },
] as const

function Block({ x, y, w, h, title, sub, hot, color = C.bone }: { x: number; y: number; w: number; h: number; title: string; sub?: string; hot?: boolean; color?: string }) {
  return (
    <g>
      {hot && <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx="9" fill={color} opacity="0.2" filter="url(#bd-glow)" />}
      <rect x={x} y={y} width={w} height={h} rx="7" fill={hot ? `${color}18` : '#14181a'} stroke={hot ? color : C.ink500} strokeWidth={hot ? 1.4 : 1} style={{ transition: 'all 200ms' }} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 3 : h / 2 + 4)} textAnchor="middle" className="diagram-text" fontSize="10.5" fontWeight="600" fill={hot ? color : C.steel2}>
        {title}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" className="diagram-text" fontSize="9" fill={C.steel3}>
          {sub}
        </text>
      )}
    </g>
  )
}

export function BoardDiagram() {
  const adc = useSnap((s) => s.adc)
  const meas = useSnap((s) => s.meas.rpm)
  const isrs = useSnap((s) => s.rtos.isrs)
  const gpio = useSnap((s) => s.gpio)
  const mhz = useSnap((s) => s.rtos.clockMHz)
  const cpu = useSnap((s) => s.rtos.cpuLoad)
  const wdg = useSnap((s) => s.rtos.wdgRemainMs / s.rtos.wdgTimeoutMs)
  const tasks = useSnap((s) => s.rtos.tasks)
  const running = useSnap((s) => s.state !== 'OFF' && !s.paused)
  const host = useSnap((s) => s.host)
  const state = useSnap((s) => s.state)

  const recent = (name: string, ms = 140) => {
    const i = isrs.find((x) => x.name === name)
    return !!i && i.lastAgoMs >= 0 && i.lastAgoMs < ms
  }
  const raw = [adc.vib, adc.cur, adc.temp, Math.round(meas)]
  const anyIsr = isrs.some((i) => i.lastAgoMs >= 0 && i.lastAgoMs < 60)
  const txHot = host.lastRxAt >= 0 && true
  const dsp = tasks.find((t) => t.id === 'DSP')

  return (
    <div className="panel overflow-x-auto">
      <svg viewBox="0 0 1200 560" className="mx-auto block h-auto w-full min-w-[920px]" role="img" aria-label="Block diagram of the embedded controller">
        <defs>
          <filter id="bd-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* ---- sensor inputs ---- */}
        {IN.map((s, i) => {
          const ty = 150 + i * 70
          const path = `M250 ${s.y + 26} H300 V${ty} H430`
          return (
            <g key={s.name}>
              <rect x="40" y={s.y} width="210" height="52" rx="8" fill="#14181a" stroke={s.c} strokeOpacity="0.55" />
              <rect x="40" y={s.y} width="6" height="52" rx="3" fill={s.c} />
              <text x="58" y={s.y + 21} className="diagram-text" fontSize="10.5" fontWeight="600" fill={s.c}>
                {s.name}
              </text>
              <text x="58" y={s.y + 38} className="diagram-text" fontSize="9" fill={C.steel3}>
                {s.pin}
              </text>
              <text x="238" y={s.y + 33} textAnchor="end" fontFamily="var(--font-mono)" fontSize="15" fill={C.bone} style={{ fontStretch: '80%' }}>
                {i === 3 ? `${raw[i]} rpm` : raw[i]}
              </text>
              <path d={path} fill="none" stroke={C.ink600} strokeWidth="2" />
              {running && <path d={path} fill="none" stroke={s.c} strokeWidth="2" strokeDasharray="4 8" strokeOpacity="0.85" style={{ animation: 'flow 0.6s linear infinite' }} />}
              {running && (
                <circle r="3" fill={s.c}>
                  <animateMotion dur={`${1.4 + i * 0.1}s`} repeatCount="indefinite" path={path} />
                </circle>
              )}
            </g>
          )
        })}

        {/* ---- MCU package ---- */}
        <g>
          <rect x="430" y="70" width="340" height="420" rx="16" fill="#101315" stroke={C.ink500} strokeWidth="1.5" />
          {Array.from({ length: 14 }, (_, i) => (
            <g key={i} stroke={C.ink500} strokeWidth="2">
              <line x1={450 + i * 22} y1="62" x2={450 + i * 22} y2="70" />
              <line x1={450 + i * 22} y1="490" x2={450 + i * 22} y2="498" />
            </g>
          ))}
          {Array.from({ length: 18 }, (_, i) => (
            <g key={i} stroke={C.ink500} strokeWidth="2">
              <line x1="422" y1={86 + i * 22} x2="430" y2={86 + i * 22} />
              <line x1="770" y1={86 + i * 22} x2="778" y2={86 + i * 22} />
            </g>
          ))}
          <circle cx="452" cy="92" r="4" fill={C.ink500} />
          <text x="600" y="58" textAnchor="middle" className="diagram-text" fontSize="10.5" fill={C.steel2} fontWeight="600">
            {MCU.part} · {MCU.core} · {mhz} MHz
          </text>

          <Block x={452} y={92} w={296} h={66} title="CORTEX-M4F + FREERTOS" sub={`CPU ${fmt(cpu * 100, 1)} %  ·  5 tasks`} hot={running} color={C.bone} />
          <Block x={452} y={170} w={142} h={66} title="ADC1 + DMA1" sub="12-bit · 2560 S/s" hot={recent('DMA1_Stream0', 160)} color={C.vib} />
          <Block x={606} y={170} w={142} h={66} title="TIM2 · TIM3 · SYSTICK" sub="capture · trigger · tick" hot={recent('TIM2_CC1', 120)} color={C.rpm} />
          <Block x={452} y={248} w={142} h={66} title="NVIC" sub="4 vectors in use" hot={anyIsr} color={C.forecast} />
          <Block x={606} y={248} w={142} h={66} title="SRAM · FLASH" sub={`${MCU.sramKB} KB · ${MCU.flashKB} KB`} hot={dsp?.state === 'RUNNING'} color={C.cur} />
          <Block x={452} y={326} w={92} h={66} title="GPIO" sub="5 outputs" hot={gpio.ledG || gpio.ledY || gpio.ledR} color={C.go} />
          <Block x={556} y={326} w={92} h={66} title="USART2/1" sub="115200 8N1" hot={recent('USART2_TC', 200)} color={C.caution} />
          <Block x={660} y={326} w={88} h={66} title="IWDG" sub={`${fmt(wdg * 2, 1)} s left`} hot={wdg < 0.45} color={C.stop} />
          <rect x="452" y="408" width="296" height="62" rx="7" fill="#14181a" stroke={C.ink600} />
          <text x="600" y="432" textAnchor="middle" className="diagram-text" fontSize="9.5" fill={C.steel3}>
            TASKS  ACQ → DSP → FDT  ·  HLTH  ·  COMM
          </text>
          <g>
            {tasks
              .filter((t) => t.id !== 'STRESS')
              .map((t, i) => (
                <g key={t.id}>
                  <rect x={468 + i * 56} y="442" width="48" height="16" rx="3" fill={t.state === 'RUNNING' ? t.color : '#1b2023'} stroke={t.color} strokeOpacity="0.6" />
                  <text x={492 + i * 56} y="454" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8.5" fill={t.state === 'RUNNING' ? '#0a0c0d' : t.color}>
                    {t.id}
                  </text>
                </g>
              ))}
          </g>
        </g>

        {/* ---- GPIO outputs ---- */}
        {OUT.map((o, i) => {
          const sy = 150 + i * 56
          const on = !!gpio[o.k]
          const path = `M778 ${sy} H850 V${o.y + 26} H940`
          return (
            <g key={o.name}>
              <path d={path} fill="none" stroke={C.ink600} strokeWidth="2" />
              {on && <path d={path} fill="none" stroke={o.c} strokeWidth="2" strokeDasharray="4 8" style={{ animation: 'flow 0.6s linear infinite' }} />}
              <rect x="940" y={o.y} width="220" height="52" rx="8" fill={on ? `${o.c}14` : '#14181a'} stroke={on ? o.c : C.ink500} style={{ transition: 'all 150ms' }} />
              <text x="958" y={o.y + 21} className="diagram-text" fontSize="10.5" fontWeight="600" fill={on ? o.c : C.steel2}>
                {o.name}
              </text>
              <text x="958" y={o.y + 38} className="diagram-text" fontSize="9" fill={C.steel3}>
                {o.pin} · {on ? 'HIGH' : 'low'}
              </text>
              {on && <circle cx="1130" cy={o.y + 26} r="13" fill={o.c} opacity="0.35" filter="url(#bd-glow)" />}
              <circle cx="1130" cy={o.y + 26} r="7" fill={on ? o.c : C.ink600} />
            </g>
          )
        })}

        {/* ---- host links ---- */}
        {[
          { x: 300, name: 'DASHBOARD HOST', sub: `UART2 · ${host.rxOk} frames ok · ${host.crcErr} CRC errors`, c: C.go },
          { x: 700, name: 'SCADA MASTER', sub: 'Modbus RTU · 8 holding registers', c: C.forecast },
        ].map((h) => {
          const path = `M${h.x + 100} 520 V498`
          return (
            <g key={h.name}>
              <path d={path} stroke={C.ink600} strokeWidth="2" fill="none" />
              {running && txHot && <path d={path} stroke={h.c} strokeWidth="2" fill="none" strokeDasharray="3 6" style={{ animation: 'flow 0.9s linear infinite' }} />}
              <rect x={h.x} y="520" width="200" height="34" rx="7" fill="#14181a" stroke={h.c} strokeOpacity="0.55" />
              <text x={h.x + 100} y="534" textAnchor="middle" className="diagram-text" fontSize="10" fontWeight="600" fill={h.c}>
                {h.name}
              </text>
              <text x={h.x + 100} y="547" textAnchor="middle" className="diagram-text" fontSize="8" fill={C.steel3}>
                {h.sub}
              </text>
            </g>
          )
        })}
        <text x="1160" y="540" textAnchor="end" className="diagram-text" fontSize="9.5" fill={state === 'HEALTHY' ? C.go : C.steel3}>
          raw counts are what the firmware actually reads
        </text>
      </svg>
    </div>
  )
}
