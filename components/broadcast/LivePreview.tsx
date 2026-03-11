'use client'

import { useCallback, useState, useRef, useEffect } from 'react'
import { useBroadcast } from './BroadcastContext'
import { BroadcastAsset } from '@/lib/broadcastTypes'
import AssetPreview from './AssetPreview'
import { generateCSSAnimation, injectKeyframes, removeKeyframes } from '@/lib/overlayAnimationEngine'
import { toMediaUrl } from '@/lib/localMedia'

const CANVAS_W = 1920
const CANVAS_H = 1080

// ── Animation wrapper for live preview ────────────────────────────────────────

function AnimatedAssetWrapper({
  asset,
  phase,
  fps,
  children,
}: {
  asset: BroadcastAsset
  phase: 'entering' | 'exiting' | null
  fps: number
  children: React.ReactNode
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLStyleElement | null>(null)

  useEffect(() => {
    if (!phase || !wrapperRef.current) return

    const transition = phase === 'entering' ? asset.enter_transition : asset.exit_transition
    const result = generateCSSAnimation(
      transition,
      phase === 'entering' ? 'enter' : 'exit',
      asset.canvas_width,
      asset.canvas_height,
      asset.canvas_x,
      asset.canvas_y,
      fps,
    )

    if (result) {
      if (styleRef.current) removeKeyframes(styleRef.current)
      styleRef.current = injectKeyframes(result.keyframes)
      wrapperRef.current.style.animation = result.animation
      wrapperRef.current.style.willChange = 'transform, opacity'
    }

    return () => {
      if (styleRef.current) {
        removeKeyframes(styleRef.current)
        styleRef.current = null
      }
      if (wrapperRef.current) {
        wrapperRef.current.style.animation = ''
        wrapperRef.current.style.willChange = ''
      }
    }
  }, [phase, asset, fps])

  return <div ref={wrapperRef} className="w-full h-full">{children}</div>
}

// ── Live ad video with autoPlay, time tracking, and auto-exit ─────────────────

function LiveAdVideo({
  asset,
  onEnded,
  onTimeUpdate,
}: {
  asset: BroadcastAsset
  onEnded: () => void
  onTimeUpdate: (remaining: number, duration: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const volume = asset.ad_config?.volume ?? 1

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.volume = volume
  }, [volume])

  const handleTimeUpdate = useCallback(() => {
    const el = videoRef.current
    if (!el || !el.duration) return
    const remaining = el.duration - el.currentTime
    onTimeUpdate(remaining, el.duration)
  }, [onTimeUpdate])

  return (
    <div className="w-full h-full relative overflow-hidden">
      <video
        ref={videoRef}
        src={toMediaUrl(asset.storage_path)}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
        onEnded={onEnded}
        onTimeUpdate={handleTimeUpdate}
      />
      <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-emerald-600/80 rounded text-[9px] text-white font-bold">
        AD
      </div>
    </div>
  )
}

// ── Stinger overlay for live preview ──────────────────────────────────────────

function LiveStingerOverlay({
  videoUrl,
  enterTransition,
  onStingerEnded,
  onComplete,
  fps,
}: {
  videoUrl: string
  enterTransition: import('@/lib/broadcastTypes').TransitionConfig | null
  onStingerEnded: () => void
  onComplete: () => void
  fps: number
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const enterStyleRef = useRef<HTMLStyleElement | null>(null)
  const exitStyleRef = useRef<HTMLStyleElement | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Apply enter transition on mount, start playback
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.play().catch(console.error)

    if (enterTransition && wrapperRef.current) {
      const result = generateCSSAnimation(enterTransition, 'enter', 1920, 1080, 0, 0, fps)
      if (result) {
        enterStyleRef.current = injectKeyframes(result.keyframes)
        wrapperRef.current.style.animation = result.animation
      }
    }

    return () => {
      if (enterStyleRef.current) { removeKeyframes(enterStyleRef.current); enterStyleRef.current = null }
      if (exitStyleRef.current) { removeKeyframes(exitStyleRef.current); exitStyleRef.current = null }
    }
  }, [videoUrl, enterTransition, fps])

  // When stinger video ends: reveal asset, slide stinger left, then fire onComplete
  const handleEnded = useCallback(() => {
    onStingerEnded()

    // Slide the stinger left to reveal the asset underneath
    if (wrapperRef.current) {
      const slideLeft = { presetId: 'slide-out-left', durationFrames: Math.round(fps * 0.5) }
      const result = generateCSSAnimation(slideLeft, 'exit', 1920, 1080, 0, 0, fps)
      if (result) {
        if (enterStyleRef.current) { removeKeyframes(enterStyleRef.current); enterStyleRef.current = null }
        exitStyleRef.current = injectKeyframes(result.keyframes)
        wrapperRef.current.style.animation = result.animation
        const match = result.animation.match(/(\d+)ms/)
        const durationMs = match ? parseInt(match[1]) : 500
        setTimeout(onComplete, durationMs)
      } else {
        onComplete()
      }
    } else {
      onComplete()
    }
  }, [onStingerEnded, onComplete, fps])

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'absolute', inset: 0, zIndex: 99999, pointerEvents: 'none' }}
    >
      <video
        ref={videoRef}
        src={toMediaUrl(videoUrl)}
        onLoadedData={() => setLoaded(true)}
        onEnded={handleEnded}
        autoPlay
        muted
        playsInline
        preload="auto"
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0 }}
      />
    </div>
  )
}

