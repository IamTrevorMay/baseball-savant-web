'use client'
import Plot from '../PlotWrapper'
import { BASE_LAYOUT, COLORS, getPitchColor } from '../chartConfig'

export default function ArmAngleBreak({ data }: { data: any[] }) {
  const f = data.filter(d => d.arm_angle != null && d.pfx_x != null && d.pfx_z != null && d.pitch_name)
  if (!f.length) return <div className="text-zinc-500 text-sm text-center py-10">No arm angle data</div>

  const pitchTypes = [...new Set(f.map(d => d.pitch_name))].sort()

  const hTraces = pitchTypes.map(pt => {
    const pts = f.filter(d => d.pitch_name === pt)
    return {
      x: pts.map(d => d.arm_angle), y: pts.map(d => d.pfx_x),
      type: 'scatter' as any, mode: 'markers' as any,
      name: pt, legendgroup: pt,
      marker: { color: getPitchColor(pt), size: 4, opacity: 0.4 },
      hovertemplate: `${pt}<br>Arm Angle: %{x:.1f}°<br>H Break: %{y:.1f} in<extra></extra>`,
      xaxis: 'x', yaxis: 'y',
    }
  })

  const vTraces = pitchTypes.map(pt => {
    const pts = f.filter(d => d.pitch_name === pt)
    return {
      x: pts.map(d => d.arm_angle), y: pts.map(d => d.pfx_z),
      type: 'scatter' as any, mode: 'markers' as any,
      name: pt, legendgroup: pt, showlegend: false,
      marker: { color: getPitchColor(pt), size: 4, opacity: 0.4 },
      hovertemplate: `${pt}<br>Arm Angle: %{x:.1f}°<br>V Break: %{y:.1f} in<extra></extra>`,
      xaxis: 'x2', yaxis: 'y2',
    }
  })

  const layout = {
    ...BASE_LAYOUT,
    title: { text: 'Arm Angle vs Break', font: { size: 14, color: COLORS.textLight } },
    grid: { rows: 1, columns: 2, pattern: 'independent' as any },
    xaxis: { ...BASE_LAYOUT.xaxis, title: 'Arm Angle (°)', domain: [0, 0.47] },
    yaxis: { ...BASE_LAYOUT.yaxis, title: 'Horizontal Break (in)' },
    xaxis2: { ...BASE_LAYOUT.xaxis, title: 'Arm Angle (°)', domain: [0.53, 1] },
    yaxis2: { ...BASE_LAYOUT.yaxis, title: 'Vertical Break (in)' },
    height: 400,
    legend: { ...BASE_LAYOUT.legend, x: 0.5, xanchor: 'center', y: -0.15, orientation: 'h' as any },
  }

  return <Plot data={[...hTraces, ...vTraces]} layout={layout} config={{ displaylogo: false, modeBarButtonsToRemove: ['lasso2d','select2d'] }} />
}
