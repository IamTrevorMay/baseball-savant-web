'use client'

import { useRef, useEffect } from 'react'
import type { ChatMessage, ChatWidgetConfig } from '@/lib/widgetTypes'

interface Props {
  messages: ChatMessage[]
  config: ChatWidgetConfig
  width: number
  height: number
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'cheer': return '#88F4FF'
    case 'sub': case 'resub': case 'giftsub': return '#FF8200'
    case 'superchat': case 'membership': return '#00FF11'
    default: return 'transparent'
  }
}

export default function ChatOverlay({ messages, config, width, height }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const maxVisible = config.maxVisibleMessages || 15
  const visibleMessages = messages.slice(-maxVisible)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  const bgHex = config.bgColor || '#000000'
  const bgOpacity = config.bgOpacity ?? 0.6
  const r = parseInt(bgHex.slice(1, 3), 16)
  const g = parseInt(bgHex.slice(3, 5), 16)
  const b = parseInt(bgHex.slice(5, 7), 16)

  return (
    <div
      ref={scrollRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: `rgba(${r},${g},${b},${bgOpacity})`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: 8,
      }}
    >
      {visibleMessages.map(msg => {
        const typeColor = getTypeColor(msg.type)
        return (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              padding: '3px 0',
              fontSize: config.fontSize || 14,
              lineHeight: 1.3,
              animation: 'chatLineIn 0.3s ease-out',
            }}
          >
            {typeColor !== 'transparent' && (
              <div style={{ width: 3, minHeight: 16, borderRadius: 2, backgroundColor: typeColor, flexShrink: 0, marginTop: 2 }} />
            )}
            <span style={{ color: msg.color, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {msg.displayName}
            </span>
            <span style={{ color: '#d4d4d8' }}>
              {msg.content.map((part, i) =>
                part.type === 'text' ? (
                  <span key={i}>{part.text}</span>
                ) : (
                  <img key={i} src={part.url} alt="" style={{ display: 'inline', height: '1.2em', verticalAlign: 'middle', margin: '0 2px' }} />
                )
              )}
            </span>
          </div>
        )
      })}
      <style>{`
        @keyframes chatLineIn {
          from { opacity: 0; transform: translateY(8px); max-height: 0; }
          to { opacity: 1; transform: translateY(0); max-height: 100px; }
        }
      `}</style>
    </div>
  )
}
