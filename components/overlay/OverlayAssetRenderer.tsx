'use client'

import { useEffect, useRef, useState } from 'react'
import { BroadcastAsset } from '@/lib/broadcastTypes'
import { SceneElement } from '@/lib/sceneTypes'
import renderElementContent from '@/components/visualize/scene-composer/ElementRenderer'
import { generateCSSAnimation, injectKeyframes, removeKeyframes } from '@/lib/overlayAnimationEngine'

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

interface Props {
  asset: BroadcastAsset
  animationPhase: 'entering' | 'exiting' | null
  fps?: number
}

export default function OverlayAssetRenderer({ asset, animationPhase, fps = 30 }: Props) {
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

  const assetOpacity = asset.opacity ?? 1

  if (asset.asset_type === 'scene' && asset.scene_config) {
    const elements = asset.scene_config.elements || []
    return (
      <div
        ref={wrapperRef}
        className="absolute"
        style={{
          left: asset.canvas_x,
          top: asset.canvas_y,
          width: asset.canvas_width,
          height: asset.canvas_height,
          zIndex: asset.layer,
          opacity: assetOpacity,
        }}
      >
        <div
          className="relative w-full h-full"
          style={{
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
          left: asset.canvas_x,
          top: asset.canvas_y,
          width: asset.canvas_width,
          height: asset.canvas_height,
          zIndex: asset.layer,
          opacity: assetOpacity,
        }}
      >
        <img src={asset.storage_path} alt={asset.name} className="w-full h-full object-contain" />
      </div>
    )
  }

  if (asset.asset_type === 'video' && asset.storage_path) {
    return (
      <div
        ref={wrapperRef}
        className="absolute"
        style={{
          left: asset.canvas_x,
          top: asset.canvas_y,
          width: asset.canvas_width,
          height: asset.canvas_height,
          zIndex: asset.layer,
          opacity: assetOpacity,
        }}
      >
        <video
          src={asset.storage_path}
          autoPlay
          preload="auto"
          className="w-full h-full object-contain"
        />
      </div>
    )
  }

  return null
}
