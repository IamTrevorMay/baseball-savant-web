'use client'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { StyleSettings, DEFAULT_STYLE } from '@/lib/stylePresets'

interface StyleContextType {
  style: StyleSettings
  updateStyle: (patch: Partial<StyleSettings>) => void
  resetStyle: () => void
}

const StyleContext = createContext<StyleContextType>({
  style: DEFAULT_STYLE,
  updateStyle: () => {},
  resetStyle: () => {},
})

export function StyleProvider({ children }: { children: ReactNode }) {
  const [style, setStyle] = useState<StyleSettings>(DEFAULT_STYLE)

  const updateStyle = useCallback((patch: Partial<StyleSettings>) => {
    setStyle(prev => ({ ...prev, ...patch }))
  }, [])

  const resetStyle = useCallback(() => {
    setStyle(DEFAULT_STYLE)
  }, [])

  return (
    <StyleContext.Provider value={{ style, updateStyle, resetStyle }}>
      {children}
    </StyleContext.Provider>
  )
}

export function useStyle() {
  return useContext(StyleContext)
}
