'use client'
import Plot from '../PlotWrapper'
import { BASE_LAYOUT, COLORS, getPitchColor } from '../chartConfig'

interface Props {
  data: any[]
  playerName?: string
}

export default function PitchLocationCards({ data, playerName }: Props) {
  const f = data.filter(d => d.pitch_name && d.plate_x != null && d.plate_z != null)
  if (!f.length) return <div className="text-zinc-500 text-sm text-center py-10">No location data</div>

  // Group by pitch_name, sorted descending by count
  const groups: Record<string, any[]> = {}
  f.forEach(d => {
    if (!groups[d.pitch_name]) groups[d.pitch_name] = []
    groups[d.pitch_name].push(d)
  })
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
  const total = f.length

  // Strike zone shapes for each card
  const zoneShapes = [
    { type: 'rect' as const, x0: -0.708, x1: 0.708, y0: 1.5, y1: 3.5, line: { color: '#ffffff', width: 1.5 } },
    { type: 'line' as const, x0: -0.236, x1: -0.236, y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.12)', width: 1 } },
    { type: 'line' as const, x0: 0.236, x1: 0.236, y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.12)', width: 1 } },
    { type: 'line' as const, x0: -0.708, x1: 0.708, y0: 2.167, y1: 2.167, line: { color: 'rgba(255,255,255,0.12)', width: 1 } },
    { type: 'line' as const, x0: -0.708, x1: 0.708, y0: 2.833, y1: 2.833, line: { color: 'rgba(255,255,255,0.12)', width: 1 } },
    { type: 'path' as const, path: 'M -0.708 0.15 L 0 0 L 0.708 0.15', line: { color: 'rgba(255,255,255,0.2)', width: 1.5 } },
  ]

  // Summary line
  const summaryParts = sorted.map(([name, pitches]) => {
    const pct = (pitches.length / total * 100).toFixed(1)
    return { name, pct, color: getPitchColor(name) }
  })

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-zinc-400">
          {playerName ? `${playerName} relies on` : 'Arsenal:'} {sorted.length} pitch{sorted.length !== 1 ? 'es' : ''}.
        </span>
        {summaryParts.map(p => (
          <span key={p.name} className="font-medium" style={{ color: p.color }}>
            {p.name} <span className="text-zinc-500 font-normal">({p.pct}%)</span>
          </span>
        ))}
      </div>

      {/* Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {sorted.map(([name, pitches]) => {
          const pct = (pitches.length / total * 100).toFixed(1)
          const color = getPitchColor(name)

          const trace = {
            x: pitches.map((d: any) => d.plate_x),
            y: pitches.map((d: any) => d.plate_z),
            type: 'histogram2dcontour' as any,
            colorscale: [[0, 'rgba(0,0,0,0)'], [0.2, color + '30'], [0.5, color + '70'], [1, color]],
            showscale: false,
            ncontours: 8,
            contours: { coloring: 'fill' as const },
            hoverinfo: 'skip' as any,
          }

          const layout = {
            paper_bgcolor: 'transparent',
            plot_bgcolor: COLORS.bg,
            font: { family: 'Inter, system-ui, sans-serif', color: COLORS.text, size: 10 },
            margin: { t: 5, r: 5, b: 5, l: 5 },
            xaxis: {
              range: [-2, 2], showgrid: false, zeroline: false,
              showticklabels: false, fixedrange: true, scaleanchor: 'y',
            },
            yaxis: {
              range: [0, 4.5], showgrid: false, zeroline: false,
              showticklabels: false, fixedrange: true,
            },
            shapes: zoneShapes,
            height: 220,
            autosize: true,
          }

          return (
            <div key={name} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="px-3 pt-3 pb-1">
                <div className="text-sm font-semibold" style={{ color }}>{name}</div>
                <div className="text-xs text-zinc-500">{pitches.length.toLocaleString()} pitches &middot; {pct}%</div>
              </div>
              <Plot
                data={[trace]}
                layout={layout}
                config={{ displaylogo: false, staticPlot: true }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
