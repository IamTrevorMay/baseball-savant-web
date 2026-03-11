'use client'

import { useEffect, useRef, useState } from 'react'
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

/** Force-play a video element (handles autoplay policy in OBS/CEF) */
function useAutoPlay(ref: React.RefObject<HTMLVideoElement | null>, volume?: number) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (volume !== undefined) el.volume = volume
    // Start muted for autoplay policy, then unmute if volume > 0
    el.muted = true
    el.play().then(() => {
      if (volume !== undefined && volume > 0) el.muted = false
    }).catch(() => {})
  }, [ref, volume])
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
  const adVideoRef = useRef<HTMLVideoElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

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

  const adVolume = asset.ad_config?.volume ?? 1
  useAutoPlay(adVideoRef, adVolume)
  useAutoPlay(videoRef)

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
        <img src={toMediaUrl(asset.storage_path)} alt={asset.name} className="w-full h-full object-contain" />
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
        <video
          ref={adVideoRef}
          src={toMediaUrl(asset.storage_path)}
          autoPlay
          muted
          playsInline
          preload="auto"
          className="w-full h-full object-cover"
          onEnded={onVideoEnded}
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
        <video
          ref={videoRef}
          src={toMediaUrl(asset.storage_path)}
          autoPlay
          muted
          playsInline
          preload="auto"
          className="w-full h-full object-contain"
        />
      </div>
    )
  }

  return null
}

// ── Slideshow Renderer with transitions ──────────────────────────────────

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
  const prevIdxRef = useRef(slideshowIndex)
  const [transitioning, setTransitioning] = useState(false)
  const [prevSlideIdx, setPrevSlideIdx] = useState(0)
  const [oldAnim, setOldAnim] = useState('')
  const [newAnim, setNewAnim] = useState('')
  const transStyleRef = useRef<HTMLStyleElement | null>(null)

  useEffect(() => {
    if (slideshowIndex === prevIdxRef.current) return
    if (!config || config.slides.length < 2) {
      prevIdxRef.current = slideshowIndex
      return
    }

    const currentSlide = config.slides[slideshowIndex]
    const transType = currentSlide?.transition || config.transition || 'none'

    if (transType === 'none') {
      prevIdxRef.current = slideshowIndex
      return
    }

    const duration = config.transitionDuration || 500
    const result = generateSlideshowTransitionCSS(transType, duration)

    if (!result) {
      prevIdxRef.current = slideshowIndex
      return
    }

    setPrevSlideIdx(prevIdxRef.current)
    prevIdxRef.current = slideshowIndex

    if (transStyleRef.current) removeKeyframes(transStyleRef.current)
    transStyleRef.current = injectKeyframes(result.keyframes)
    setOldAnim(result.oldAnimation)
    setNewAnim(result.newAnimation)
    setTransitioning(true)

    const timer = setTimeout(() => {
      setTransitioning(false)
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
  const currentSlide = config.slides[slideshowIndex] || config.slides[0]
  const prevSlide = config.slides[prevSlideIdx]
  const fit = config.fit || 'contain'

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
      {/* Current slide — always rendered, sits behind during transition */}
      <div className="absolute inset-0" style={{ zIndex: 1, ...(transitioning ? { animation: newAnim } : {}) }}>
        <SlideContent slide={currentSlide} fit={fit} />
      </div>
      {/* Previous slide — only during transition, on top so it animates out */}
      {transitioning && prevSlide && (
        <div className="absolute inset-0" style={{ animation: oldAnim, zIndex: 2 }}>
          <SlideContent slide={prevSlide} fit={fit} />
        </div>
      )}
    </div>
  )
}

/** Individual slide with autoplay for video slides */
function SlideContent({ slide, fit }: { slide: { id: string; type: string; storage_path: string; name: string }; fit: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.muted = true
    el.play().catch(() => {})
  }, [slide.id])

  if (slide.type === 'image') {
    return <img src={toMediaUrl(slide.storage_path)} alt={slide.name} className="w-full h-full" style={{ objectFit: fit as any }} />
  }
  return (
    <video
      ref={videoRef}
      key={slide.id}
      src={toMediaUrl(slide.storage_path)}
      autoPlay
      muted
      playsInline
      preload="auto"
      className="w-full h-full"
      style={{ objectFit: fit as any }}
    />
  )
}
