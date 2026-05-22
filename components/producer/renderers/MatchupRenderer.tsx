'use client'

import type { MatchupData, PanelPosition } from '@/lib/producerTypes'

interface Props {
  data: MatchupData
  position: PanelPosition
}

function formatValue(v: number | string): string {
  if (typeof v === 'string') return v
  if (Number.isInteger(v)) return String(v)
  if (v >= 0 && v < 1) return v.toFixed(3).replace(/^0/, '')
  return v.toFixed(1)
}

function PlayerCard({ player, label, compact }: {
  player: MatchupData['pitcher']
  label: string
  compact: boolean
}) {
  const headshotUrl = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${player.playerId}/headshot/67/current`
  const entries = Object.entries(player.stats)

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
        <img
          src={headshotUrl}
          alt=""
          style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid #3f3f46' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase' }}>{label}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e4e4e7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {player.playerName}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {entries.slice(0, 4).map(([key, val]) => (
              <div key={key} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#71717a' }}>{player.metricLabels[key] || key}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e4e4e7', fontVariantNumeric: 'tabular-nums' }}>
                  {formatValue(val)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Full card (right panel)
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <img
          src={headshotUrl}
          alt=""
          style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid #3f3f46' }}
        />
        <div>
          <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase' }}>{label}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e4e4e7' }}>{player.playerName}</div>
        </div>
      </div>
      {entries.map(([key, val]) => (
        <div
          key={key}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 0',
            borderBottom: '1px solid rgba(63,63,70,0.2)',
          }}
        >
          <span style={{ fontSize: 12, color: '#a1a1aa' }}>{player.metricLabels[key] || key}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#e4e4e7', fontVariantNumeric: 'tabular-nums' }}>
            {formatValue(val)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function MatchupRenderer({ data, position }: Props) {
  const isLower = position === 'lower-bar'

  return (
    <div style={{
      display: 'flex',
      alignItems: isLower ? 'center' : 'flex-start',
      gap: isLower ? 32 : 20,
      width: '100%',
      height: isLower ? undefined : '100%',
      flexDirection: isLower ? 'row' : 'column',
    }}>
      <PlayerCard player={data.pitcher} label="Pitcher" compact={isLower} />
      <div style={{
        fontSize: 16,
        fontWeight: 700,
        color: '#71717a',
        ...(isLower ? {} : { textAlign: 'center' as const, width: '100%', padding: '4px 0' }),
      }}>
        VS
      </div>
      <PlayerCard player={data.batter} label="Batter" compact={isLower} />
    </div>
  )
}
