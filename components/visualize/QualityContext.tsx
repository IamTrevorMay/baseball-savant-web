'use client'
import { createContext, useContext, useState, ReactNode } from 'react'
import { QualityPreset, QUALITY_PRESETS } from '@/lib/qualityPresets'

interface QualityContextType {
  quality: QualityPreset
  setQualityId: (id: QualityPreset['id']) => void
}

const QualityContext = createContext<QualityContextType>({
  quality: QUALITY_PRESETS.standard,
  setQualityId: () => {},
})

export function QualityProvider({ children }: { children: ReactNode }) {
  const [qualityId, setQualityId] = useState<QualityPreset['id']>('standard')
  return (
    <QualityContext.Provider value={{ quality: QUALITY_PRESETS[qualityId], setQualityId }}>
      {children}
    </QualityContext.Provider>
  )
}

export function useQuality() {
  return useContext(QualityContext)
}
