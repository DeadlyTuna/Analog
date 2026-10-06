import type { ReactNode } from 'react'
import { SectionHead } from '@vigil/components/ui/SectionHead'

export function FwSection({ id, kicker, title, note, children }: { id: string; kicker: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <SectionHead className="mb-5" kicker={kicker} title={title} note={note} />
      {children}
    </section>
  )
}
