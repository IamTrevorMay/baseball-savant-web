'use client'

import type { Notification, NotificationsWidgetConfig } from '@/lib/widgetTypes'

interface Props {
  notifications: Notification[]
  config: NotificationsWidgetConfig
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'cheer': return '#88F4FF'
    case 'sub': case 'resub': case 'giftsub': return '#FF8200'
    case 'superchat': case 'membership': return '#00FF11'
    default: return '#FFFFFF'
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case 'cheer': return 'CHEER'
    case 'sub': return 'NEW SUB'
    case 'resub': return 'RESUB'
    case 'giftsub': return 'GIFT SUB'
    case 'superchat': return 'SUPER CHAT'
    case 'membership': return 'MEMBER'
    default: return type.toUpperCase()
  }
}

export default function NotificationFeedOverlay({ notifications, config }: Props) {
  const maxVisible = config.maxVisible || 10
  const visible = notifications.slice(-maxVisible)
  const fontSize = config.fontSize || 13

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'transparent',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      padding: 8,
      overflow: 'hidden',
    }}>
      {visible.map(n => {
        const color = getTypeColor(n.type)
        return (
          <div
            key={n.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 0',
              fontSize,
              animation: 'notifIn 0.4s ease-out',
            }}
          >
            {/* Color bar — 5px wide like NodeCG chat borders */}
            <div style={{ width: 5, height: 20, backgroundColor: color, flexShrink: 0 }} />
            <span style={{
              color,
              fontWeight: 700,
              fontSize: fontSize * 0.8,
              letterSpacing: 1,
              fontFamily: 'Trispace, sans-serif',
              textTransform: 'uppercase',
            }}>
              {getTypeLabel(n.type)}
            </span>
            <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{n.displayName}</span>
            {n.amount && <span style={{ color: '#88F4FF', fontSize: fontSize * 0.9 }}>{n.amount}</span>}
            {n.months && n.months > 1 && <span style={{ color: '#FF8200', fontSize: fontSize * 0.9 }}>{n.months} months</span>}
          </div>
        )
      })}
      <style>{`
        @keyframes notifIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
