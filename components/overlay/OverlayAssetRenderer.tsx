'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { BroadcastAsset } from '@/lib/broadcastTypes'
import { SceneElement } from '@/lib/sceneTypes'
import renderElementContent from '@/components/visualize/scene-composer/ElementRenderer'
import { generateCSSAnimation, injectKeyframes, removeKeyframes } from '@/lib/overlayAnimationEngine'
import { generateSlideshowTransitionCSS } from '@/lib/slideshowTransitions'
import { toMediaUrl } from '@/lib/localMedia'

function computeWrapperStyle(el: SceneElement): React.CSSProperties {
  const p = el.props
  const style: React.CSSProperties = {
    position: 'absolute',
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

/**
 * Robust video component for OBS/CEF browser sources.
 * Uses loadeddata event + explicit .play() with retry to handle CEF autoplay.
 */
function OverlayVideo({
  src,
  volume,
  onEnded,
  fit = 'contain',
}: {
  src: string
  volume?: number
  onEnded?: () => void
  fit?: 'contain' | 'cover'
}) {
  const ref = useRef<HTMLVideoElement>(null)

  const tryPlay = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.muted = true
    el.play().then(() => {
      if (volume !== undefined && volume > 0) el.muted = false
    }).catch(() => {
      // Retry after a short delay (CEF sometimes needs a moment)
      setTimeout(() => {
        if (!ref.current) return
        ref.current.play().catch(() => {})
      }, 200)
    })
  }, [volume])

  const handleLoadedData = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (volume !== undefined) el.volume = volume
    tryPlay()
  }, [volume, tryPlay])

  // Also try to play on mount in case loadeddata already fired (cached video)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (volume !== undefined) el.volume = volume
    // If readyState >= 2 (HAVE_CURRENT_DATA), data is already loaded
    if (el.readyState >= 2) tryPlay()
  }, [volume, tryPlay])

  return (
    <video
      ref={ref}
      src={src}
      autoPlay
      muted
      playsInline
      preload="auto"
      onLoadedData={handleLoadedData}
      onEnded={onEnded}
      style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }}
    />
  )
}

interface AssetOverrides {
  x?: number
  y?: number
  width?: number
  height?: number
  layer?: number
  opacity?: number
}

interface Props {
  asset: BroadcastAsset
  animationPhase: 'entering' | 'exiting' | null
  fps?: number
  slideshowIndex?: number
  onVideoEnded?: () => void
  overrides?: AssetOverrides
}

