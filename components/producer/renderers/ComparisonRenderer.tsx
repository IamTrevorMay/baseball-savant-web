'use client'

import type { ComparisonData, PanelPosition } from '@/lib/producerTypes'

interface Props {
  data: ComparisonData
  position: PanelPosition
}

function formatValue(v: number | string): string {
  if (typeof v === 'string') return v
  if (Number.isInteger(v)) return String(v)
  if (v >= 0 && v < 1) return v.toFixed(3).replace(/^0/, '')
  return v.toFixed(1)
}

export default function ComparisonRenderer({ data, position }: Props) {
  const isLower = position === 'lower-bar'

  return (
    <div style={{
      width: '100%',
      height: isLower ? undefined : '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: isLower ? 4 : 8,
    }}>
      {/* Header with player names */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isLower ? 0 : 8 }}>
        <div style={{ fontSize: isLower ? 14 : 16, fontWeight: 700, color: '#10b981' }}>
          {data.playerA.playerName}
        </div>
        <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase' }}>VS</div>
        <div style={{ fontSize: isLower ? 14 : 16, fontWeight: 700, color: '#0ea5e9' }}>
          {data.playerB.playerName}
        </div>
      </div>

      {/* Comparison bars */}
      {data.metrics.map(metric => {
        const aVal = Number(data.playerA.stats[metric]) || 0
        const bVal = Number(data.playerB.stats[metric]) || 0
        const total = aVal + bVal || 1
        const aPct = (aVal / total) * 100
        const bPct = (bVal / total) * 100

        return (
          <div key={metric} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: isLower ? 14 : 16,
              fontWeight: 600,
              color: '#e4e4e7',
              width: isLower ? 50 : 60,
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {formatValue(aVal)}
            </span>
            <div style={{
              flex: 1,
              height: isLower ? 16 : 22,
              display: 'flex',
              borderRadius: 4,
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${aPct}%`,
                background: 'rgba(16,185,129,0.4)',
                borderRadius: '4px 0 0 4px',
              }} />
              <div style={{
                width: `${bPct}%`,
                background: 'rgba(14,165,233,0.4)',
                borderRadius: '0 4px 4px 0',
              }} />
            </div>
            <span style={{
              fontSize: isLower ? 14 : 16,
              fontWeight: 600,
              color: '#e4e4e7',
              width: isLower ? 50 : 60,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {formatValue(bVal)}
            </span>
          </div>
        )
      })}

      {/* Metric labels */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ width: isLower ? 50 : 60 }} />
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-around' }}>
          {data.metrics.map(m => (
            <span key={m} style={{ fontSize: 9, color: '#71717a', textTransform: 'uppercase' }}>
              {data.metricLabels[m] || m}
            </span>
          ))}
        </div>
        <div style={{ width: isLower ? 50 : 60 }} />
      </div>
    </div>
  )
}
