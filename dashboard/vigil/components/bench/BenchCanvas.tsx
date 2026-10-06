'use client'

import dynamic from 'next/dynamic'
import { Component, useMemo, type ReactNode } from 'react'
import { useStore } from '@vigil/components/sim/SimProvider'
import { cn } from '@vigil/lib/utils'
import type { BenchProps } from './BenchScene'
import { TagLayer, TagRegistry } from './tags'

const BenchScene = dynamic(() => import('./BenchScene'), {
  ssr: false,
  loading: () => <Placeholder text="Powering up the test bench…" />,
})

function Placeholder({ text, detail }: { text: string; detail?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="text-center">
        <div className="mx-auto mb-3 h-8 w-8 rounded-full border border-ink-500 border-t-bone" style={{ animation: 'ind-spin 1.1s linear infinite' }} />
        <p className="label">{text}</p>
        {detail && <p className="mx-auto mt-2 max-w-[38ch] text-[13px] text-steel-300">{detail}</p>}
      </div>
    </div>
  )
}

class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 grid place-items-center px-6">
          <div className="max-w-sm text-center">
            <p className="label !text-caution">3D view unavailable</p>
            <p className="mt-2 text-[14px] text-steel-200">
              This browser could not start WebGL, so the test-bench model is hidden. Every instrument, scope and the firmware still run normally.
            </p>
            <p className="mono mt-3 break-words text-[10px] text-steel-300">{this.state.error}</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/** The 3D test bench, loaded on the client only. Drop it in a sized, `position: relative` container. */
export function BenchCanvas({ className, hideTags, ...props }: Omit<BenchProps, 'store' | 'tags'> & { className?: string; hideTags?: string[] }) {
  const store = useStore()
  const tags = useMemo(() => new TagRegistry(), [])
  return (
    <div className={cn('absolute inset-0', className)}>
      <Boundary>
        <BenchScene store={store} tags={tags} {...props} />
      </Boundary>
      <TagLayer registry={tags} hide={hideTags} />
    </div>
  )
}
