'use client'

import type { UsernameStackWidgetConfig } from '@/lib/widgetTypes'

interface Props {
  usernames: string[]
  config: UsernameStackWidgetConfig
}

export default function UsernameStackOverlay({ usernames, config }: Props) {
  const maxVisible = config.maxVisible || 22
  const fontSize = config.fontSize || 14

  // Pad to maxVisible slots (like NodeCG's Array.from({ length: 22 }))
  const items = Array.from({ length: maxVisible }, (_, i) => usernames[i] ?? null)

  // Center index for opacity gradient — most recent names are at the end
  const centerIndex = Math.floor(maxVisible / 3)

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'transparent',
      display: 'flex',
      flexDirection: 'column-reverse',
      gap: 9,
      padding: '10px 0 5px',
      overflow: 'hidden',
      color: '#000000',
      fontSize,
      textTransform: 'uppercase',
    }}>
      {items.map((username, index) => {
        const hasUser = username !== null
        const opacityFade = 1 - (0.05 * Math.abs(index - centerIndex))

        return (
          <div
            key={index}
            style={{
              alignItems: 'center',
              backgroundColor: `rgb(${hasUser ? '255 130 0' : '66 66 66'} / ${Math.max(0.1, opacityFade)})`,
              boxShadow: 'inset 0 0 14px -2px rgb(0 0 0 / 0.5)',
              display: 'grid',
              flex: 1,
              padding: '0 8px',
              animation: hasUser ? 'usernameIn 0.3s ease-out' : undefined,
            }}
          >
            <div style={{
              overflow: 'hidden',
              textAlign: 'center',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {username || ''}
            </div>
          </div>
        )
      })}
      <style>{`
        @keyframes usernameIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
