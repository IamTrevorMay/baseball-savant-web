'use client'

import { useState, useCallback, useRef, useEffect, MutableRefObject } from 'react'
import { useBroadcast } from './BroadcastContext'
import { BroadcastAsset } from '@/lib/broadcastTypes'
import { SceneElement } from '@/lib/sceneTypes'
import { generateCSSAnimation, injectKeyframes, removeKeyframes } from '@/lib/overlayAnimationEngine'
import { generateSlideshowTransitionCSS } from '@/lib/slideshowTransitions'
import renderElementContent from '@/components/visualize/scene-composer/ElementRenderer'
import { toMediaUrl } from '@/lib/localMedia'
import type { useStreamDeck } from '@/lib/useStreamDeck'
import type { ButtonEntry } from '@/lib/streamDeckProfile'

const CANVAS_W = 1920
const CANVAS_H = 1080

// ── Scene element wrapper style (mirrored from BroadcastCanvas) ──────────────

function computeWrapperStyle(el: SceneElement): React.CSSProperties {
  const p = el.props
  const style: React.CSSProperties = {
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    opacity: el.opacity,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    zIndex: el.zIndex,
  }

  if (p.shadowBlur > 0) {
    style.boxShadow = `${p.shadowOffsetX || 0}px ${p.shadowOffsetY || 0}px ${p.shadowBlur}px ${p.shadowColor || '#000000'}`
  }
  if (p.borderWidth > 0) {
    style.border = `${p.borderWidth}px solid ${p.borderColor || '#06b6d4'}`
  }
  if (p.borderRadius > 0) {
    style.borderRadius = `${p.borderRadius}px`
  }
  if (p.blurAmount > 0) {
    style.backdropFilter = `blur(${p.blurAmount}px)`
    style.WebkitBackdropFilter = `blur(${p.blurAmount}px)`
  }
  if (p.bgColor && p.bgColor !== 'transparent') {
    const opacity = p.bgOpacity ?? 1
    if (opacity < 1) {
      const hex = p.bgColor.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16) || 0
      const g = parseInt(hex.substring(2, 4), 16) || 0
      const b = parseInt(hex.substring(4, 6), 16) || 0
      style.backgroundColor = `rgba(${r},${g},${b},${opacity})`
    } else {
      style.backgroundColor = p.bgColor
    }
  }
  if (p.borderRadius > 0 || p.borderWidth > 0) {
    style.overflow = 'hidden'
  }
  return style
}

// ── Asset content renderer for preview canvas ────────────────────────────────

