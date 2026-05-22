'use client'

import type { LeaderboardData, PanelPosition } from '@/lib/producerTypes'

interface Props {
  data: LeaderboardData
  position: PanelPosition
}

function formatValue(v: number | string): string {
  if (typeof v === 'string') return v
  if (Number.isInteger(v)) return String(v)
  if (v >= 0 && v < 1) return v.toFixed(3).replace(/^0/, '')
  return v.toFixed(1)
}

export default function LeaderboardRenderer({ data, position }: Props) {
  const isLower = position === 'lower-bar'

  if (isLower) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, width: '100%' }}>
        <div style={{ minWidth: 200 }}>
          <div style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {data.season} Leaders
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e4e4e7' }}>
            {data.metricLabel}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0, flex: 1 }}>
          {data.entries.slice(0, 7).map((entry) => (
            <div
              key={entry.player_id}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '0 8px',
                borderLeft: '1px solid rgba(63,63,70,0.4)',
              }}
            >
              <div style={{ fontSize: 11, color: '#71717a' }}>
                #{entry.rank}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.player_name.split(',')[0] || entry.player_name}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981', fontVariantNumeric: 'tabular-nums' }}>
                {formatValue(entry.primary_value)}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Right panel
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {data.season} Leaders
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#e4e4e7' }}>
          {data.metricLabel}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {data.entries.map((entry) => {
          const maxVal = Math.max(...data.entries.map(e => Number(e.primary_value) || 0))
          const barPct = maxVal > 0 ? (Number(entry.primary_value) / maxVal) * 100 : 0

          return (
            <div
              key={entry.player_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid rgba(63,63,70,0.2)',
                gap: 12,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: '#71717a', width: 28, textAlign: 'right' }}>
                {entry.rank}
              </span>
              <div style={{ flex: 1, position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${barPct}%`,
                    background: 'rgba(16,185,129,0.1)',
                    borderRadius: 4,
                  }}
                />
                <div style={{ position: 'relative', fontSize: 14, fontWeight: 600, color: '#e4e4e7', padding: '2px 8px' }}>
                  {entry.player_name}
                </div>
              </div>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#10b981', fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'right' }}>
                {formatValue(entry.primary_value)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
