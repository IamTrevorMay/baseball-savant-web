'use client'

import { useState, useEffect, useRef } from 'react'
import type { Topic, TopicWidgetConfig } from '@/lib/widgetTypes'

interface Props {
  topics: Topic[]
  activeIndex: number
  config: TopicWidgetConfig
  width: number
  height: number
}

export default function TopicOverlay({ topics, activeIndex, config, width, height }: Props) {
  const [displayTopic, setDisplayTopic] = useState<Topic | null>(null)
  const [animating, setAnimating] = useState(false)
  const prevIndexRef = useRef(activeIndex)

  useEffect(() => {
    if (activeIndex === prevIndexRef.current && displayTopic) return
    prevIndexRef.current = activeIndex

    if (activeIndex < 0 || activeIndex >= topics.length) {
      // Fade out
      setAnimating(true)
      setTimeout(() => {
        setDisplayTopic(null)
        setAnimating(false)
      }, 400)
      return
    }

    const newTopic = topics[activeIndex]
    if (displayTopic) {
      // Transition: fade out then fade in
      setAnimating(true)
      setTimeout(() => {
        setDisplayTopic(newTopic)
        setAnimating(false)
      }, 400)
    } else {
      setDisplayTopic(newTopic)
    }
  }, [activeIndex, topics])

  const bgHex = config.bgColor || '#000000'
  const bgOpacity = config.bgOpacity ?? 0.8
  const r = parseInt(bgHex.slice(1, 3), 16)
  const g = parseInt(bgHex.slice(3, 5), 16)
  const b = parseInt(bgHex.slice(5, 7), 16)

  if (!displayTopic) return null

  const isBreaking = displayTopic.variant === 'breakingNews'
  const accentColor = isBreaking ? (config.breakingNewsColor || '#f97316') : (config.accentColor || '#06b6d4')
  const glowColor = isBreaking ? 'rgba(249, 115, 22, 0.3)' : 'rgba(6, 182, 212, 0.3)'

  // Auto-scale text — fit header within available space
  const headerSize = Math.min(config.fontSize || 32, height * 0.35)
  const bodySize = Math.round(headerSize * 0.5)

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: `rgba(${r},${g},${b},${bgOpacity})`,
      borderLeft: `4px solid ${accentColor}`,
      boxShadow: `0 0 20px ${glowColor}, inset 0 0 20px ${glowColor}`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '12px 24px',
      opacity: animating ? 0 : 1,
      transition: 'opacity 0.4s ease',
    }}>
      {isBreaking && (
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 3,
          color: accentColor,
          marginBottom: 4,
          animation: 'breakingPulse 1s ease-in-out infinite',
        }}>
          BREAKING NEWS
        </div>
      )}
      <div style={{
        fontSize: headerSize,
        fontWeight: 700,
        color: '#FFFFFF',
        lineHeight: 1.2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {displayTopic.header}
      </div>
      {displayTopic.body && (
        <div style={{
          fontSize: bodySize,
          color: 'rgba(255,255,255,0.7)',
          lineHeight: 1.3,
          marginTop: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {displayTopic.body}
        </div>
      )}
      <style>{`
        @keyframes breakingPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
