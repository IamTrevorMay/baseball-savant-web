'use client'

import { use, useState, useRef } from 'react'
import { BroadcastProvider, useBroadcast } from '@/components/broadcast/BroadcastContext'
import BroadcastCanvas from '@/components/broadcast/BroadcastCanvas'
import AssetLibrary from '@/components/broadcast/AssetLibrary'
import AssetProperties from '@/components/broadcast/AssetProperties'
import TriggerBar from '@/components/broadcast/TriggerBar'
import StreamDeckGrid from '@/components/broadcast/StreamDeckGrid'
import LivePreview from '@/components/broadcast/LivePreview'
import LiveControlGrid from '@/components/broadcast/LiveControlGrid'
import { uploadBroadcastMedia } from '@/lib/uploadMedia'
import StreamDeckSetup from '@/components/broadcast/StreamDeckSetup'

type ViewMode = 'canvas' | 'streamdeck'

function BroadcastManagerInner() {
  const { loading, project, session, updateProjectSettings } = useBroadcast()
  const [viewMode, setViewMode] = useState<ViewMode>('canvas')
  const [showRefImage, setShowRefImage] = useState(true)
  const [refImageOpacity, setRefImageOpacity] = useState(50)
  const [uploading, setUploading] = useState(false)
  const [showStreamDeckSetup, setShowStreamDeckSetup] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const referenceImage = project.settings?.referenceImage
  const isLive = !!session && viewMode === 'canvas'

  async function handleRefImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !project) return
    setUploading(true)
    try {
      const result = await uploadBroadcastMedia(file, project.id)
      if (result) {
        updateProjectSettings({ referenceImage: result.url })
        setShowRefImage(true)
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleRemoveRefImage() {
    updateProjectSettings({ referenceImage: undefined })
  }

  const canvasProps = {
    referenceImage,
    referenceImageOpacity: refImageOpacity,
    showReferenceImage: showRefImage && !!referenceImage,
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

        <div className="w-px h-4 bg-zinc-700 mx-1" />
        <button
          onClick={() => setShowStreamDeckSetup(true)}
          className="px-2.5 py-0.5 text-[11px] font-medium rounded text-zinc-500 hover:text-zinc-300 transition"
        >
          Stream Deck
        </button>

        {/* Right side: reference image controls */}
        {viewMode === 'canvas' && (
          <div className="ml-auto flex items-center gap-2">
            {referenceImage ? (
              <>
                <button
                  onClick={() => setShowRefImage(!showRefImage)}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded transition ${
                    showRefImage
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-600/40'
                      : 'bg-zinc-800 text-zinc-500 border border-zinc-700/50'
                  }`}
                >
                  Ref Image
                </button>
                {showRefImage && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={refImageOpacity}
                      onChange={e => setRefImageOpacity(Number(e.target.value))}
                      className="w-16 h-1 accent-emerald-500"
                    />
                    <span className="text-[9px] text-zinc-500 font-mono w-6">{refImageOpacity}%</span>
                  </div>
                )}
                <button
                  onClick={handleRemoveRefImage}
                  className="w-5 h-5 flex items-center justify-center rounded bg-zinc-800 hover:bg-red-900/50 text-zinc-500 hover:text-red-400 text-xs transition"
                  title="Remove reference image"
                >
                  &times;
                </button>
              </>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-2 py-0.5 text-[10px] font-medium rounded bg-zinc-800 text-zinc-500 border border-zinc-700/50 hover:text-zinc-300 transition"
              >
                {uploading ? 'Uploading...' : '+ Ref Image'}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleRefImageUpload}
            />
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {viewMode === 'canvas' ? (
          isLive ? (
            <>
              {/* Left column: Asset Library + Control Grid */}
              <div className="w-64 shrink-0 flex flex-col border-r border-zinc-800">
                <div className="flex-1 overflow-hidden">
                  <AssetLibrary />
                </div>
                <LiveControlGrid />
              </div>
              {/* Center column: Live Preview + Studio View */}
              <div className="flex-1 flex flex-col min-w-0">
                <LivePreview />
                <div className="border-t border-zinc-700">
                  <div className="relative">
                    <div className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-zinc-700 rounded text-[10px] font-bold text-zinc-300 tracking-wider">
                      STUDIO
                    </div>
                  </div>
                </div>
                <BroadcastCanvas {...canvasProps} />
              </div>
              {/* Right column: Asset Properties */}
              <AssetProperties />
            </>
          ) : (
            <>
              <AssetLibrary />
              <BroadcastCanvas {...canvasProps} />
              <AssetProperties />
            </>
          )
        ) : (
          <StreamDeckGrid />
        )}
      </div>
      <TriggerBar />
      {showStreamDeckSetup && <StreamDeckSetup onClose={() => setShowStreamDeckSetup(false)} />}
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
