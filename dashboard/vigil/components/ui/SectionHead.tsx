import { cn } from '@vigil/lib/utils'

export function SectionHead({ kicker, title, note, className }: { kicker: string; title: string; note?: string; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-1', className)}>
      <div className="flex items-baseline gap-4">
        <h2 className="display text-[34px] text-bone sm:text-[40px]">{title}</h2>
        <span className="label hidden sm:inline">{kicker}</span>
      </div>
      {note && <p className="max-w-[60ch] text-[14px] text-steel-300">{note}</p>}
    </div>
  )
}