function TestAssetContent({ asset, slideIndex, onVideoEnded }: { asset: BroadcastAsset; slideIndex?: number; onVideoEnded?: () => void }) {
  if (asset.asset_type === 'advertisement' && asset.storage_path) {
    const volume = asset.ad_config?.volume ?? 1
    return (
      <div className="w-full h-full relative overflow-hidden">
        <video
          src={toMediaUrl(asset.storage_path)}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
          ref={el => { if (el) el.volume = volume }}
          onEnded={onVideoEnded}
        />
        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-emerald-600/80 rounded text-[9px] text-white font-bold">
          AD
        </div>
      </div>
    )
  }

  if (asset.asset_type === 'slideshow') {
    return <TestSlideshowContent asset={asset} slideIndex={slideIndex || 0} />
  }

  if (asset.asset_type === 'scene' && asset.scene_config) {
    const elements = asset.scene_config.elements || []
    const nativeW = asset.scene_config.width || asset.canvas_width
    const nativeH = asset.scene_config.height || asset.canvas_height
    const scaleX = asset.canvas_width / nativeW
    const scaleY = asset.canvas_height / nativeH
    return (
      <div className="w-full h-full overflow-hidden">
        <div
          className="relative"
          style={{
            width: nativeW,
            height: nativeH,
            transform: `scale(${scaleX}, ${scaleY})`,
            transformOrigin: 'top left',
            background: asset.scene_config.background === 'transparent' ? undefined : asset.scene_config.background,
          }}
        >
          {[...elements].sort((a, b) => a.zIndex - b.zIndex).map(el => (
            <div key={el.id} className="absolute" style={computeWrapperStyle(el)}>
              {renderElementContent(el)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (asset.asset_type === 'image' && asset.storage_path) {
    return (
      <div className="w-full h-full overflow-hidden">
        <img src={toMediaUrl(asset.storage_path)} alt={asset.name} className="w-full h-full object-contain" draggable={false} />
      </div>
    )
  }

  if (asset.asset_type === 'video' && asset.storage_path) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-800/50">
        <div className="text-zinc-500 text-sm flex flex-col items-center gap-1">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>{asset.name}</span>
        </div>
      </div>
    )
  }

  return null
}

// ── Slideshow with transition support ─────────────────────────────────────

function TestSlideshowContent({ asset, slideIndex }: { asset: BroadcastAsset; slideIndex: number }) {
  const config = asset.slideshow_config
  const prevIdxRef = useRef(slideIndex)
  const [transitioning, setTransitioning] = useState(false)
  const [prevSlideIdx, setPrevSlideIdx] = useState(0)
  const [oldAnim, setOldAnim] = useState('')
  const [newAnim, setNewAnim] = useState('')
  const transStyleRef = useRef<HTMLStyleElement | null>(null)

  useEffect(() => {
    if (slideIndex === prevIdxRef.current) return
    if (!config || config.slides.length < 2) {
      prevIdxRef.current = slideIndex
      return
    }
    const slide = config.slides[slideIndex]
    const transType = slide?.transition || config.transition || 'none'
    if (transType === 'none') {
      prevIdxRef.current = slideIndex
      return
    }
    const duration = config.transitionDuration || 500
    const result = generateSlideshowTransitionCSS(transType, duration)
    if (!result) { prevIdxRef.current = slideIndex; return }

    setPrevSlideIdx(prevIdxRef.current)
    prevIdxRef.current = slideIndex
    if (transStyleRef.current) removeKeyframes(transStyleRef.current)
    transStyleRef.current = injectKeyframes(result.keyframes)
    setOldAnim(result.oldAnimation)
    setNewAnim(result.newAnimation)
    setTransitioning(true)
    const timer = setTimeout(() => {
      setTransitioning(false)
      if (transStyleRef.current) { removeKeyframes(transStyleRef.current); transStyleRef.current = null }
    }, duration)
    return () => { clearTimeout(timer); if (transStyleRef.current) { removeKeyframes(transStyleRef.current); transStyleRef.current = null } }
  }, [slideIndex, config])

  if (!config || !config.slides.length) {
    return <div className="w-full h-full flex items-center justify-center bg-zinc-800/50"><span className="text-zinc-500 text-xs">Empty Slideshow</span></div>
  }

  const currentSlide = config.slides[slideIndex] || config.slides[0]
  const prevSlide = config.slides[prevSlideIdx]
  const fit = config.fit || 'contain'

  function renderSlide(slide: typeof currentSlide) {
    if (slide.type === 'image') {
      return <img src={toMediaUrl(slide.storage_path)} alt={slide.name} className="w-full h-full" style={{ objectFit: fit }} draggable={false} />
    }
    return <video key={slide.id} src={toMediaUrl(slide.storage_path)} autoPlay playsInline className="w-full h-full" style={{ objectFit: fit }} />
  }

  return (
    <div className="w-full h-full relative overflow-hidden">
      {transitioning && prevSlide && (
        <div className="absolute inset-0" style={{ animation: oldAnim }}>{renderSlide(prevSlide)}</div>
      )}
      <div className={transitioning ? 'absolute inset-0' : 'w-full h-full'} style={transitioning ? { animation: newAnim } : undefined}>
        {renderSlide(currentSlide)}
      </div>
      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-zinc-300 font-mono">
        {slideIndex + 1}/{config.slides.length}
      </div>
    </div>
  )
}

// ── Animation wrapper for test preview ───────────────────────────────────────

function TestAnimationWrapper({
  asset,
  phase,
  onAnimationEnd,
  children,
}: {
  asset: BroadcastAsset
  phase: 'entering' | 'exiting' | null
  onAnimationEnd: () => void
  children: React.ReactNode
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLStyleElement | null>(null)

  useEffect(() => {
    if (!wrapperRef.current || !phase) {
      // Clear any leftover animation
      if (styleRef.current) { removeKeyframes(styleRef.current); styleRef.current = null }
      if (wrapperRef.current) wrapperRef.current.style.animation = ''
      return
    }

    const isEnter = phase === 'entering'
    const transition = isEnter ? asset.enter_transition : asset.exit_transition
    const result = generateCSSAnimation(
      transition,
      isEnter ? 'enter' : 'exit',
      asset.canvas_width,
      asset.canvas_height,
      asset.canvas_x,
      asset.canvas_y,
      30,
    )

    if (result) {
      if (styleRef.current) removeKeyframes(styleRef.current)
      styleRef.current = injectKeyframes(result.keyframes)
      wrapperRef.current.style.animation = result.animation

      // Parse duration from animation string to fire onAnimationEnd
      const match = result.animation.match(/(\d+)ms/)
      const durationMs = match ? parseInt(match[1]) : 500
      const timer = setTimeout(onAnimationEnd, durationMs)
      return () => {
        clearTimeout(timer)
        if (styleRef.current) { removeKeyframes(styleRef.current); styleRef.current = null }
      }
    } else {
      // No transition configured — fire immediately
      onAnimationEnd()
    }

    return () => {
      if (styleRef.current) { removeKeyframes(styleRef.current); styleRef.current = null }
      if (wrapperRef.current) wrapperRef.current.style.animation = ''
    }
  }, [phase, asset, onAnimationEnd])

  return <div ref={wrapperRef} className="w-full h-full">{children}</div>
}

// ── Control Button ───────────────────────────────────────────────────────────

function ControlButton({
  asset,
  isActive,
  mode,
  duration,
  onTrigger,
  onModeChange,
  onDurationChange,
}: {
  asset: BroadcastAsset
  isActive: boolean
  mode: 'toggle' | 'timed'
  duration: number
  onTrigger: (id: string) => void
  onModeChange: (id: string, mode: 'toggle' | 'timed') => void
  onDurationChange: (id: string, duration: number) => void
}) {
  const color = asset.hotkey_color || '#06b6d4'

  return (
    <div className="flex flex-col gap-1.5">
      {/* Main trigger button */}
      <button
        onClick={() => onTrigger(asset.id)}
        className="relative rounded-lg border-2 transition-all duration-150 p-2.5 text-left hover:scale-[1.02] active:scale-[0.98]"
        style={{
          borderColor: isActive ? color : '#3f3f46',
          backgroundColor: isActive ? color + '18' : '#18181b',
          boxShadow: isActive ? `0 0 16px ${color}30` : undefined,
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0 transition-colors"
            style={{ backgroundColor: isActive ? color : '#52525b' }}
          />
          <span className="text-xs text-zinc-200 truncate">{asset.name}</span>
        </div>
        {/* Type badge */}
        <span className="text-[9px] text-zinc-500 mt-0.5 block">
          {asset.asset_type === 'advertisement' ? (
            <span className="text-emerald-400 font-bold">AD</span>
          ) : asset.asset_type}
        </span>
      </button>

      {/* Mode selector + duration */}
      <div className="flex items-center gap-1">
        <div className="flex bg-zinc-800 rounded overflow-hidden border border-zinc-700">
          <button
            onClick={() => onModeChange(asset.id, 'toggle')}
            className={`px-2 py-0.5 text-[9px] font-medium transition ${
              mode === 'toggle' ? 'bg-zinc-600 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Toggle
          </button>
          <button
            onClick={() => onModeChange(asset.id, 'timed')}
            className={`px-2 py-0.5 text-[9px] font-medium transition ${
              mode === 'timed' ? 'bg-zinc-600 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Timed
          </button>
        </div>
        {mode === 'timed' && (
          <div className="flex items-center gap-0.5">
            <input
              type="number"
              min={0.5}
              max={30}
              step={0.5}
              value={duration}
              onChange={e => onDurationChange(asset.id, parseFloat(e.target.value) || 3)}
              className="w-10 text-[10px] text-center bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-1 py-0.5"
            />
            <span className="text-[9px] text-zinc-500">s</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Slideshow Controls for Test Mode ────────────────────────────────────────

function SlideshowControls({
  asset,
  slideIndex,
  onPrev,
  onNext,
}: {
  asset: BroadcastAsset
  slideIndex: number
  onPrev: () => void
  onNext: () => void
}) {
  const slideCount = asset.slideshow_config?.slides?.length || 0
  if (slideCount === 0) return null

  return (
    <div className="flex items-center gap-1 mt-1">
      <button
        onClick={e => { e.stopPropagation(); onPrev() }}
        className="px-1.5 py-0.5 text-[9px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-700 hover:text-zinc-200 transition"
      >
        Prev
      </button>
      <span className="text-[9px] text-zinc-500 font-mono px-1">
        {slideIndex + 1}/{slideCount}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onNext() }}
        className="px-1.5 py-0.5 text-[9px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-700 hover:text-zinc-200 transition"
      >
        Next
      </button>
    </div>
  )
}

// ── StreamDeckGrid (Test Mode) ───────────────────────────────────────────────

interface StreamDeckGridProps {
  streamDeck?: ReturnType<typeof useStreamDeck>
  sdButtonOrder?: ButtonEntry[]
  callbackRefs?: {
    toggle: MutableRefObject<((id: string) => void) | null>
    slideNext: MutableRefObject<(() => void) | null>
    slidePrev: MutableRefObject<(() => void) | null>
  }
}

export default function StreamDeckGrid({ streamDeck, sdButtonOrder, callbackRefs }: StreamDeckGridProps) {
  const { assets, project } = useBroadcast()

  // Local test state — no session required
  const [testVisibleIds, setTestVisibleIds] = useState<Set<string>>(new Set())
  const [testAnimating, setTestAnimating] = useState<Map<string, 'entering' | 'exiting'>>(new Map())
  const [testModes, setTestModes] = useState<Map<string, 'toggle' | 'timed'>>(new Map())
  const [testDurations, setTestDurations] = useState<Map<string, number>>(new Map())
  const [testSlideIndexes, setTestSlideIndexes] = useState<Map<string, number>>(new Map())
  const timerRefs = useRef<Map<string, NodeJS.Timeout>>(new Map())

  // Preview canvas scaling
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const measRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const obs = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    obs.observe(node)
    return () => obs.disconnect()
  }, [])

  const zoom = containerSize.w > 0
    ? Math.min(containerSize.w / CANVAS_W, containerSize.h / CANVAS_H, 1) * 0.95
    : 0.5

  const fps = project?.settings?.fps || 30

  // Get mode/duration for an asset
  function getMode(asset: BroadcastAsset): 'toggle' | 'timed' {
    return testModes.get(asset.id) || (asset.trigger_mode === 'flash' ? 'timed' : 'toggle')
  }
  function getDuration(asset: BroadcastAsset): number {
    return testDurations.get(asset.id) ?? asset.trigger_duration ?? 3
  }

  // Get animation duration in ms for an asset phase
  function getAnimDurationMs(asset: BroadcastAsset, phase: 'enter' | 'exit'): number {
    const transition = phase === 'enter' ? asset.enter_transition : asset.exit_transition
    if (!transition) return 0
    return (transition.durationFrames / fps) * 1000
  }

  // ── Trigger logic ──────────────────────────────────────────────────────────

  const handleTestTrigger = useCallback((assetId: string) => {
    const asset = assets.find(a => a.id === assetId)
    if (!asset) return
    const isVisible = testVisibleIds.has(assetId)
    const animating = testAnimating.get(assetId)

    // Don't allow re-trigger while animating
    if (animating) {
      // If entering and user clicks, force exit early
      if (animating === 'entering') return
      return
    }

    if (!isVisible) {
      // ── ENTER ──
      setTestVisibleIds(prev => new Set(prev).add(assetId))
      setTestAnimating(prev => new Map(prev).set(assetId, 'entering'))

      // After enter animation completes, clear entering state and maybe start timer
      const enterMs = getAnimDurationMs(asset, 'enter')
      setTimeout(() => {
        setTestAnimating(prev => {
          const next = new Map(prev)
          if (next.get(assetId) === 'entering') next.delete(assetId)
          return next
        })

        // If timed mode, start countdown
        const mode = getMode(asset)
        if (mode === 'timed') {
          const dur = getDuration(asset) * 1000
          const timer = setTimeout(() => {
            triggerExit(assetId)
            timerRefs.current.delete(assetId)
          }, dur)
          timerRefs.current.set(assetId, timer)
        }
      }, Math.max(enterMs, 50))
    } else {
      // ── EXIT ──
      triggerExit(assetId)
    }
  }, [assets, testVisibleIds, testAnimating, testModes, testDurations])

  const triggerExit = useCallback((assetId: string) => {
    const asset = assets.find(a => a.id === assetId)
    if (!asset) return

    // Clear any timed countdown
    const existing = timerRefs.current.get(assetId)
    if (existing) { clearTimeout(existing); timerRefs.current.delete(assetId) }

    setTestAnimating(prev => new Map(prev).set(assetId, 'exiting'))

    const exitMs = getAnimDurationMs(asset, 'exit')
    setTimeout(() => {
      setTestVisibleIds(prev => {
        const next = new Set(prev)
        next.delete(assetId)
        return next
      })
      setTestAnimating(prev => {
        const next = new Map(prev)
        next.delete(assetId)
        return next
      })
    }, Math.max(exitMs, 50))
  }, [assets])

  // ── Mode/duration handlers ─────────────────────────────────────────────────

  const handleModeChange = useCallback((id: string, mode: 'toggle' | 'timed') => {
    setTestModes(prev => new Map(prev).set(id, mode))
  }, [])

  const handleDurationChange = useCallback((id: string, duration: number) => {
    setTestDurations(prev => new Map(prev).set(id, duration))
  }, [])

  // ── Slideshow navigation ──────────────────────────────────────────────────

  const handleSlideshowNext = useCallback((assetId: string) => {
    const asset = assets.find(a => a.id === assetId)
    const slideCount = asset?.slideshow_config?.slides?.length || 0
    if (slideCount === 0) return
    setTestSlideIndexes(prev => {
      const current = prev.get(assetId) || 0
      return new Map(prev).set(assetId, (current + 1) % slideCount)
    })
  }, [assets])

  const handleSlideshowPrev = useCallback((assetId: string) => {
    const asset = assets.find(a => a.id === assetId)
    const slideCount = asset?.slideshow_config?.slides?.length || 0
    if (slideCount === 0) return
    setTestSlideIndexes(prev => {
      const current = prev.get(assetId) || 0
      return new Map(prev).set(assetId, (current - 1 + slideCount) % slideCount)
    })
  }, [assets])

  // ── Reset All ──────────────────────────────────────────────────────────────

  const handleResetAll = useCallback(() => {
    // Clear all timers
    for (const timer of timerRefs.current.values()) clearTimeout(timer)
    timerRefs.current.clear()
    setTestVisibleIds(new Set())
    setTestAnimating(new Map())
    setTestSlideIndexes(new Map())
  }, [])

  // ── Stream Deck: override page-level callbacks for test mode ────────────────

  // Keep refs to latest test-mode handlers (avoid stale closures in callbackRefs)
  const handleTestTriggerRef = useRef(handleTestTrigger)
  handleTestTriggerRef.current = handleTestTrigger
  const handleSlideshowNextRef = useRef(handleSlideshowNext)
  handleSlideshowNextRef.current = handleSlideshowNext
  const handleSlideshowPrevRef = useRef(handleSlideshowPrev)
  handleSlideshowPrevRef.current = handleSlideshowPrev
  const testVisibleIdsRef = useRef(testVisibleIds)
  testVisibleIdsRef.current = testVisibleIds

  useEffect(() => {
    if (!callbackRefs) return

    // Override page-level callbacks to route to test mode handlers
    callbackRefs.toggle.current = (id: string) => handleTestTriggerRef.current(id)
    callbackRefs.slideNext.current = () => {
      const ss = assets.find(a => a.asset_type === 'slideshow' && testVisibleIdsRef.current.has(a.id))
      if (ss) handleSlideshowNextRef.current(ss.id)
    }
    callbackRefs.slidePrev.current = () => {
      const ss = assets.find(a => a.asset_type === 'slideshow' && testVisibleIdsRef.current.has(a.id))
      if (ss) handleSlideshowPrevRef.current(ss.id)
    }

    return () => {
      // Clear overrides when leaving test mode
      callbackRefs.toggle.current = null
      callbackRefs.slideNext.current = null
      callbackRefs.slidePrev.current = null
    }
  }, [callbackRefs, assets])

  // Push test-mode button state to physical device
  useEffect(() => {
    if (streamDeck?.isConnected && sdButtonOrder && sdButtonOrder.length > 0) {
      streamDeck.updateButtons(sdButtonOrder, testVisibleIds, null)
    }
  }, [streamDeck?.isConnected, sdButtonOrder, testVisibleIds])

  // Animation end handler per asset (for the wrapper callback)
  const makeAnimEndHandler = useCallback((assetId: string) => () => {
    // The animation wrapper fires this — we handle timing ourselves via setTimeout,
    // so this is a no-op. The setTimeout in handleTestTrigger/triggerExit manages state.
  }, [])

  // Sorted assets for preview layering
  const sortedAssets = [...assets].sort((a, b) => a.layer - b.layer)

  return (
    <div className="flex-1 overflow-hidden flex bg-zinc-950">
      {/* ── Left Panel: Control Grid ──────────────────────────────────────── */}
      <div className="w-80 shrink-0 border-r border-zinc-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Assets</span>
          <button
            onClick={handleResetAll}
            className="text-[10px] px-2 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition"
          >
            Reset All
          </button>
        </div>

        {/* Asset buttons */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {assets.length === 0 && (
            <div className="text-xs text-zinc-500 text-center py-8">No assets in project</div>
          )}
          {assets.map(asset => (
            <div key={asset.id}>
              <ControlButton
                asset={asset}
                isActive={testVisibleIds.has(asset.id)}
                mode={getMode(asset)}
                duration={getDuration(asset)}
                onTrigger={handleTestTrigger}
                onModeChange={handleModeChange}
                onDurationChange={handleDurationChange}
              />
              {asset.asset_type === 'slideshow' && (
                <SlideshowControls
                  asset={asset}
                  slideIndex={testSlideIndexes.get(asset.id) || 0}
                  onPrev={() => handleSlideshowPrev(asset.id)}
                  onNext={() => handleSlideshowNext(asset.id)}
                />
              )}
            </div>
          ))}
        </div>

        {/* Active count */}
        <div className="px-3 py-2 border-t border-zinc-800 text-[10px] text-zinc-500">
          {testVisibleIds.size} / {assets.length} active
        </div>
      </div>

      {/* ── Right Panel: Preview Canvas ───────────────────────────────────── */}
      <div ref={measRef} className="flex-1 overflow-hidden flex items-center justify-center">
        <div
          className="relative shrink-0 shadow-2xl"
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            backgroundImage: 'repeating-conic-gradient(#27272a 0% 25%, #18181b 0% 50%)',
            backgroundSize: '20px 20px',
          }}
        >
          {/* Render visible assets */}
          {sortedAssets.map(asset => {
            const isVisible = testVisibleIds.has(asset.id)
            if (!isVisible) return null
            const phase = testAnimating.get(asset.id) || null

            return (
              <div
                key={asset.id}
                className="absolute"
                style={{
                  left: asset.canvas_x,
                  top: asset.canvas_y,
                  width: asset.canvas_width,
                  height: asset.canvas_height,
                  zIndex: asset.layer,
                  opacity: asset.opacity ?? 1,
                }}
              >
                <TestAnimationWrapper
                  asset={asset}
                  phase={phase}
                  onAnimationEnd={makeAnimEndHandler(asset.id)}
                >
                  <TestAssetContent
                    asset={asset}
                    slideIndex={testSlideIndexes.get(asset.id) || 0}
                    onVideoEnded={asset.asset_type === 'advertisement' ? () => triggerExit(asset.id) : undefined}
                  />
                </TestAnimationWrapper>
              </div>
            )
          })}

          {/* Canvas size label */}
          <div className="absolute bottom-2 right-3 text-[10px] text-zinc-600 font-mono">
            {CANVAS_W}x{CANVAS_H}
          </div>
        </div>
      </div>
    </div>
  )
}
