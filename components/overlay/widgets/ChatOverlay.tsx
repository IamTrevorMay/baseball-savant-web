'use client'

import { useRef, useEffect } from 'react'
import type { ChatMessage, ChatWidgetConfig } from '@/lib/widgetTypes'

interface Props {
  messages: ChatMessage[]
  config: ChatWidgetConfig
  width: number
  height: number
}

function getTypeColor(type: string): string | null {
  switch (type) {
    case 'cheer': return '#88F4FF'
    case 'sub': case 'resub': case 'giftsub': return '#FF8200'
    case 'superchat': case 'membership': return '#00FF11'
    default: return null
  }
}

function getTypeHeader(msg: ChatMessage): string | null {
  switch (msg.type) {
    case 'cheer': return `cheered ${msg.amount || ''} bits`
    case 'sub': return 'new sub'
    case 'resub': return `${msg.months || 1} month sub`
    case 'giftsub': return 'gift sub'
    case 'superchat': return `${msg.amount || ''} superchat`
    case 'membership': return 'new membership'
    default: return null
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
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

  const fontSize = config.fontSize || 14

  return (
    <div
      ref={scrollRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '5px 0',
      }}
    >
      {visibleMessages.map(msg => {
        const typeColor = getTypeColor(msg.type)
        const header = getTypeHeader(msg)
        const displayColor = typeColor || msg.color
        const { r, g, b } = hexToRgb(displayColor)

        return (
          <div
            key={msg.id}
            style={{
              flex: 'none',
              overflow: 'hidden',
              animation: 'chatLineIn 0.3s ease-out',
            }}
          >
            <div
              style={{
                backgroundColor: `rgba(${r},${g},${b},0.1)`,
                display: 'flex',
                marginTop: 1,
              }}
            >
              {/* Username — 175px, right-aligned, Milford Condensed */}
              <div style={{
                flex: 'none',
                fontFamily: "'Milford Condensed', 'Arial Narrow', sans-serif",
                overflow: 'hidden',
                padding: '8px 16px',
                textAlign: 'right',
                textOverflow: 'ellipsis',
                textShadow: '0px 2px 2px black',
                width: 175,
                color: displayColor,
                fontSize: fontSize + 2,
                whiteSpace: 'nowrap',
              }}>
                {msg.displayName}
              </div>

              {/* Color bar — 15px wide */}
              <div style={{
                backgroundColor: displayColor,
                flex: 'none',
                width: 15,
              }} />

              {/* Message content */}
              <div style={{
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
                gap: 13,
                padding: '10px 11px 10px 29px',
              }}>
                {header && (
                  <div style={{
                    backgroundColor: displayColor,
                    boxShadow: 'inset 0 0 10px 1px rgba(0, 0, 0, 0.5)',
                    color: 'black',
                    fontFamily: 'Trispace, sans-serif',
                    lineHeight: '34px',
                    margin: '-3px -13px',
                    padding: '0 13px',
                    textTransform: 'uppercase',
                    fontSize: fontSize,
                  }}>
                    {header}
                  </div>
                )}

                <div style={{
                  textShadow: '0px 2px 2px black',
                  color: '#FFFFFF',
                  fontFamily: "'Milford Condensed', 'Arial Narrow', sans-serif",
                  fontSize,
                  lineHeight: 1.4,
                }}>
                  {msg.content.map((part, i) =>
                    part.type === 'text' ? (
                      <span key={i}>{part.text}</span>
                    ) : (
                      <img key={i} src={part.url} alt="" style={{ display: 'inline', height: '1.4em', verticalAlign: 'middle', margin: '0 2px' }} />
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      <style>{`
        @keyframes chatLineIn {
          from { max-height: 0; opacity: 0; }
          to { max-height: 200px; opacity: 1; }
        }
      `}</style>
    </div>
  )
}
