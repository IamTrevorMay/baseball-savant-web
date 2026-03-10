import type { Metadata, Viewport } from 'next'
import { Inter, Bebas_Neue } from 'next/font/google'
import './globals.css'
import AuthProvider from '@/components/AuthProvider'
import MobileTabBar from '@/components/MobileTabBar'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'
import { Analytics } from '@vercel/analytics/next'

const inter = Inter({ subsets: ['latin'] })
const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas' })

export const viewport: Viewport = {
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Triton Apex',
  description: 'Find the peak.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Triton Apex',
  },
  icons: {
    icon: '/api/favicon',
    apple: '/icons/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} ${bebas.variable} antialiased`}>
        <AuthProvider>
          {children}
          <MobileTabBar />
        </AuthProvider>
        <ServiceWorkerRegistration />
        <Analytics />
      </body>
    </html>
  )
}
