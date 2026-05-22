'use client'

import { use, useState, useCallback } from 'react'
import { ProducerProvider, useProducer } from '@/components/producer/ProducerContext'
import PresetPicker from '@/components/producer/PresetPicker'
import PresetConfigurator from '@/components/producer/PresetConfigurator'
import PanelTargetButtons from '@/components/producer/PanelTargetButtons'
import PanelStatusBar from '@/components/producer/PanelStatusBar'
import { PRESET_METAS, type PresetType } from '@/lib/producerTypes'

function ProducerInner() {
  const { session, loading, error } = useProducer()
  const [selectedPreset, setSelectedPreset] = useState<PresetType | null>(null)
  const [config, setConfig] = useState<any>(null)

  const handlePresetSelect = useCallback((type: PresetType) => {
    setSelectedPreset(type)
    setConfig(null)
  }, [])

  const handleConfigChange = useCallback((newConfig: any) => {
    setConfig(newConfig)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-zinc-500 text-sm">Loading session...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-red-400 text-sm">Error: {error}</div>
      </div>
    )
  }

  const presetMeta = selectedPreset ? PRESET_METAS.find(m => m.type === selectedPreset) : null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Producer</h1>
          <p className="text-xs text-zinc-500">Push live stat overlays to the broadcast</p>
        </div>
        {session && (
          <div className="text-[10px] text-zinc-600 font-mono">
            {session.id.slice(0, 8)}
          </div>
        )}
      </div>

      {/* Panel status */}
      <PanelStatusBar />

      {/* Preset picker */}
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2 block">Preset Type</label>
        <PresetPicker selected={selectedPreset} onSelect={handlePresetSelect} />
      </div>

      {/* Config form */}
      {selectedPreset && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">{presetMeta?.icon}</span>
            <span className="text-sm font-medium text-zinc-300">{presetMeta?.label}</span>
          </div>
          <PresetConfigurator
            key={selectedPreset}
            presetType={selectedPreset}
            onChange={handleConfigChange}
          />
        </div>
      )}

      {/* Push buttons — sticky at bottom on mobile */}
      <div className="sticky bottom-4 bg-zinc-950/90 backdrop-blur-sm rounded-lg p-3 border border-zinc-800">
        <PanelTargetButtons
          presetType={selectedPreset}
          config={config}
          disabled={!config}
        />
      </div>
    </div>
  )
}

export default function ProducerPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params)

  return (
    <ProducerProvider sessionId={sessionId}>
      <ProducerInner />
    </ProducerProvider>
  )
}
