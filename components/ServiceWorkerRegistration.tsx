'use client'

import { useEffect } from 'react'
import { preloadBatterSilhouette } from '@/lib/batterSilhouette'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration failed — ignore silently
      })
    }
    preloadBatterSilhouette()
  }, [])

  return null
}
