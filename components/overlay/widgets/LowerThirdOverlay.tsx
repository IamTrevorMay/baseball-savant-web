'use client'

import { useState, useEffect, useRef } from 'react'
import type { LowerThirdMessage, LowerThirdWidgetConfig, Topic } from '@/lib/widgetTypes'

interface Props {
  message: LowerThirdMessage | null
  visible: boolean
  config: LowerThirdWidgetConfig
  width: number
  height: number
  topic?: Topic | null
}

const providerStyles: Record<string, { color: string; textShadow: string }> = {
  youtube: {
    color: '#C90003',
    textShadow: '-1px 0 1px rgba(255, 98, 0, 0.50), 1px 0 1px #C9008D',
  },
  twitch: {
    color: '#7800C9',
    textShadow: '-1px 0 1px rgba(255, 0, 25, 0.50), 1px 0 1px #2C00C9',
  },
}

export default function LowerThirdOverlay({ message, visible, config, width, height, topic }: Props) {
  const [show, setShow] = useState(false)
  const [contentOpacity, setContentOpacity] = useState(0)
  const [contentHeight, setContentHeight] = useState(0)

  useEffect(() => {
    if (visible && message) {
      // Animate in: expand height then fade in
      requestAnimationFrame(() => {
        setShow(true)
        setContentHeight(height)
        setTimeout(() => setContentOpacity(1), 500)
      })
    } else {
      // Animate out: fade out then collapse
      setContentOpacity(0)
      setTimeout(() => {
        setContentHeight(0)
        setTimeout(() => setShow(false), 500)
      }, 500)
    }
  }, [visible, message, height])

  useEffect(() => {
    if (message?.expiresAt) {
      const remaining = message.expiresAt - Date.now()
      if (remaining > 0) {
        const timer = setTimeout(() => {
          setContentOpacity(0)
          setTimeout(() => {
            setContentHeight(0)
            setTimeout(() => setShow(false), 500)
          }, 500)
        }, remaining)
        return () => clearTimeout(timer)
      }
    }
  }, [message?.expiresAt])

  const styles = message ? (providerStyles[message.provider] || { color: '#373737', textShadow: 'none' }) : { color: '#373737', textShadow: 'none' }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          transform: show ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Logo panel — left section */}
        <div style={{
          width: 180,
          backgroundColor: 'rgb(9 9 9 / 0.6)',
          display: 'grid',
          placeItems: 'center',
          position: 'relative',
          zIndex: 2,
          flexShrink: 0,
          border: '2px solid rgba(255,255,255,0.08)',
        }}>
          {config.logoUrl ? (
            <img src={config.logoUrl} alt="" style={{ maxWidth: '70%', maxHeight: '70%', objectFit: 'contain' }} />
          ) : (
            <div style={{ width: 60, height: 60, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)' }} />
          )}
        </div>

        {/* Topic section — middle, shows current topic if set */}
        {topic && (
          <div style={{
            backgroundColor: 'rgb(9 9 9 / 0.6)',
            padding: 9,
            marginLeft: -2,
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            border: '2px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{
              backgroundColor: '#FF8200',
              boxShadow: 'inset 0 0 15px -2px rgb(0 0 0 / 0.5)',
              color: '#000000',
              fontFamily: 'Trispace, sans-serif',
              fontSize: 28,
              padding: '11px 30px',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>
              {topic.body || topic.header}
            </div>
          </div>
        )}

        {/* Message section — right, visible when chat message highlighted */}
        {message && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            marginLeft: -2,
            position: 'relative',
            zIndex: 0,
            opacity: contentOpacity,
            transition: 'opacity 0.5s ease',
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: 176,
              padding: '19px 19px 19px 10px',
            }}>
              {/* Provider badge + username row */}
              <div style={{ display: 'flex', height: 43 }}>
                {/* [MSG RCVD] badge */}
                <div style={{
                  alignContent: 'center',
                  color: styles.color,
                  display: 'grid',
                  padding: '0 12px',
                  position: 'relative',
                  textShadow: styles.textShadow,
                  textTransform: 'uppercase',
                  zIndex: 1,
                  fontFamily: 'Trispace, sans-serif',
                  fontSize: 14,
                  fontWeight: 500,
                  backgroundColor: 'rgb(9 9 9 / 0.6)',
                  border: '2px solid rgba(255,255,255,0.08)',
                }}>
                  [MSG RCVD]
                </div>
                {/* Username */}
                <div style={{
                  alignContent: 'center',
                  backgroundColor: styles.color,
                  display: 'grid',
                  padding: '0 20px',
                  textTransform: 'uppercase',
                  fontFamily: 'Trispace, sans-serif',
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#FFFFFF',
                }}>
                  {message.displayName}
                </div>
              </div>

              {/* Message content area */}
              <div style={{
                display: 'grid',
                flex: 1,
                marginTop: -2,
                padding: 5,
                backgroundColor: 'rgb(9 9 9 / 0.6)',
                border: '2px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{
                  alignContent: 'center',
                  display: 'grid',
                  backgroundColor: '#FFDDDD',
                  boxShadow: 'inset 0 0 16px 0 rgb(0 0 0 / 0.7)',
                  color: '#000000',
                  fontFamily: 'Trispace, sans-serif',
                  fontSize: 26,
                  padding: '20px 41px',
                }}>
                  {message.content.map((part, i) =>
                    part.type === 'text' ? (
                      <span key={i}>{part.text}</span>
                    ) : (
                      <img key={i} src={part.url} alt="" style={{ display: 'inline', height: '1.4em', verticalAlign: 'middle', margin: '0 3px' }} />
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
