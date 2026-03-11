'use client'

import { useState } from 'react'
import { useBroadcast } from './BroadcastContext'

export default function TriggerBar() {
  const {
    assets, visibleAssetIds, session, toggleAssetVisibility, goLive, endSession,
    slideshowPrev, slideshowNext, getSlideshowIndex,
    scenes, activeSceneId, switchingScene, switchScene,
  } = useBroadcast()
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
      {/* Scene switcher buttons */}
      {scenes.length > 0 && (
        <div className="flex items-center gap-1.5 pr-3 border-r border-zinc-700">
          {scenes.map(scene => {
            const isActive = activeSceneId === scene.id
            const color = scene.hotkey_color || '#10b981'
            return (
              <button
                key={scene.id}
                onClick={() => switchScene(scene.id)}
                disabled={!session || switchingScene || isActive}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                  isActive
                    ? 'border-transparent text-white'
                    : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
                } ${!session || switchingScene ? 'opacity-40 cursor-not-allowed' : isActive ? '' : 'cursor-pointer'}`}
                style={{
                  backgroundColor: isActive ? color + '30' : 'transparent',
                  borderColor: isActive ? color : undefined,
                }}
              >
                {/* Layers icon */}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: isActive ? color : '#52525b' }}
                />
                {scene.name}
                {scene.hotkey_key && (
                  <span className="ml-0.5 px-1 py-0 text-[9px] font-mono bg-zinc-700 text-zinc-300 rounded">
                    {scene.hotkey_key.toUpperCase()}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Asset trigger pills */}
      <div className="flex-1 flex items-center gap-2 overflow-x-auto">
        {assets.map(asset => {
          const isVisible = visibleAssetIds.has(asset.id)
          const label = asset.hotkey_label || asset.name
          const color = asset.hotkey_color || '#06b6d4'
          const isSlideshow = asset.asset_type === 'slideshow'
          const slideCount = asset.slideshow_config?.slides?.length || 0
          return (
            <div key={asset.id} className="shrink-0 flex items-center gap-1">
              <button
                onClick={() => toggleAssetVisibility(asset.id)}
                disabled={!session}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
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
                {asset.trigger_mode === 'flash' && (
                  <span className="shrink-0" title={`Flash ${asset.trigger_duration || 3}s`}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-400">
                      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                    </svg>
                  </span>
                )}
                {asset.trigger_mode === 'show' && (
                  <span className="shrink-0" title="Show only">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-400">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                  </span>
                )}
                {asset.trigger_mode === 'hide' && (
                  <span className="shrink-0" title="Hide only">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-500">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" /><path d="M1 1l22 22" />
                    </svg>
                  </span>
                )}
                {asset.template_id && <span className="text-amber-400 text-[9px]" title="Template asset">{'\u26A1'}</span>}
                {label}
                {asset.hotkey_key && (
                  <span className="ml-0.5 px-1 py-0 text-[9px] font-mono bg-zinc-700 text-zinc-300 rounded" title={`Key: ${asset.hotkey_key.toUpperCase()}`}>
                    {asset.hotkey_key.toUpperCase()}
                  </span>
                )}
              </button>
              {isSlideshow && slideCount > 0 && session && (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => slideshowPrev(asset.id)}
                    className="px-1 py-1 text-[9px] text-zinc-400 hover:text-zinc-200 bg-zinc-800 border border-zinc-700 rounded transition"
                    title="Previous slide"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <span className="text-[9px] text-zinc-500 font-mono px-0.5">
                    {getSlideshowIndex(asset.id) + 1}/{slideCount}
                  </span>
                  <button
                    onClick={() => slideshowNext(asset.id)}
                    className="px-1 py-1 text-[9px] text-zinc-400 hover:text-zinc-200 bg-zinc-800 border border-zinc-700 rounded transition"
                    title="Next slide"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
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
