'use client'

import { useEffect, useRef, useState } from 'react'
import { SceneElement } from '@/lib/sceneTypes'
import { BroadcastAsset } from '@/lib/broadcastTypes'
import renderElementContent from '@/components/visualize/scene-composer/ElementRenderer'
import { injectKeyframes, removeKeyframes } from '@/lib/overlayAnimationEngine'
import { generateSlideshowTransitionCSS } from '@/lib/slideshowTransitions'
import { useBroadcast } from './BroadcastContext'
import { toMediaUrl } from '@/lib/localMedia'

export function computeWrapperStyle(el: SceneElement): React.CSSProperties {
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

export function SlideshowPreview({ asset, isVisible }: { asset: BroadcastAsset; isVisible: boolean }) {
  const { getSlideshowIndex } = useBroadcast()
  const config = asset.slideshow_config
  const index = getSlideshowIndex(asset.id)

  const prevIdxRef = useRef(index)
  const [transitioning, setTransitioning] = useState(false)
  const [prevSlideIdx, setPrevSlideIdx] = useState(0)
  const [oldAnim, setOldAnim] = useState('')
  const [newAnim, setNewAnim] = useState('')
  const transStyleRef = useRef<HTMLStyleElement | null>(null)

  useEffect(() => {
    if (index === prevIdxRef.current) return
    if (!config || config.slides.length < 2) {
      prevIdxRef.current = index
      return
    }

    const currentSlide = config.slides[index]
    const transType = currentSlide?.transition || config.transition || 'none'

    if (transType === 'none') {
      prevIdxRef.current = index
      return
    }

    const duration = config.transitionDuration || 500
    const result = generateSlideshowTransitionCSS(transType, duration)

    if (!result) {
      prevIdxRef.current = index
      return
    }

    setPrevSlideIdx(prevIdxRef.current)
    prevIdxRef.current = index

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
  }, [index, config])

  if (!config || !config.slides.length) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-800/50" style={{ opacity: isVisible ? 1 : 0.3 }}>
        <span className="text-zinc-500 text-xs">Empty Slideshow</span>
      </div>
    )
  }

  const currentSlide = config.slides[index] || config.slides[0]
  const prevSlide = config.slides[prevSlideIdx]
  const fit = config.fit || 'contain'
  const dimmedOpacity = isVisible ? (asset.opacity ?? 1) : (asset.opacity ?? 1) * 0.3

  function renderSlide(slide: typeof currentSlide) {
    if (slide.type === 'image') {
      return <img src={toMediaUrl(slide.storage_path)} alt={slide.name} className="w-full h-full" style={{ objectFit: fit }} draggable={false} />
    }
    return <video key={slide.id} src={toMediaUrl(slide.storage_path)} autoPlay playsInline className="w-full h-full" style={{ objectFit: fit }} />
  }

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ opacity: dimmedOpacity }}>
      {transitioning && prevSlide && (
        <div className="absolute inset-0" style={{ animation: oldAnim }}>
          {renderSlide(prevSlide)}
        </div>
      )}
      <div className={transitioning ? 'absolute inset-0' : 'w-full h-full'} style={transitioning ? { animation: newAnim } : undefined}>
        {renderSlide(currentSlide)}
      </div>
      {/* Slide counter badge */}
      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-zinc-300 font-mono">
        {index + 1}/{config.slides.length}
      </div>
    </div>
  )
}

export default function AssetPreview({ asset, isVisible }: { asset: BroadcastAsset; isVisible: boolean }) {
  const assetOpacity = asset.opacity ?? 1
  const dimmedOpacity = isVisible ? assetOpacity : assetOpacity * 0.3

  if (asset.asset_type === 'slideshow') {
    return <SlideshowPreview asset={asset} isVisible={isVisible} />
  }

  if (asset.asset_type === 'scene' && asset.scene_config) {
    const elements = asset.scene_config.elements || []
    const nativeW = asset.scene_config.width || asset.canvas_width
    const nativeH = asset.scene_config.height || asset.canvas_height
    const scaleX = asset.canvas_width / nativeW
    const scaleY = asset.canvas_height / nativeH
    return (
      <div className="w-full h-full overflow-hidden" style={{ opacity: dimmedOpacity }}>
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
      <div className="w-full h-full overflow-hidden" style={{ opacity: dimmedOpacity }}>
        <img src={toMediaUrl(asset.storage_path)} alt={asset.name} className="w-full h-full object-contain" draggable={false} />
      </div>
    )
  }

  if (asset.asset_type === 'advertisement' && asset.storage_path) {
    return (
      <div className="w-full h-full relative overflow-hidden" style={{ opacity: dimmedOpacity }}>
        <video
          src={toMediaUrl(asset.storage_path)}
          muted
          playsInline
          className="w-full h-full object-cover"
          draggable={false}
        />
        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-emerald-600/80 rounded text-[9px] text-white font-bold">
          AD
        </div>
      </div>
    )
  }

  if (asset.asset_type === 'video' && asset.storage_path) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-800/50" style={{ opacity: dimmedOpacity }}>
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
