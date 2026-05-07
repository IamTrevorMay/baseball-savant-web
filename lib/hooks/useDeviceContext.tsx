'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface DeviceContextType {
  isMobile: boolean
  isLoading: boolean
}

const DeviceCtx = createContext<DeviceContextType>({ isMobile: false, isLoading: true })

export const useDevice = () => useContext(DeviceCtx)

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    setIsLoading(false)

    function onChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return (
    <DeviceCtx.Provider value={{ isMobile, isLoading }}>
      {children}
    </DeviceCtx.Provider>
  )
}
