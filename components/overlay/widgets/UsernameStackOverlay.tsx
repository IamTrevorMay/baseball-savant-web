'use client'

import type { UsernameStackWidgetConfig } from '@/lib/widgetTypes'

interface Props {
  usernames: string[]
  config: UsernameStackWidgetConfig
}

export default function UsernameStackOverlay({ usernames, config }: Props) {
  const maxVisible = config.maxVisible || 20
  const visible = usernames.slice(-maxVisible)
  const fontSize = config.fontSize || 13
  const title = config.title || 'Chat'

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
      padding: 8,
      overflow: 'hidden',
    }}>
      {title && (
        <div style={{
          fontSize: fontSize * 0.85,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase',
          letterSpacing: 2,
          marginBottom: 6,
          paddingBottom: 4,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          {title}
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        {visible.map((name, i) => (
          <div
            key={`${name}-${i}`}
            style={{
              fontSize,
              color: '#d4d4d8',
              padding: '2px 0',
              animation: 'usernameIn 0.3s ease-out',
            }}
          >
            {name}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes usernameIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
