'use client'

import { useState, useEffect } from 'react'
import type { CountdownState, CountdownWidgetConfig } from '@/lib/widgetTypes'

interface Props {
  countdown: CountdownState
  config: CountdownWidgetConfig
}

export default function CountdownOverlay({ countdown, config }: Props) {
  const [displayRemaining, setDisplayRemaining] = useState(countdown.remaining)

  useEffect(() => {
    if (!countdown.running || !countdown.startedAt) {
      setDisplayRemaining(countdown.remaining)
      return
    }

    function tick() {
      setDisplayRemaining(Math.max(0, countdown.remaining))
    }
    tick()

    const interval = setInterval(() => {
      setDisplayRemaining(prev => Math.max(0, prev - 1))
    }, 1000)

    return () => clearInterval(interval)
  }, [countdown.running, countdown.startedAt, countdown.remaining])

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

  // Scale font size relative to widget — NodeCG uses 320px for a 633px wide container
  const fontSize = config.fontSize || 64

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'transparent',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {config.showLabel && config.label && (
        <div style={{
          fontSize: Math.round(fontSize * 0.2),
          color: 'rgba(255,255,255,0.5)',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 4,
          fontFamily: 'Trispace, sans-serif',
          fontWeight: 300,
        }}>
          {config.label}
        </div>
      )}
      <div style={{
        fontSize,
        fontFamily: "'Univers LT Std 59 Ultra Condensed', 'Arial Narrow', sans-serif",
        color: config.fontColor || '#FFFFFF',
        textShadow: '-4px -4px 4px #FF8200, 4px 4px 4px #01E2FA',
        textAlign: 'center',
        letterSpacing: 4,
        lineHeight: 1,
      }}>
        {timeStr}
      </div>
    </div>
  )
}
