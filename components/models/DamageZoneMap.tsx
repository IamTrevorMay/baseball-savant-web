'use client'
import Plot from '../PlotWrapper'
import { COLORS } from '../chartConfig'
import type { ZoneScore, BatterZone } from '@/lib/engines/types'

// Statcast zone center coordinates (catcher's perspective, in feet)
const ZONE_COORDS: Record<number, { x: number; z: number }> = {
  1: { x: -0.472, z: 3.167 }, 2: { x: 0, z: 3.167 }, 3: { x: 0.472, z: 3.167 },
  4: { x: -0.472, z: 2.5 },   5: { x: 0, z: 2.5 },   6: { x: 0.472, z: 2.5 },
  7: { x: -0.472, z: 1.833 }, 8: { x: 0, z: 1.833 }, 9: { x: 0.472, z: 1.833 },
  11: { x: -1.0, z: 3.7 },  12: { x: 1.0, z: 3.7 },
  13: { x: -1.0, z: 1.3 },  14: { x: 1.0, z: 1.3 },
}

const ZONE_SHAPES = [
  { type: 'rect' as const, x0: -0.708, x1: 0.708, y0: 1.5, y1: 3.5, line: { color: '#fff', width: 2 }, fillcolor: 'transparent' },
  { type: 'line' as const, x0: -0.236, x1: -0.236, y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'line' as const, x0: 0.236, x1: 0.236, y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'line' as const, x0: -0.708, x1: 0.708, y0: 2.167, y1: 2.167, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'line' as const, x0: -0.708, x1: 0.708, y0: 2.833, y1: 2.833, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'path' as const, path: 'M -0.708 0.15 L 0 0 L 0.708 0.15', line: { color: 'rgba(255,255,255,0.3)', width: 2 } },
]

function scoreToColor(label: 'danger' | 'neutral' | 'cold'): string {
  if (label === 'danger') return '#ef4444'
  if (label === 'cold') return '#22c55e'
  return '#a1a1aa'
}

export function DamageZoneMap({
  zoneScores,
  batterZones,
}: {
  zoneScores: ZoneScore[]
  batterZones: BatterZone[]
}) {
  const x: number[] = []
  const y: number[] = []
  const colors: string[] = []
  const sizes: number[] = []
  const texts: string[] = []
  const hovers: string[] = []

  for (const zs of zoneScores) {
    const coords = ZONE_COORDS[zs.zone]
    if (!coords) continue
    const bz = batterZones.find(b => b.zone === zs.zone)

    x.push(coords.x)
    y.push(coords.z)
    colors.push(scoreToColor(zs.label))
    sizes.push(zs.label === 'danger' ? 38 : zs.label === 'cold' ? 28 : 22)

    const evStr = bz?.avg_ev ? bz.avg_ev.toFixed(1) : '—'
    const barrelStr = bz?.barrel_pct != null ? bz.barrel_pct.toFixed(0) + '%' : '—'
    const xwobaStr = bz?.xwoba ? bz.xwoba.toFixed(3) : '—'
    texts.push(String(zs.zone))
    hovers.push(
      `Zone ${zs.zone} (${zs.label})<br>EV: ${evStr}<br>Barrel: ${barrelStr}<br>xwOBA: ${xwobaStr}`
    )
  }

  const trace = {
    x,
    y,
    type: 'scatter' as const,
    mode: 'markers+text' as const,
    marker: {
      size: sizes,
      color: colors,
      opacity: 0.6,
      line: { width: 1.5, color: colors },
    },
    text: texts,
    textfont: { color: '#fff', size: 9 },
    hovertext: hovers,
    hoverinfo: 'text' as const,
    showlegend: false,
  }

  return (
    <div className="relative w-full h-full">
      <Plot
        data={[trace]}
        layout={{
          paper_bgcolor: 'transparent',
          plot_bgcolor: COLORS.bg,
          font: { color: COLORS.text, size: 9 },
          margin: { t: 5, r: 5, b: 5, l: 5 },
          xaxis: {
            range: [-2.0, 2.0],
            showticklabels: false,
            showgrid: false,
            zeroline: false,
            fixedrange: true,
          },
          yaxis: {
            range: [-0.2, 4.5],
            showticklabels: false,
            showgrid: false,
            zeroline: false,
            scaleanchor: 'x',
            fixedrange: true,
          },
          shapes: ZONE_SHAPES,
          autosize: true,
        }}
        style={{ width: '100%', height: '100%' }}
      />
      {/* Legend */}
      <div className="absolute bottom-1 left-1 flex items-center gap-3 bg-zinc-900/80 rounded px-2 py-1">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-[9px] text-zinc-400">Danger</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-zinc-400" />
          <span className="text-[9px] text-zinc-400">Neutral</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-[9px] text-zinc-400">Cold</span>
        </div>
      </div>
    </div>
  )
}
