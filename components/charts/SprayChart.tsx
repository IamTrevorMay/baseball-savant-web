'use client'
import Plot from '../PlotWrapper'
import { BASE_LAYOUT, COLORS } from '../chartConfig'

export default function SprayChart({ data }: { data: any[] }) {
  const f = data.filter(d => d.hc_x != null && d.hc_y != null)
  if (!f.length) return <div className="text-zinc-500 text-sm text-center py-10">No batted ball data</div>

  const colorMap: Record<string, string> = {
    'single': '#10b981', 'double': '#0ea5e9', 'triple': '#a855f7',
    'home_run': '#ef4444', 'field_out': '#52525b', 'grounded_into_double_play': '#71717a',
    'force_out': '#71717a', 'sac_fly': '#f59e0b', 'field_error': '#f97316',
    'fielders_choice': '#71717a', 'double_play': '#71717a',
  }

  const types = [...new Set(f.map(d => d.events).filter(Boolean))].sort()
  const traces = types.map(ev => {
    const pts = f.filter(d => d.events === ev)
    return {
      x: pts.map(d => d.hc_x), y: pts.map(d => d.hc_y),
      type: 'scatter' as any, mode: 'markers' as any,
      name: ev.replace(/_/g, ' '),
      marker: { color: colorMap[ev] || '#52525b', size: 5, opacity: 0.7 },
      hovertemplate: `${ev.replace(/_/g, ' ')}<br>X: %{x:.0f}<br>Y: %{y:.0f}<extra></extra>`,
    }
  })

  const layout = {
    ...BASE_LAYOUT,
    title: { text: 'Spray Chart', font: { size: 14, color: COLORS.textLight } },
    xaxis: { ...BASE_LAYOUT.xaxis, title: '', showgrid: false, zeroline: false, range: [0, 250] },
    yaxis: { ...BASE_LAYOUT.yaxis, title: '', showgrid: false, zeroline: false, autorange: 'reversed', range: [0, 250] },
    height: 500, width: 500,
    shapes: [
      { type: 'line', x0: 125, y0: 200, x1: 25, y1: 50, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
      { type: 'line', x0: 125, y0: 200, x1: 225, y1: 50, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
      { type: 'path', path: 'M 25 50 Q 125 -20 225 50', line: { color: 'rgba(255,255,255,0.1)', width: 1 } },
    ],
  }

  return <Plot data={traces} layout={layout} config={{ displaylogo: false, modeBarButtonsToRemove: ['lasso2d','select2d'] }} />
}
