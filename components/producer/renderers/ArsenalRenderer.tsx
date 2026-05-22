'use client'

import type { ArsenalData, PanelPosition } from '@/lib/producerTypes'
import { getPitchColor, PITCH_CODE_NAMES } from '@/components/chartConfig'

interface Props {
  data: ArsenalData
  position: PanelPosition
}

export default function ArsenalRenderer({ data, position }: Props) {
  const isLower = position === 'lower-bar'
  const pitches = data.pitches.sort((a, b) => b.usage_pct - a.usage_pct)

  if (isLower) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, width: '100%' }}>
        <div style={{ minWidth: 140 }}>
          <div style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Arsenal</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e4e4e7' }}>{data.playerName}</div>
        </div>
        <div style={{ display: 'flex', gap: 0, flex: 1 }}>
          {pitches.slice(0, 6).map(p => (
            <div
              key={p.pitch_type}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '0 6px',
                borderLeft: `2px solid ${getPitchColor(p.pitch_type)}`,
              }}
            >
              <div style={{ fontSize: 10, color: getPitchColor(p.pitch_type), fontWeight: 600 }}>
                {PITCH_CODE_NAMES[p.pitch_type] || p.pitch_name}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#e4e4e7', fontVariantNumeric: 'tabular-nums' }}>
                {p.avg_velo.toFixed(1)}
              </div>
              <div style={{ fontSize: 9, color: '#71717a' }}>
                {p.usage_pct.toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Right panel: full table
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Arsenal</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#e4e4e7' }}>{data.playerName}</div>
      </div>
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '3px 1fr 56px 52px 52px 44px',
        gap: 8,
        padding: '6px 0',
        borderBottom: '1px solid rgba(63,63,70,0.5)',
      }}>
        <div />
        <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase' }}>Pitch</div>
        <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase', textAlign: 'right' }}>Velo</div>
        <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase', textAlign: 'right' }}>IVB</div>
        <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase', textAlign: 'right' }}>HB</div>
        <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase', textAlign: 'right' }}>Use%</div>
      </div>
      {pitches.map(p => (
        <div
          key={p.pitch_type}
          style={{
            display: 'grid',
            gridTemplateColumns: '3px 1fr 56px 52px 52px 44px',
            gap: 8,
            padding: '8px 0',
            borderBottom: '1px solid rgba(63,63,70,0.15)',
            alignItems: 'center',
          }}
        >
          <div style={{ width: 3, height: 20, borderRadius: 2, background: getPitchColor(p.pitch_type) }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7' }}>
            {PITCH_CODE_NAMES[p.pitch_type] || p.pitch_name}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e4e4e7', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {p.avg_velo.toFixed(1)}
          </div>
          <div style={{ fontSize: 13, color: '#a1a1aa', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {p.ivb.toFixed(1)}
          </div>
          <div style={{ fontSize: 13, color: '#a1a1aa', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {p.hb.toFixed(1)}
          </div>
          <div style={{ fontSize: 13, color: '#71717a', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {p.usage_pct.toFixed(0)}%
          </div>
        </div>
      ))}
    </div>
  )
}
