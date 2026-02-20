'use client'
import Plot from '../PlotWrapper'
import { BASE_LAYOUT, COLORS, getPitchColor } from '../chartConfig'

export default function VelocityDistribution({ data }: { data: any[] }) {
  const f = data.filter(d => d.release_speed != null && d.pitch_name)
  if (!f.length) return <div className="text-zinc-500 text-sm text-center py-10">No velocity data</div>

  const pitchTypes = [...new Set(f.map(d => d.pitch_name))].sort()

  const traces = pitchTypes.map(pt => {
    const velos = f.filter(d => d.pitch_name === pt).map(d => d.release_speed)
    const avg = (velos.reduce((a: number, b: number) => a + b, 0) / velos.length).toFixed(1)
    return {
      x: velos, type: 'histogram' as any,
      name: `${pt} (${avg} avg)`,
      marker: { color: getPitchColor(pt) },
      opacity: 0.7,
      nbinsx: 30,
      hovertemplate: `${pt}<br>Velo: %{x:.1f} mph<br>Count: %{y}<extra></extra>`,
    }
  })

  const layout = {
    ...BASE_LAYOUT,
    title: { text: 'Velocity Distribution', font: { size: 14, color: COLORS.textLight } },
    xaxis: { ...BASE_LAYOUT.xaxis, title: 'Velocity (mph)' },
    yaxis: { ...BASE_LAYOUT.yaxis, title: 'Count' },
    barmode: 'overlay' as any,
    height: 400,
    legend: { ...BASE_LAYOUT.legend, x: 1, xanchor: 'right', y: 1 },
  }

  return <Plot data={traces} layout={layout} config={{ displaylogo: false, modeBarButtonsToRemove: ['lasso2d','select2d'] }} />
}