export default function OverlayAssetRenderer({ asset, animationPhase, fps = 30, slideshowIndex = 0, onVideoEnded, overrides }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLStyleElement | null>(null)

  useEffect(() => {
    if (!animationPhase) return

    const transition = animationPhase === 'entering' ? asset.enter_transition : asset.exit_transition
    const result = generateCSSAnimation(
      transition,
      animationPhase === 'entering' ? 'enter' : 'exit',
      asset.canvas_width,
      asset.canvas_height,
      asset.canvas_x,
      asset.canvas_y,
      fps,
    )

    if (result && wrapperRef.current) {
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
  }, [animationPhase, asset, fps])

  // Apply scene overrides
  const effectiveX = overrides?.x ?? asset.canvas_x
  const effectiveY = overrides?.y ?? asset.canvas_y
  const effectiveW = overrides?.width ?? asset.canvas_width
  const effectiveH = overrides?.height ?? asset.canvas_height
  const effectiveLayer = overrides?.layer ?? asset.layer
  const assetOpacity = overrides?.opacity ?? asset.opacity ?? 1

  if (asset.asset_type === 'slideshow') {
    return (
      <SlideshowRenderer
        asset={asset}
        wrapperRef={wrapperRef}
        slideshowIndex={slideshowIndex}
        effectiveX={effectiveX}
        effectiveY={effectiveY}
        effectiveW={effectiveW}
        effectiveH={effectiveH}
        effectiveLayer={effectiveLayer}
        assetOpacity={assetOpacity}
      />
    )
  }

  if (asset.asset_type === 'scene' && asset.scene_config) {
    const elements = asset.scene_config.elements || []
    const nativeW = asset.scene_config.width || effectiveW
    const nativeH = asset.scene_config.height || effectiveH
    const scaleX = effectiveW / nativeW
    const scaleY = effectiveH / nativeH
    return (
      <div
        ref={wrapperRef}
        className="absolute overflow-hidden"
        style={{
          left: effectiveX,
          top: effectiveY,
          width: effectiveW,
          height: effectiveH,
          zIndex: effectiveLayer,
          opacity: assetOpacity,
        }}
      >
        <div
          className="relative"
          style={{
            width: nativeW,
            height: nativeH,
            transform: `scale(${scaleX}, ${scaleY})`,
            transformOrigin: 'top left',
            background: asset.scene_config.background === 'transparent' ? 'transparent' : asset.scene_config.background,
          }}
        >
          {[...elements].sort((a, b) => a.zIndex - b.zIndex).map(el => (
            <div key={el.id} style={computeWrapperStyle(el)}>
              {renderElementContent(el)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (asset.asset_type === 'image' && asset.storage_path) {
    return (
      <div
        ref={wrapperRef}
        className="absolute"
        style={{
          left: effectiveX,
          top: effectiveY,
          width: effectiveW,
          height: effectiveH,
          zIndex: effectiveLayer,
          opacity: assetOpacity,
        }}
      >
        <img src={toMediaUrl(asset.storage_path)} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      </div>
    )
  }

  if (asset.asset_type === 'advertisement' && asset.storage_path) {
    return (
      <div
        ref={wrapperRef}
        className="absolute overflow-hidden"
        style={{
          left: effectiveX,
          top: effectiveY,
          width: effectiveW,
          height: effectiveH,
          zIndex: effectiveLayer,
          opacity: assetOpacity,
        }}
      >
        <OverlayVideo
          src={toMediaUrl(asset.storage_path)}
          volume={asset.ad_config?.volume ?? 1}
          onEnded={onVideoEnded}
          fit="cover"
        />
      </div>
    )
  }

  if (asset.asset_type === 'video' && asset.storage_path) {
    return (
      <div
        ref={wrapperRef}
        className="absolute"
        style={{
          left: effectiveX,
          top: effectiveY,
          width: effectiveW,
          height: effectiveH,
          zIndex: effectiveLayer,
          opacity: assetOpacity,
        }}
      >
        <OverlayVideo src={toMediaUrl(asset.storage_path)} />
      </div>
    )
  }

  return null
}

// ── Slideshow Renderer with transitions ──────────────────────────────────
//
// Key fix: uses a local `displayedIndex` that only updates INSIDE the effect,
// so the current slide never jumps to the new image before the transition starts.

function SlideshowRenderer({
  asset,
  wrapperRef,
  slideshowIndex,
  effectiveX,
  effectiveY,
  effectiveW,
  effectiveH,
  effectiveLayer,
  assetOpacity,
}: {
  asset: BroadcastAsset
  wrapperRef: React.RefObject<HTMLDivElement | null>
  slideshowIndex: number
  effectiveX: number
  effectiveY: number
  effectiveW: number
  effectiveH: number
  effectiveLayer: number
  assetOpacity: number
}) {
  const config = asset.slideshow_config

  // displayedIndex is the slide currently shown full-screen.
  // It only advances AFTER the transition animation is fully set up,
  // preventing the one-frame flash of the new slide.
  const [displayedIndex, setDisplayedIndex] = useState(slideshowIndex)
  const [transition, setTransition] = useState<{
    fromIdx: number
    toIdx: number
    oldAnim: string
    newAnim: string
  } | null>(null)
  const transStyleRef = useRef<HTMLStyleElement | null>(null)
  const prevRequestedIdx = useRef(slideshowIndex)

  useEffect(() => {
    if (slideshowIndex === prevRequestedIdx.current) return
    const fromIdx = prevRequestedIdx.current
    prevRequestedIdx.current = slideshowIndex

    if (!config || config.slides.length < 2) {
      setDisplayedIndex(slideshowIndex)
      return
    }

    const targetSlide = config.slides[slideshowIndex]
    const transType = targetSlide?.transition || config.transition || 'none'

    if (transType === 'none') {
      setDisplayedIndex(slideshowIndex)
      return
    }

    const duration = config.transitionDuration || 500
    const result = generateSlideshowTransitionCSS(transType, duration)

    if (!result) {
      setDisplayedIndex(slideshowIndex)
      return
    }

    // Clean up any previous transition styles
    if (transStyleRef.current) removeKeyframes(transStyleRef.current)
    transStyleRef.current = injectKeyframes(result.keyframes)

    // Set up the transition — both slides render simultaneously
    setTransition({
      fromIdx,
      toIdx: slideshowIndex,
      oldAnim: result.oldAnimation,
      newAnim: result.newAnimation,
    })

    const timer = setTimeout(() => {
      // Transition done — commit the new index and clean up
      setDisplayedIndex(slideshowIndex)
      setTransition(null)
      if (transStyleRef.current) {
        removeKeyframes(transStyleRef.current)
        transStyleRef.current = null
      }
    }, duration)

    return () => {
      clearTimeout(timer)
      if (transStyleRef.current) {
        removeKeyframes(transStyleRef.current)
        transStyleRef.current = null
      }
    }
  }, [slideshowIndex, config])

  if (!config || !config.slides.length) return null
  const fit = config.fit || 'contain'

  // During transition: show both old and new slides with animations
  // Otherwise: show only the displayedIndex slide
  const baseSlide = config.slides[displayedIndex] || config.slides[0]

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'absolute',
        overflow: 'hidden',
        left: effectiveX,
        top: effectiveY,
        width: effectiveW,
        height: effectiveH,
        zIndex: effectiveLayer,
        opacity: assetOpacity,
      }}
    >
      {transition ? (
        <>
          {/* New slide — enters from behind/below */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, animation: transition.newAnim }}>
            <SlideContent slide={config.slides[transition.toIdx] || baseSlide} fit={fit} />
          </div>
          {/* Old slide — exits on top */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 2, animation: transition.oldAnim }}>
            <SlideContent slide={config.slides[transition.fromIdx] || baseSlide} fit={fit} />
          </div>
        </>
      ) : (
        <div style={{ position: 'absolute', inset: 0 }}>
          <SlideContent slide={baseSlide} fit={fit} />
        </div>
      )}
    </div>
  )
}

/** Individual slide content — uses OverlayVideo for video slides */
function SlideContent({ slide, fit }: { slide: { id: string; type: string; storage_path: string; name: string }; fit: string }) {
  if (slide.type === 'image') {
    return <img src={toMediaUrl(slide.storage_path)} alt={slide.name} style={{ width: '100%', height: '100%', objectFit: fit as any, display: 'block' }} />
  }
  return (
    <OverlayVideo
      key={slide.id}
      src={toMediaUrl(slide.storage_path)}
      fit={fit as any}
    />
  )
}
