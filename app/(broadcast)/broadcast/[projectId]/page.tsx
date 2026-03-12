'use client'

import { use, useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { BroadcastProvider, useBroadcast } from '@/components/broadcast/BroadcastContext'
import BroadcastCanvas from '@/components/broadcast/BroadcastCanvas'
import AssetLibrary from '@/components/broadcast/AssetLibrary'
import AssetProperties from '@/components/broadcast/AssetProperties'
import TriggerBar from '@/components/broadcast/TriggerBar'
import StreamDeckGrid from '@/components/broadcast/StreamDeckGrid'
import LivePreview from '@/components/broadcast/LivePreview'
import LiveControlGrid, { SlideshowControlStrip } from '@/components/broadcast/LiveControlGrid'
import { uploadBroadcastMedia } from '@/lib/uploadMedia'
import StreamDeckSetup from '@/components/broadcast/StreamDeckSetup'
import OBSSettings from '@/components/broadcast/OBSSettings'
import { useStreamDeck } from '@/lib/useStreamDeck'
import type { ButtonEntry } from '@/lib/streamDeckProfile'

type ViewMode = 'canvas' | 'streamdeck'

function BroadcastManagerInner() {
  const {
    loading, project, session, updateProjectSettings, isOBSConnected,
    assets, visibleAssetIds, activeSegmentId, segments,
    toggleAssetVisibility, slideshowNext, slideshowPrev, switchSegment,
  } = useBroadcast()
  const [viewMode, setViewMode] = useState<ViewMode>('canvas')
  const [showRefImage, setShowRefImage] = useState(true)
  const [refImageOpacity, setRefImageOpacity] = useState(50)
  const [uploading, setUploading] = useState(false)
  const [showStreamDeckSetup, setShowStreamDeckSetup] = useState(false)
  const [showOBSSetup, setShowOBSSetup] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Stream Deck button layout state (persists across modal open/close)
  const [sdButtonOrder, setSdButtonOrder] = useState<ButtonEntry[]>([])

  // Find first visible slideshow asset for prev/next
  const handleSlideshowNext = useCallback(() => {
    const slideshow = assets.find(a => a.asset_type === 'slideshow' && visibleAssetIds.has(a.id))
    if (slideshow) slideshowNext(slideshow.id)
  }, [assets, visibleAssetIds, slideshowNext])

  const handleSlideshowPrev = useCallback(() => {
    const slideshow = assets.find(a => a.asset_type === 'slideshow' && visibleAssetIds.has(a.id))
    if (slideshow) slideshowPrev(slideshow.id)
  }, [assets, visibleAssetIds, slideshowPrev])

  // Stream Deck physical device hook
  const streamDeck = useStreamDeck({
    callbacks: {
      onToggleAsset: toggleAssetVisibility,
      onSlideshowNext: handleSlideshowNext,
      onSlideshowPrev: handleSlideshowPrev,
      onSwitchSegment: switchSegment,
    },
  })

  // Build default button layout from assets + segments
  useEffect(() => {
    const entries: ButtonEntry[] = []
    const sorted = [...assets].sort((a, b) => a.sort_order - b.sort_order)
    for (const asset of sorted) {
      entries.push({ type: 'asset', asset })
    }
    // Add segment buttons
    const sortedSegments = [...segments].sort((a, b) => a.sort_order - b.sort_order)
    for (const segment of sortedSegments) {
      entries.push({ type: 'segment', segment })
    }
    entries.push({ type: 'slideshow-prev' })
    entries.push({ type: 'slideshow-next' })
    setSdButtonOrder(entries)
  }, [assets, segments])

  // Reactively push button state to physical device when things change
  useEffect(() => {
    if (streamDeck.isConnected && sdButtonOrder.length > 0) {
      streamDeck.updateButtons(sdButtonOrder, visibleAssetIds, activeSegmentId)
    }
  }, [streamDeck.isConnected, sdButtonOrder, visibleAssetIds, activeSegmentId])

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
        {(['canvas', 'streamdeck'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-2.5 py-0.5 text-[11px] font-medium rounded transition ${
              viewMode === mode
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {mode === 'canvas' ? 'Canvas' : 'Test Mode'}
          </button>
        ))}

        <div className="w-px h-4 bg-zinc-700 mx-1" />
        <button
          onClick={() => setShowStreamDeckSetup(true)}
          className="px-2.5 py-0.5 text-[11px] font-medium rounded text-zinc-500 hover:text-zinc-300 transition flex items-center gap-1.5"
        >
          Stream Deck
          {streamDeck.isConnected && (
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          )}
        </button>
        <button
          onClick={() => setShowOBSSetup(true)}
          className="px-2.5 py-0.5 text-[11px] font-medium rounded text-zinc-500 hover:text-zinc-300 transition flex items-center gap-1.5"
        >
          OBS
          {isOBSConnected && (
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          )}
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
              <div className="w-64 shrink-0 flex flex-col border-r border-zinc-800">
                <div className="flex-1 overflow-hidden">
                  <AssetLibrary />
                </div>
                <SlideshowControlStrip />
              </div>
              <BroadcastCanvas {...canvasProps} />
              <AssetProperties />
            </>
          )
        ) : (
          <StreamDeckGrid />
        )}
      </div>
      <TriggerBar />
      {showStreamDeckSetup && (
        <StreamDeckSetup
          onClose={() => setShowStreamDeckSetup(false)}
          streamDeck={streamDeck}
          buttonOrder={sdButtonOrder}
          onButtonOrderChange={setSdButtonOrder}
        />
      )}
      {showOBSSetup && <OBSSettings onClose={() => setShowOBSSetup(false)} />}
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
