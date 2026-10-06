import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/big-shoulders-stencil-display'
import '@fontsource-variable/big-shoulders-display'
import '@fontsource-variable/sofia-sans-semi-condensed'
import '@fontsource-variable/martian-mono/standard.css'
import './vigil.css'
import { SimProvider } from '@vigil/components/sim/SimProvider'
import { Ambient, Backdrop, StateBridge } from '@vigil/components/shell/Ambient'
import { BootSplash } from '@vigil/components/shell/BootSplash'
import { BuzzerAudio } from '@vigil/components/shell/BuzzerAudio'
import { Footer } from '@vigil/components/shell/Footer'
import { Nav } from '@vigil/components/shell/Nav'
import { TourBar } from '@vigil/components/shell/TourBar'

export const metadata: Metadata = {
  title: 'Vigil — predictive maintenance for industrial motors',
  description:
    'A simulated embedded system that listens to an industrial motor — vibration, temperature, current and speed — and flags a fault before the line stops. Break the motor yourself and watch the firmware catch it.',
}

export const viewport: Viewport = {
  themeColor: '#0f1112',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" data-state="off" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{if(sessionStorage.getItem('vigil-boot'))document.documentElement.setAttribute('data-boot','done')}catch(e){}" }} />
      </head>
      <body>
        <SimProvider>
          <StateBridge />
          <BuzzerAudio />
          <Backdrop />
          <Nav />
          <main>{children}</main>
          <Footer />
          <Ambient />
          <TourBar />
          <BootSplash />
        </SimProvider>
      </body>
    </html>
  )
}
