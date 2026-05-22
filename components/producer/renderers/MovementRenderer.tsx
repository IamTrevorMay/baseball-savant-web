'use client'

import type { MovementData, PanelPosition } from '@/lib/producerTypes'
import { getPitchColor, PITCH_CODE_NAMES } from '@/components/chartConfig'

interface Props {
  data: MovementData
  position: PanelPosition
}

export default function MovementRenderer({ data, position }: Props) {
  const isLower = position === 'lower-bar'
  const avgs = data.averages

  // Determine axis range from averages
  const allHB = avgs.map(a => a.hb)
  const allIVB = avgs.map(a => a.ivb)
  const maxAbs = Math.max(
    Math.max(...allHB.map(Math.abs), 25),
    Math.max(...allIVB.map(Math.abs), 25),
  )
  const range = Math.ceil(maxAbs / 5) * 5 + 5

  const svgW = isLower ? 200 : 380
  const svgH = isLower ? 110 : 380
  const margin = { top: 10, right: 10, bottom: 20, left: 28 }
  const plotW = svgW - margin.left - margin.right
  const plotH = svgH - margin.top - margin.bottom

  const scaleX = (v: number) => margin.left + ((v + range) / (2 * range)) * plotW
  const scaleY = (v: number) => margin.top + ((range - v) / (2 * range)) * plotH

  return (
    <div style={{
      display: 'flex',
      alignItems: isLower ? 'center' : 'flex-start',
      gap: isLower ? 24 : 0,
      width: '100%',
      height: isLower ? undefined : '100%',
      flexDirection: isLower ? 'row' : 'column',
    }}>
      {/* Label */}
      <div style={{ minWidth: isLower ? 120 : undefined, marginBottom: isLower ? 0 : 12 }}>
        <div style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Movement</div>
        <div style={{ fontSize: isLower ? 16 : 20, fontWeight: 700, color: '#e4e4e7' }}>{data.playerName}</div>
      </div>

      {/* SVG scatter */}
      <svg width={svgW} height={svgH} style={{ flex: isLower ? undefined : 1 }}>
        {/* Grid */}
        <line x1={margin.left} y1={scaleY(0)} x2={svgW - margin.right} y2={scaleY(0)} stroke="#3f3f46" strokeWidth={1} />
        <line x1={scaleX(0)} y1={margin.top} x2={scaleX(0)} y2={svgH - margin.bottom} stroke="#3f3f46" strokeWidth={1} />

        {/* Axis labels */}
        <text x={svgW / 2} y={svgH - 2} textAnchor="middle" fill="#71717a" fontSize={9}>HB (in)</text>
        <text x={8} y={svgH / 2} textAnchor="middle" fill="#71717a" fontSize={9} transform={`rotate(-90, 8, ${svgH / 2})`}>IVB (in)</text>

        {/* Average dots — larger */}
        {avgs.map(avg => (
          <g key={avg.pitch_type}>
            <circle
              cx={scaleX(avg.hb)}
              cy={scaleY(avg.ivb)}
              r={isLower ? 8 : 12}
              fill={getPitchColor(avg.pitch_type)}
              opacity={0.85}
            />
            {!isLower && (
              <text
                x={scaleX(avg.hb)}
                y={scaleY(avg.ivb) + 3}
                textAnchor="middle"
                fill="white"
                fontSize={8}
                fontWeight={700}
              >
                {avg.pitch_type}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Legend — only in right panel */}
      {!isLower && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {avgs.map(avg => (
            <div key={avg.pitch_type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: getPitchColor(avg.pitch_type) }} />
              <span style={{ fontSize: 11, color: '#a1a1aa' }}>
                {PITCH_CODE_NAMES[avg.pitch_type] || avg.pitch_name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
