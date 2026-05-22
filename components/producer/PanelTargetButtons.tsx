'use client'

import type { PanelPosition, PresetType } from '@/lib/producerTypes'
import { useProducer } from './ProducerContext'

interface Props {
  presetType: PresetType | null
  config: any
  disabled?: boolean
}

export default function PanelTargetButtons({ presetType, config, disabled }: Props) {
  const { pushPanel, hidePanel, hideAllPanels, pushing, panels } = useProducer()

  const canPush = presetType && config && !disabled && !pushing

  const handlePush = async (position: PanelPosition) => {
    if (!canPush) return
    try {
      await pushPanel(position, presetType!, config)
    } catch (err: any) {
      console.error('Failed to push panel:', err)
    }
  }

  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => handlePush('lower-bar')}
        disabled={!canPush}
        className="flex-1 min-w-[140px] px-4 py-2.5 rounded-lg font-medium text-sm transition
          bg-emerald-600 hover:bg-emerald-500 text-white
          disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed"
      >
        {pushing ? 'Pushing...' : 'Push to Lower Bar'}
      </button>
      <button
        onClick={() => handlePush('right-panel')}
        disabled={!canPush}
        className="flex-1 min-w-[140px] px-4 py-2.5 rounded-lg font-medium text-sm transition
          bg-emerald-600 hover:bg-emerald-500 text-white
          disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed"
      >
        {pushing ? 'Pushing...' : 'Push to Right Panel'}
      </button>
      <button
        onClick={() => hideAllPanels()}
        className="px-4 py-2.5 rounded-lg font-medium text-sm transition
          bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30"
      >
        Hide All
      </button>
    </div>
  )
}
