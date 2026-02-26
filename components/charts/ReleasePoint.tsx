'use client'
import Plot from '../PlotWrapper'
import { BASE_LAYOUT, COLORS, getPitchColor } from '../chartConfig'

export default function ReleasePoint({ data }: { data: any[] }) {
  const f = data.filter(d => d.release_pos_x != null && d.release_pos_z != null && d.pitch_name)
  if (!f.length) return <div className="text-zinc-500 text-sm text-center py-10">No release point data</div>

  const pitchTypes = [...new Set(f.map(d => d.pitch_name))].sort()

  const traces = pitchTypes.map(pt => {
    const pts = f.filter(d => d.pitch_name === pt)
    return {
      x: pts.map(d => d.release_pos_x), y: pts.map(d => d.release_pos_z),
      type: 'scatter' as any, mode: 'markers' as any,
      name: pt,
      marker: { color: getPitchColor(pt), size: 5, opacity: 0.5 },
      customdata: pts.map(d => [+(d.release_pos_x * 12).toFixed(1), +(d.release_pos_z * 12).toFixed(1)]),
      hovertemplate: `${pt}<br>X: %{customdata[0]:.1f}"<br>Z: %{customdata[1]:.1f}"<extra></extra>`,
    }
  })

  const layout = {
    ...BASE_LAYOUT,
    title: { text: 'Release Point', font: { size: 14, color: COLORS.textLight } },
    xaxis: { ...BASE_LAYOUT.xaxis, title: 'Horizontal (ft) — Catcher View (+x → 1B)', scaleanchor: 'y' },
    yaxis: { ...BASE_LAYOUT.yaxis, title: 'Vertical (ft)' },
    height: 500, width: 450,
    legend: { ...BASE_LAYOUT.legend, x: 1, xanchor: 'right', y: 1 },
  }

  return <Plot data={traces} layout={layout} config={{ displaylogo: false, modeBarButtonsToRemove: ['lasso2d','select2d'] }} />
}
