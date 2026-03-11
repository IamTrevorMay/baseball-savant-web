'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { TransitionConfig } from '@/lib/broadcastTypes'
import { generateCSSAnimation, injectKeyframes, removeKeyframes } from '@/lib/overlayAnimationEngine'

interface StingerPlayerProps {
  videoUrl: string
  cutPoint: number // 0-1, fraction of duration
  onCutPoint: () => void
  onComplete: () => void
  enterTransition?: TransitionConfig | null
  exitTransition?: TransitionConfig | null
}

export default function StingerPlayer({ videoUrl, cutPoint, onCutPoint, onComplete, enterTransition, exitTransition }: StingerPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const cutFiredRef = useRef(false)
  const [loaded, setLoaded] = useState(false)
  const [exiting, setExiting] = useState(false)
  const enterStyleRef = useRef<HTMLStyleElement | null>(null)
  const exitStyleRef = useRef<HTMLStyleElement | null>(null)

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video || cutFiredRef.current) return

    const progress = video.currentTime / (video.duration || 1)
    if (progress >= cutPoint) {
      cutFiredRef.current = true
      onCutPoint()
    }
  }, [cutPoint, onCutPoint])

  const handleEnded = useCallback(() => {
    if (exitTransition && wrapperRef.current) {
      // Apply exit animation, then fire onComplete
      setExiting(true)
      const result = generateCSSAnimation(
        exitTransition,
        'exit',
        1920, 1080, 0, 0, 30,
      )
      if (result) {
        if (exitStyleRef.current) removeKeyframes(exitStyleRef.current)
        exitStyleRef.current = injectKeyframes(result.keyframes)
        wrapperRef.current.style.animation = result.animation

        const match = result.animation.match(/(\d+)ms/)
        const durationMs = match ? parseInt(match[1]) : 500
        setTimeout(() => {
          onComplete()
        }, durationMs)
      } else {
        onComplete()
      }
    } else {
      onComplete()
    }
  }, [exitTransition, onComplete])

  // Apply enter animation on mount
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    cutFiredRef.current = false
    video.play().catch(console.error)

    if (enterTransition && wrapperRef.current) {
      const result = generateCSSAnimation(
        enterTransition,
        'enter',
        1920, 1080, 0, 0, 30,
      )
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
        onTimeUpdate={handleTimeUpdate}
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
