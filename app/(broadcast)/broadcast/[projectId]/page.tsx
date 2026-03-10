'use client'

import { use, useState } from 'react'
import { BroadcastProvider, useBroadcast } from '@/components/broadcast/BroadcastContext'
import BroadcastCanvas from '@/components/broadcast/BroadcastCanvas'
import AssetLibrary from '@/components/broadcast/AssetLibrary'
import AssetProperties from '@/components/broadcast/AssetProperties'
import TriggerBar from '@/components/broadcast/TriggerBar'
import StreamDeckGrid from '@/components/broadcast/StreamDeckGrid'

type ViewMode = 'canvas' | 'streamdeck'

function BroadcastManagerInner() {
  const { loading, project } = useBroadcast()
  const [viewMode, setViewMode] = useState<ViewMode>('canvas')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3rem)]">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-red-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3rem)]">
        <p className="text-zinc-500">Project not found</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* View toggle header */}
      <div className="h-8 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-1">
        <button
          onClick={() => setViewMode('canvas')}
          className={`px-2.5 py-0.5 text-[11px] font-medium rounded transition ${
            viewMode === 'canvas'
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Canvas
        </button>
        <button
          onClick={() => setViewMode('streamdeck')}
          className={`px-2.5 py-0.5 text-[11px] font-medium rounded transition ${
            viewMode === 'streamdeck'
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Test Mode
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {viewMode === 'canvas' ? (
          <>
            <AssetLibrary />
            <BroadcastCanvas />
            <AssetProperties />
          </>
        ) : (
          <StreamDeckGrid />
        )}
      </div>
      <TriggerBar />
    </div>
  )
}

export default function BroadcastManagerPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params)

  return (
    <BroadcastProvider projectId={projectId}>
      <BroadcastManagerInner />
    </BroadcastProvider>
  )
}
