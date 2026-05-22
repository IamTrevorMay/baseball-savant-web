'use client'

import type { StandingsData, PanelPosition } from '@/lib/producerTypes'

interface Props {
  data: StandingsData
  position: PanelPosition
}

export default function StandingsRenderer({ data, position }: Props) {
  const isLower = position === 'lower-bar'

  if (isLower) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, width: '100%' }}>
        <div style={{ minWidth: 120 }}>
          <div style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Standings
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#e4e4e7' }}>
            {data.division}
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', gap: 0 }}>
          {data.teams.map((team) => (
            <div
              key={team.id}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '0 8px',
                borderLeft: '1px solid rgba(63,63,70,0.4)',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e4e4e7' }}>
                {team.abbrev}
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#a1a1aa', fontVariantNumeric: 'tabular-nums' }}>
                {team.w}-{team.l}
              </div>
              <div style={{ fontSize: 11, color: '#71717a' }}>
                {team.gb}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Right panel: full standings table
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Standings
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#e4e4e7' }}>
          {data.division}
        </div>
      </div>
      {/* Table header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 44px 44px 56px 48px 52px 48px',
          gap: 0,
          padding: '6px 0',
          borderBottom: '1px solid rgba(63,63,70,0.5)',
        }}
      >
        {['Team', 'W', 'L', 'PCT', 'GB', 'STRK', 'L10'].map(h => (
          <div key={h} style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase', textAlign: h === 'Team' ? 'left' : 'center' }}>
            {h}
          </div>
        ))}
      </div>
      {/* Rows */}
      {data.teams.map((team, i) => (
        <div
          key={team.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 44px 44px 56px 48px 52px 48px',
            gap: 0,
            padding: '8px 0',
            borderBottom: '1px solid rgba(63,63,70,0.15)',
            background: i === 0 ? 'rgba(16,185,129,0.05)' : 'transparent',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? '#10b981' : '#e4e4e7' }}>
            {team.abbrev}
          </div>
          <div style={{ fontSize: 14, color: '#e4e4e7', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{team.w}</div>
          <div style={{ fontSize: 14, color: '#e4e4e7', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{team.l}</div>
          <div style={{ fontSize: 14, color: '#a1a1aa', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{team.pct}</div>
          <div style={{ fontSize: 14, color: '#71717a', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{team.gb}</div>
          <div style={{ fontSize: 12, color: '#71717a', textAlign: 'center' }}>{team.streak}</div>
          <div style={{ fontSize: 12, color: '#71717a', textAlign: 'center' }}>{team.l10}</div>
        </div>
      ))}
    </div>
  )
}
