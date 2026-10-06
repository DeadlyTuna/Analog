'use client'

import { cn } from '@vigil/lib/utils'

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
  size = 'md',
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-lg border border-ink-500 bg-ink-850 p-[3px]', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'mono rounded-[5px] px-2.5 text-[11px] font-medium tracking-[0.04em] transition-colors',
              size === 'sm' ? 'h-6' : 'h-7',
              on ? 'bg-bone text-ink-950' : 'text-steel-200 hover:bg-ink-700 hover:text-bone',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
