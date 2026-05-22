'use client'

import type { StatLineData, PanelPosition } from '@/lib/producerTypes'

interface Props {
  data: StatLineData
  position: PanelPosition
}

function formatValue(v: number | string): string {
  if (typeof v === 'string') return v
  if (Number.isInteger(v)) return String(v)
  // Format percentages (values like 28.3)
  if (v > 1 && v < 100) return v.toFixed(1)
  // Format averages (values like 0.283)
  if (v >= 0 && v < 1) return v.toFixed(3).replace(/^0/, '')
  return v.toFixed(1)
}

export default function StatLineRenderer({ data, position }: Props) {
  const isLower = position === 'lower-bar'
  const entries = Object.entries(data.stats)
  const headshotUrl = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${data.playerId}/headshot/67/current`

  if (isLower) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, width: '100%' }}>
        {/* Headshot */}
        <img
          src={headshotUrl}
          alt=""
          style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid #3f3f46' }}
        />
        {/* Name */}
        <div style={{ minWidth: 180 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#e4e4e7', lineHeight: 1.1 }}>
            {data.playerName}
          </div>
          {data.team && (
            <div style={{ fontSize: 12, color: '#71717a', marginTop: 2 }}>{data.team}</div>
          )}
        </div>
        {/* Stats */}
        <div style={{ display: 'flex', gap: 0, flex: 1 }}>
          {entries.map(([key, val]) => (
            <div
              key={key}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '0 12px',
                borderLeft: '1px solid rgba(63,63,70,0.4)',
              }}
            >
              <div style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {data.metricLabels[key] || key}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#e4e4e7', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                {formatValue(val)}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Right panel: vertical layout
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <img
          src={headshotUrl}
          alt=""
          style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid #3f3f46' }}
        />
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#e4e4e7', lineHeight: 1.1 }}>
            {data.playerName}
          </div>
          {data.team && (
            <div style={{ fontSize: 12, color: '#71717a', marginTop: 2 }}>{data.team}</div>
          )}
        </div>
      </div>
      {/* Stat rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {entries.map(([key, val]) => (
          <div
            key={key}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: '1px solid rgba(63,63,70,0.3)',
            }}
          >
            <span style={{ fontSize: 13, color: '#a1a1aa' }}>
              {data.metricLabels[key] || key}
            </span>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#e4e4e7', fontVariantNumeric: 'tabular-nums' }}>
              {formatValue(val)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
