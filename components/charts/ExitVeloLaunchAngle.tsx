'use client'
import Plot from '../PlotWrapper'
import { BASE_LAYOUT, COLORS } from '../chartConfig'

export default function ExitVeloLaunchAngle({ data }: { data: any[] }) {
  const f = data.filter(d => d.launch_speed != null && d.launch_angle != null)
  if (!f.length) return <div className="text-zinc-500 text-sm text-center py-10">No batted ball data</div>

  const xba = f.map(d => d.estimated_ba_using_speedangle).filter(v => v != null)
  const hasXba = xba.length > 0

  const trace = {
    x: f.map(d => d.launch_speed), y: f.map(d => d.launch_angle),
    type: 'scatter' as any, mode: 'markers' as any,
    marker: hasXba ? {
      color: f.map(d => d.estimated_ba_using_speedangle || 0),
      colorscale: [[0,'#3b82f6'],[0.3,'#10b981'],[0.6,'#f59e0b'],[1,'#ef4444']],
      size: 5, opacity: 0.7, showscale: true,
      colorbar: { title: { text: 'xBA', font: { size: 10, color: COLORS.text } }, tickfont: { size: 9, color: COLORS.text }, len: 0.8 }
    } : { color: COLORS.emerald, size: 5, opacity: 0.5 },
    hovertemplate: 'EV: %{x:.1f} mph<br>LA: %{y:.1f}°<br>xBA: %{marker.color:.3f}<extra></extra>',
    showlegend: false,
  }

  const layout = {
    ...BASE_LAYOUT,
    title: { text: 'Exit Velo vs Launch Angle', font: { size: 14, color: COLORS.textLight } },
    xaxis: { ...BASE_LAYOUT.xaxis, title: 'Exit Velocity (mph)' },
    yaxis: { ...BASE_LAYOUT.yaxis, title: 'Launch Angle (°)' },
    height: 450,
    shapes: [
      { type: 'rect', x0: 95, x1: 120, y0: 8, y1: 32, line: { color: 'rgba(239,68,68,0.3)', width: 1, dash: 'dot' }, fillcolor: 'rgba(239,68,68,0.05)' },
    ],
    annotations: [
      { x: 107.5, y: 33, text: 'Barrel Zone', showarrow: false, font: { size: 9, color: 'rgba(239,68,68,0.5)' } }
    ],
  }

  return <Plot data={[trace]} layout={layout} config={{ displaylogo: false, modeBarButtonsToRemove: ['lasso2d','select2d'] }} />
}
