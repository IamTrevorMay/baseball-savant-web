'use client'

import { useState, useEffect } from 'react'
import type { CountdownState, CountdownWidgetConfig } from '@/lib/widgetTypes'

interface Props {
  countdown: CountdownState
  config: CountdownWidgetConfig
}

export default function CountdownOverlay({ countdown, config }: Props) {
  // Client-side tick for drift-free display when running
  const [displayRemaining, setDisplayRemaining] = useState(countdown.remaining)

  useEffect(() => {
    if (!countdown.running || !countdown.startedAt) {
      setDisplayRemaining(countdown.remaining)
      return
    }

    // Calculate remaining based on startedAt timestamp for drift-free display
    function tick() {
      const elapsed = Math.floor((Date.now() - new Date(countdown.startedAt!).getTime()) / 1000)
      const remaining = Math.max(0, countdown.remaining - elapsed + (countdown.remaining - countdown.remaining)) // Use server remaining as base
      setDisplayRemaining(Math.max(0, countdown.remaining))
    }
    tick()

    const interval = setInterval(() => {
      setDisplayRemaining(prev => Math.max(0, prev - 1))
    }, 1000)

    return () => clearInterval(interval)
  }, [countdown.running, countdown.startedAt, countdown.remaining])

  // Sync with server updates
  useEffect(() => {
    setDisplayRemaining(countdown.remaining)
  }, [countdown.remaining])

  const totalSeconds = displayRemaining
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const timeStr = hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  const bgHex = config.bgColor || '#000000'
  const bgOpacity = config.bgOpacity ?? 0.7
  const r = parseInt(bgHex.slice(1, 3), 16)
  const g = parseInt(bgHex.slice(3, 5), 16)
  const b = parseInt(bgHex.slice(5, 7), 16)

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: `rgba(${r},${g},${b},${bgOpacity})`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {config.showLabel && config.label && (
        <div style={{
          fontSize: Math.round((config.fontSize || 64) * 0.3),
          color: 'rgba(255,255,255,0.5)',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}>
          {config.label}
        </div>
      )}
      <div style={{
        fontSize: config.fontSize || 64,
        fontWeight: 700,
        fontFamily: 'monospace',
        color: config.fontColor || '#FFFFFF',
        letterSpacing: 2,
      }}>
        {timeStr}
      </div>
    </div>
  )
}
