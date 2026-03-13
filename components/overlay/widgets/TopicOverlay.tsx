'use client'

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import type { Topic, TopicWidgetConfig } from '@/lib/widgetTypes'

interface Props {
  topics: Topic[]
  activeIndex: number
  config: TopicWidgetConfig
  width: number
  height: number
}

const variantStyles = {
  default: {
    backgroundColor: 'rgb(8 227 250 / 0.05)',
    textShadow: '0 0 18px rgb(1 226 250 / 0.75)',
    color: '#01E2FA',
  },
  breakingNews: {
    backgroundColor: 'rgb(250 51 1 / 0.15)',
    textShadow: '0 0 18px rgb(250 1 1 / 0.75)',
    color: '#FFA372',
  },
}

function AutoTextSize({ maxFontSize, minFontSize, children }: { maxFontSize: number; minFontSize: number; children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const target = wrapperRef.current
    if (!target) return
    const parent = target.parentElement
    if (!parent) return

    const resize = () => {
      let fontSize = maxFontSize
      while (fontSize >= minFontSize) {
        target.style.fontSize = `${fontSize}px`
        const computed = getComputedStyle(parent)
        const padding = parseInt(computed.paddingBottom) + parseInt(computed.paddingTop)
        if (target.clientHeight <= parent.clientHeight - padding) break
        fontSize -= 1
      }
    }

    const observer = new MutationObserver(() => resize())
    observer.observe(parent, { childList: true })
    resize()

    return () => observer.disconnect()
  }, [maxFontSize, minFontSize, children])

  return <div ref={wrapperRef}>{children}</div>
}

export default function TopicOverlay({ topics, activeIndex, config, width, height }: Props) {
  const [displayTopic, setDisplayTopic] = useState<Topic | null>(null)
  const [animating, setAnimating] = useState(false)
  const prevIndexRef = useRef(activeIndex)

  useEffect(() => {
    if (activeIndex === prevIndexRef.current && displayTopic) return
    prevIndexRef.current = activeIndex

    if (activeIndex < 0 || activeIndex >= topics.length) {
      setAnimating(true)
      setTimeout(() => {
        setDisplayTopic(null)
        setAnimating(false)
      }, 400)
      return
    }

    const newTopic = topics[activeIndex]
    if (displayTopic) {
      setAnimating(true)
      setTimeout(() => {
        setDisplayTopic(newTopic)
        setAnimating(false)
      }, 400)
    } else {
      setDisplayTopic(newTopic)
    }
  }, [activeIndex, topics])

  if (!displayTopic) return null

  const variant = displayTopic.variant || 'default'
  const styles = variantStyles[variant] || variantStyles.default

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Trispace, sans-serif',
      overflow: 'hidden',
      textTransform: 'uppercase',
      backgroundColor: styles.backgroundColor,
      textShadow: styles.textShadow,
      color: styles.color,
      opacity: animating ? 0 : 1,
      transition: 'opacity 0.4s ease',
    }}>
      {/* Index label + breaking news header */}
      <div style={{
        fontSize: 20,
        padding: '11px 18px',
        ...styles,
      }}>
        [{activeIndex}] {variant === 'breakingNews' && displayTopic.header}
      </div>

      {/* Body text with auto-sizing */}
      <div style={{
        alignItems: 'center',
        display: 'grid',
        flex: 1,
        overflow: 'hidden',
        padding: '20px 40px',
      }}>
        <AutoTextSize maxFontSize={config.fontSize || 40} minFontSize={0}>
          {displayTopic.body}
        </AutoTextSize>
      </div>

      <style>{`
        @keyframes breakingPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
