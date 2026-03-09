'use client'

import { useState } from 'react'
import { useBroadcast } from './BroadcastContext'

export default function TriggerBar() {
  const { assets, visibleAssetIds, session, toggleAssetVisibility, goLive, endSession } = useBroadcast()
  const [goingLive, setGoingLive] = useState(false)
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleGoLive() {
    setGoingLive(true)
    const sessionId = await goLive()
    if (sessionId) {
      const url = `${window.location.origin}/overlay/${sessionId}`
      setOverlayUrl(url)
    }
    setGoingLive(false)
  }

  async function handleEndSession() {
    await endSession()
    setOverlayUrl(null)
  }

  function copyUrl() {
    if (!overlayUrl) return
    navigator.clipboard.writeText(overlayUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="h-14 bg-zinc-900 border-t border-zinc-800 flex items-center px-4 gap-3">
      {/* Asset trigger pills */}
      <div className="flex-1 flex items-center gap-2 overflow-x-auto">
        {assets.map(asset => {
          const isVisible = visibleAssetIds.has(asset.id)
          const label = asset.hotkey_label || asset.name
          const color = asset.hotkey_color || '#06b6d4'
          return (
            <button
              key={asset.id}
              onClick={() => toggleAssetVisibility(asset.id)}
              disabled={!session}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                isVisible
                  ? 'border-transparent text-white'
                  : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
              } ${!session ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              style={{
                backgroundColor: isVisible ? color + '30' : 'transparent',
                borderColor: isVisible ? color : undefined,
              }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: isVisible ? color : '#52525b' }}
              />
              {label}
            </button>
          )
        })}
      </div>

      {/* Overlay URL */}
      {overlayUrl && (
        <div className="flex items-center gap-2">
          <button
            onClick={copyUrl}
            className="px-2.5 py-1.5 text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 rounded hover:bg-zinc-700 transition"
          >
            {copied ? 'Copied!' : 'Copy OBS URL'}
          </button>
        </div>
      )}

      {/* Go Live / End */}
      {!session ? (
        <button
          onClick={handleGoLive}
          disabled={goingLive || assets.length === 0}
          className="px-4 py-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
        >
          <div className="w-2 h-2 rounded-full bg-white" />
          {goingLive ? 'Starting...' : 'Go Live'}
        </button>
      ) : (
        <button
          onClick={handleEndSession}
          className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
        >
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          End Session
        </button>
      )}
    </div>
  )
}
