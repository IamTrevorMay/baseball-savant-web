'use client'
import Plot from '../PlotWrapper'
import { BASE_LAYOUT, COLORS, getPitchColor } from '../chartConfig'

export default function RollingAverages({ data }: { data: any[] }) {
  const f = data.filter(d => d.release_speed != null && d.game_date && d.pitch_name).sort((a, b) => a.game_date.localeCompare(b.game_date))
  if (f.length < 10) return <div className="text-zinc-500 text-sm text-center py-10">Not enough data for trends</div>

  const pitchTypes = [...new Set(f.map(d => d.pitch_name))].sort()
  const window = Math.min(25, Math.floor(f.length / 4))

  const traces = pitchTypes.map(pt => {
    const pts = f.filter(d => d.pitch_name === pt)
    if (pts.length < window) return null
    const rolling: number[] = []
    const dates: string[] = []
    for (let i = window - 1; i < pts.length; i++) {
      let sum = 0
      for (let j = i - window + 1; j <= i; j++) sum += pts[j].release_speed
      rolling.push(sum / window)
      dates.push(pts[i].game_date)
    }
    return {
      x: dates, y: rolling,
      type: 'scatter' as any, mode: 'lines' as any,
      name: pt, line: { color: getPitchColor(pt), width: 2 },
      hovertemplate: `${pt}<br>Date: %{x}<br>Avg Velo: %{y:.1f} mph<extra></extra>`,
    }
  }).filter(Boolean)

  const layout = {
    ...BASE_LAYOUT,
    title: { text: `Velocity Trend (${window}-pitch rolling avg)`, font: { size: 14, color: COLORS.textLight } },
    xaxis: { ...BASE_LAYOUT.xaxis, title: 'Date' },
    yaxis: { ...BASE_LAYOUT.yaxis, title: 'Velocity (mph)' },
    height: 400,
    legend: { ...BASE_LAYOUT.legend, x: 1, xanchor: 'right', y: 1 },
  }

  return <Plot data={traces as any[]} layout={layout} config={{ displaylogo: false }} />
}
