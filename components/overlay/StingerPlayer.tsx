'use client'

import { useRef, useEffect, useCallback, useState } from 'react'

interface StingerPlayerProps {
  videoUrl: string
  cutPoint: number // 0-1, fraction of duration
  onCutPoint: () => void
  onComplete: () => void
}

export default function StingerPlayer({ videoUrl, cutPoint, onCutPoint, onComplete }: StingerPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const cutFiredRef = useRef(false)
  const [loaded, setLoaded] = useState(false)

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
    onComplete()
  }, [onComplete])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    cutFiredRef.current = false
    video.play().catch(console.error)
  }, [videoUrl])

  return (
    <div
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
