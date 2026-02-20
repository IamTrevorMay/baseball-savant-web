'use client'
import Plot from '../PlotWrapper'
import { BASE_LAYOUT, COLORS, getPitchColor } from '../chartConfig'

export default function SpinVsVelo({ data }: { data: any[] }) {
  const f = data.filter(d => d.release_speed != null && d.release_spin_rate != null && d.pitch_name)
  if (!f.length) return <div className="text-zinc-500 text-sm text-center py-10">No spin/velo data</div>

  const pitchTypes = [...new Set(f.map(d => d.pitch_name))].sort()

  const traces = pitchTypes.map(pt => {
    const pts = f.filter(d => d.pitch_name === pt)
    return {
      x: pts.map(d => d.release_speed), y: pts.map(d => d.release_spin_rate),
      type: 'scatter' as any, mode: 'markers' as any,
      name: pt,
      marker: { color: getPitchColor(pt), size: 5, opacity: 0.5 },
      hovertemplate: `${pt}<br>Velo: %{x:.1f} mph<br>Spin: %{y:.0f} rpm<extra></extra>`,
    }
  })

  const layout = {
    ...BASE_LAYOUT,
    title: { text: 'Spin Rate vs Velocity', font: { size: 14, color: COLORS.textLight } },
    xaxis: { ...BASE_LAYOUT.xaxis, title: 'Velocity (mph)' },
    yaxis: { ...BASE_LAYOUT.yaxis, title: 'Spin Rate (rpm)' },
    height: 450,
    legend: { ...BASE_LAYOUT.legend, x: 1, xanchor: 'right', y: 1 },
  }

  return <Plot data={traces} layout={layout} config={{ displaylogo: false, modeBarButtonsToRemove: ['lasso2d','select2d'] }} />
}
