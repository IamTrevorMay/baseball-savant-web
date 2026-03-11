'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { TransitionConfig } from '@/lib/broadcastTypes'
import { generateCSSAnimation, injectKeyframes, removeKeyframes } from '@/lib/overlayAnimationEngine'

interface StingerPlayerProps {
  videoUrl: string
  onStingerEnded: () => void   // fires when stinger video ends (asset should appear)
  onComplete: () => void       // fires after exit animation finishes (remove stinger)
  enterTransition?: TransitionConfig | null
}

export default function StingerPlayer({ videoUrl, onStingerEnded, onComplete, enterTransition }: StingerPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)
  const enterStyleRef = useRef<HTMLStyleElement | null>(null)
  const exitStyleRef = useRef<HTMLStyleElement | null>(null)

  // When stinger video ends: reveal asset, slide stinger left, then fire onComplete
  const handleEnded = useCallback(() => {
    // Tell parent the stinger finished — asset should now be revealed
    onStingerEnded()

    // Slide the stinger out to the left
    if (wrapperRef.current) {
      const slideLeft: TransitionConfig = { presetId: 'slide-out-left', durationFrames: 15 }
      const result = generateCSSAnimation(slideLeft, 'exit', 1920, 1080, 0, 0, 30)
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
  }, [onStingerEnded, onComplete])

  // Apply enter animation on mount, start playback
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.play().catch(console.error)

    if (enterTransition && wrapperRef.current) {
      const result = generateCSSAnimation(enterTransition, 'enter', 1920, 1080, 0, 0, 30)
      if (result) {
        enterStyleRef.current = injectKeyframes(result.keyframes)
        wrapperRef.current.style.animation = result.animation
      }
    }

    return () => {
      if (enterStyleRef.current) { removeKeyframes(enterStyleRef.current); enterStyleRef.current = null }
      if (exitStyleRef.current) { removeKeyframes(exitStyleRef.current); exitStyleRef.current = null }
    }
  }, [videoUrl, enterTransition])

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 99999,
        pointerEvents: 'none',
      }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        onLoadedData={() => setLoaded(true)}
        onEnded={handleEnded}
        autoPlay
        muted
        playsInline
        preload="auto"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: loaded ? 1 : 0,
        }}
      />
    </div>
  )
}
