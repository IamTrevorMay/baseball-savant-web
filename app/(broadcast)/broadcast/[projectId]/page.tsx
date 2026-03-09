'use client'

import { use } from 'react'
import { BroadcastProvider, useBroadcast } from '@/components/broadcast/BroadcastContext'
import BroadcastCanvas from '@/components/broadcast/BroadcastCanvas'
import AssetLibrary from '@/components/broadcast/AssetLibrary'
import AssetProperties from '@/components/broadcast/AssetProperties'
import TriggerBar from '@/components/broadcast/TriggerBar'

function BroadcastManagerInner() {
  const { loading, project } = useBroadcast()

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
      {/* Three-column layout */}
      <div className="flex flex-1 overflow-hidden">
        <AssetLibrary />
        <BroadcastCanvas />
        <AssetProperties />
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
