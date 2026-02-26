'use client'
import Plot from '../PlotWrapper'
import { BASE_LAYOUT, COLORS } from '../chartConfig'

export default function StrikeZoneHeatmap({ data }: { data: any[] }) {
  const f = data.filter(d => d.plate_x != null && d.plate_z != null)
  if (!f.length) return <div className="text-zinc-500 text-sm text-center py-10">No location data</div>

  const trace = {
    x: f.map(d => d.plate_x), y: f.map(d => d.plate_z),
    type: 'histogram2d' as any, colorscale: 'YlOrRd', reversescale: false,
    nbinsx: 25, nbinsy: 25,
    colorbar: { tickfont: { color: COLORS.text, size: 9 }, len: 0.8 },
    customdata: f.map(d => [+(d.plate_x * 12).toFixed(1), +(d.plate_z * 12).toFixed(1)]),
    hovertemplate: 'X: %{customdata[0]:.1f}"<br>Z: %{customdata[1]:.1f}"<br>Count: %{z}<extra></extra>',
  }

  const layout = {
    ...BASE_LAYOUT,
    title: { text: 'Pitch Location Heatmap', font: { size: 14, color: COLORS.textLight } },
    xaxis: { ...BASE_LAYOUT.xaxis, title: 'Horizontal (ft) — Catcher View', range: [-2.5, 2.5], scaleanchor: 'y' },
    yaxis: { ...BASE_LAYOUT.yaxis, title: 'Vertical (ft)', range: [0, 5] },
    shapes: [
      { type: 'rect', x0: -0.708, x1: 0.708, y0: 1.5, y1: 3.5, line: { color: '#ffffff', width: 2 } },
      { type: 'rect', x0: -0.708, x1: 0.708, y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.1)', width: 1 }, fillcolor: 'rgba(255,255,255,0.03)' },
      { type: 'line', x0: -0.236, x1: -0.236, y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
      { type: 'line', x0: 0.236, x1: 0.236, y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
      { type: 'line', x0: -0.708, x1: 0.708, y0: 2.167, y1: 2.167, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
      { type: 'line', x0: -0.708, x1: 0.708, y0: 2.833, y1: 2.833, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
      { type: 'path', path: 'M -0.708 0.15 L 0 0 L 0.708 0.15', line: { color: 'rgba(255,255,255,0.3)', width: 2 } },
    ],
    height: 500, width: 450,
  }

  return <Plot data={[trace]} layout={layout} config={{ displaylogo: false, modeBarButtonsToRemove: ['lasso2d','select2d'] }} />
}
