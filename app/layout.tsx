import type { Metadata, Viewport } from 'next'
import { Inter, Bebas_Neue } from 'next/font/google'
import './globals.css'
import AuthProvider from '@/components/AuthProvider'
import QueryProvider from '@/lib/QueryProvider'
import { DeviceProvider } from '@/lib/hooks/useDeviceContext'
import { ThemeProvider } from '@/lib/hooks/useTheme'
import { ToastProvider } from '@/components/ui/Toast'
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
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline script to prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('triton-theme');if(t==='light'||t==='dark'){document.documentElement.classList.toggle('dark',t==='dark')}else if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){document.documentElement.classList.add('dark')}})()`,
          }}
        />
      </head>
      <body className={`${inter.className} ${bebas.variable} antialiased`}>
        <QueryProvider>
          <AuthProvider>
            <DeviceProvider>
              <ThemeProvider>
                <ToastProvider>
                  {children}
                  <MobileTabBar />
                </ToastProvider>
              </ThemeProvider>
            </DeviceProvider>
          </AuthProvider>
        </QueryProvider>
        <ServiceWorkerRegistration />
        <Analytics />
      </body>
    </html>
  )
}
