'use client'

import type { CustomTextData, PanelPosition } from '@/lib/producerTypes'

interface Props {
  data: CustomTextData
  position: PanelPosition
}

export default function CustomTextRenderer({ data, position }: Props) {
  const isLower = position === 'lower-bar'

  if (isLower) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 32, width: '100%' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#e4e4e7', lineHeight: 1.2 }}>
            {data.headline}
          </div>
          {data.subline && (
            <div style={{ fontSize: 16, color: '#a1a1aa', marginTop: 4 }}>
              {data.subline}
            </div>
          )}
        </div>
        {data.body && (
          <div style={{ fontSize: 14, color: '#a1a1aa', maxWidth: 600 }}>
            {data.body}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#e4e4e7', lineHeight: 1.2 }}>
        {data.headline}
      </div>
      {data.subline && (
        <div style={{ fontSize: 15, color: '#10b981', fontWeight: 500 }}>
          {data.subline}
        </div>
      )}
      {data.body && (
        <div style={{ fontSize: 14, color: '#a1a1aa', lineHeight: 1.6, marginTop: 8 }}>
          {data.body}
        </div>
      )}
    </div>
  )
}
