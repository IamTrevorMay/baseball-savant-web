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

  const bgHex = config.bgColor || '#000000'
  const bgOpacity = config.bgOpacity ?? 0.6
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
              gap: 6,
              padding: '4px 0',
              fontSize,
              animation: 'notifIn 0.3s ease-out',
            }}
          >
            <div style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: color, flexShrink: 0 }} />
            <span style={{ color, fontWeight: 700, fontSize: fontSize * 0.8, letterSpacing: 1 }}>
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
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