// ── Live asset content renderer ───────────────────────────────────────────────

function LiveAssetContent({
  asset,
  onAdEnded,
  onTimeUpdate,
}: {
  asset: BroadcastAsset
  onAdEnded: (assetId: string) => void
  onTimeUpdate: (assetId: string, remaining: number, duration: number) => void
}) {
  // Advertisement — autoPlay with time tracking and auto-exit
  if (asset.asset_type === 'advertisement' && asset.storage_path) {
    return (
      <LiveAdVideo
        asset={asset}
        onEnded={() => onAdEnded(asset.id)}
        onTimeUpdate={(rem, dur) => onTimeUpdate(asset.id, rem, dur)}
      />
    )
  }

  // All other types use the standard preview (which handles scenes, images, slideshows, videos)
  return <AssetPreview asset={asset} isVisible={true} />
}

// ── Main LivePreview component ────────────────────────────────────────────────

export default function LivePreview() {
  const {
    assets, visibleAssetIds, animatingAssets, setSelectedAssetId, project,
    liveStinger, handleStingerCutPoint, handleStingerComplete,
    handleAdEnded, setVideoTimeInfo,
  } = useBroadcast()

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const zoom = containerSize.w > 0
    ? Math.min(containerSize.w / CANVAS_W, containerSize.h / CANVAS_H, 1) * 0.95
    : 0.5

  const measRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const obs = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    obs.observe(node)
    return () => obs.disconnect()
  }, [])

  const fps = project?.settings?.fps || 30

  // Render visible assets + assets still in exit animation
  const renderedIds = new Set([...visibleAssetIds])
  for (const [id, phase] of animatingAssets) {
    if (phase === 'exiting') renderedIds.add(id)
  }

  const renderedAssets = assets.filter(a => renderedIds.has(a.id))

  // When stinger is active and asset has stinger, hide the asset content until cut point fires
  const stingerAssetId = liveStinger?.assetId ?? null

  return (
    <div ref={measRef} className="flex-1 overflow-hidden flex items-center justify-center bg-zinc-950 relative">
      {/* LIVE badge */}
      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-red-600 rounded text-[10px] font-bold text-white tracking-wider">
        LIVE
      </div>

      <div
        className="relative shrink-0"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
          background: '#000',
        }}
        onClick={() => setSelectedAssetId(null)}
      >
        {[...renderedAssets].sort((a, b) => a.layer - b.layer).map(asset => {
          const phase = animatingAssets.get(asset.id) || null

          // If this asset is being revealed by a stinger, don't animate it with enter_transition
          // The stinger handles the enter visually; the asset just appears under the stinger
          const effectivePhase = (stingerAssetId === asset.id && phase === 'entering') ? null : phase

          return (
            <div
              key={asset.id}
              className="absolute cursor-pointer"
              style={{
                left: asset.canvas_x,
                top: asset.canvas_y,
                width: asset.canvas_width,
                height: asset.canvas_height,
                zIndex: asset.layer,
              }}
              onClick={e => { e.stopPropagation(); setSelectedAssetId(asset.id) }}
            >
              <AnimatedAssetWrapper asset={asset} phase={effectivePhase} fps={fps}>
                <LiveAssetContent
                  asset={asset}
                  onAdEnded={handleAdEnded}
                  onTimeUpdate={setVideoTimeInfo}
                />
              </AnimatedAssetWrapper>
            </div>
          )
        })}

        {/* Stinger overlay */}
        {liveStinger && (
          <LiveStingerOverlay
            videoUrl={liveStinger.videoUrl}
            enterTransition={liveStinger.enterTransition}
            onStingerEnded={handleStingerCutPoint}
            onComplete={handleStingerComplete}
            fps={fps}
          />
        )}
      </div>
    </div>
  )
}
