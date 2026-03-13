'use client'

import { useState, useEffect } from 'react'
import type { LowerThirdMessage, LowerThirdWidgetConfig } from '@/lib/widgetTypes'

interface Props {
  message: LowerThirdMessage | null
  visible: boolean
  config: LowerThirdWidgetConfig
  width: number
  height: number
}

export default function LowerThirdOverlay({ message, visible, config, width, height }: Props) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (visible && message) {
      // Small delay to trigger CSS animation
      requestAnimationFrame(() => setShow(true))
    } else {
      setShow(false)
    }
  }, [visible, message])

  // Auto-clear safety net
  useEffect(() => {
    if (message?.expiresAt) {
      const remaining = message.expiresAt - Date.now()
      if (remaining > 0) {
        const timer = setTimeout(() => setShow(false), remaining)
        return () => clearTimeout(timer)
      }
    }
  }, [message?.expiresAt])

  const accentColor = config.accentColor || '#06b6d4'
  const bgColor = config.bgColor || '#18181b'

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '100%',
          display: 'flex',
          transform: show ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Logo/accent panel */}
        <div style={{
          width: height,
          height: '100%',
          backgroundColor: accentColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {config.logoUrl ? (
            <img src={config.logoUrl} alt="" style={{ maxWidth: '70%', maxHeight: '70%', objectFit: 'contain' }} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)' }} />
          )}
        </div>

        {/* Content area */}
        <div style={{
          flex: 1,
          backgroundColor: bgColor,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '12px 24px',
          borderLeft: `3px solid ${accentColor}`,
        }}>
          {message ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: message.color }}>
                  {message.displayName}
                </span>
                <span style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.4)',
                  letterSpacing: 1,
                }}>
                  {message.provider}
                </span>
              </div>
              <div style={{ fontSize: 16, color: '#d4d4d8', lineHeight: 1.4 }}>
                {message.content.map((part, i) =>
                  part.type === 'text' ? (
                    <span key={i}>{part.text}</span>
                  ) : (
                    <img key={i} src={part.url} alt="" style={{ display: 'inline', height: '1.4em', verticalAlign: 'middle', margin: '0 3px' }} />
                  )
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }}>
              Lower Third
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
