'use client'

import { cn } from '@vigil/lib/utils'

export function Switch({
  checked,
  onChange,
  label,
  hint,
  className,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={hint}
      onClick={() => onChange(!checked)}
      className={cn('group inline-flex items-center gap-2.5 rounded-md py-1 pr-1 text-left', className)}
    >
      <span
        className={cn(
          'relative h-[20px] w-[36px] shrink-0 rounded-full border transition-colors',
          checked ? 'border-bone/70 bg-bone/90' : 'border-ink-500 bg-ink-700',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-[14px] w-[14px] rounded-full transition-all',
            checked ? 'left-[18px] bg-ink-950' : 'left-[2px] bg-steel-300',
          )}
        />
      </span>
      <span className="text-[14px] font-medium text-steel-200 group-hover:text-bone">{label}</span>
    </button>
  )
}
