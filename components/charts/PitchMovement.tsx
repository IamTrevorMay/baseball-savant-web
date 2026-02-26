'use client'
import Plot from '../PlotWrapper'
import { BASE_LAYOUT, COLORS, getPitchColor } from '../chartConfig'

export default function PitchMovement({ data }: { data: any[] }) {
  const f = data.filter(d => d.pfx_x != null && d.pfx_z != null && d.pitch_name)
  if (!f.length) return <div className="text-zinc-500 text-sm text-center py-10">No movement data</div>

  const pitchTypes = [...new Set(f.map(d => d.pitch_name))].sort()

  const traces = pitchTypes.map(pt => {
    const pts = f.filter(d => d.pitch_name === pt)
    return {
      x: pts.map(d => d.pfx_x * 12), y: pts.map(d => d.pfx_z * 12),
      type: 'scatter' as any, mode: 'markers' as any,
      name: pt,
      marker: { color: getPitchColor(pt), size: 5, opacity: 0.6 },
      hovertemplate: `${pt}<br>H Break: %{x:.1f} in<br>V Break: %{y:.1f} in<extra></extra>`,
    }
  })

  const layout = {
    ...BASE_LAYOUT,
    title: { text: 'Pitch Movement', font: { size: 14, color: COLORS.textLight } },
    xaxis: { ...BASE_LAYOUT.xaxis, title: 'Horizontal Break (in) — Catcher View (+x → 1B)', zeroline: true, zerolinecolor: '#52525b', zerolinewidth: 1 },
    yaxis: { ...BASE_LAYOUT.yaxis, title: 'Induced Vertical Break (in)', zeroline: true, zerolinecolor: '#52525b', zerolinewidth: 1 },
    height: 500,
    legend: { ...BASE_LAYOUT.legend, x: 1, xanchor: 'right', y: 1 },
  }

  return <Plot data={traces} layout={layout} config={{ displaylogo: false, modeBarButtonsToRemove: ['lasso2d','select2d'] }} />
}
