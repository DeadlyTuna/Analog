import type { Metadata } from 'next'
import { SimProvider } from '@vigil/components/sim/SimProvider'
import { StateBridge } from '@vigil/components/shell/Ambient'
import { BuzzerAudio } from '@vigil/components/shell/BuzzerAudio'
import { Nav } from '@vigil/components/shell/Nav'
import { TourBar } from '@vigil/components/shell/TourBar'
import './industry.css'

export const metadata: Metadata = {
  title: 'Industry extension — AI-Based Motor Fault Detection',
  description: 'Scaling the idea up: an embedded predictive-maintenance system for an industrial induction motor. Original simulator: Vigil, by Sidhant.',
}

export default function IndustryLayout({ children }: LayoutProps<'/industry'>) {
  return (
    <SimProvider>
      <div className="industry flex-1">
        <StateBridge />
        <BuzzerAudio />
        <Nav />
        {children}
        <TourBar />
      </div>
    </SimProvider>
  )
}
