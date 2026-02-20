'use client'
import Plot from '../PlotWrapper'
import { BASE_LAYOUT, COLORS, getPitchColor } from '../chartConfig'

export default function PitchUsage({ data }: { data: any[] }) {
  const f = data.filter(d => d.pitch_name)
  if (!f.length) return <div className="text-zinc-500 text-sm text-center py-10">No pitch data</div>

  const counts: Record<string, number> = {}
  f.forEach(d => { counts[d.pitch_name] = (counts[d.pitch_name] || 0) + 1 })
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const total = f.length

  const trace = {
    x: sorted.map(([name]) => name),
    y: sorted.map(([, count]) => (count / total * 100)),
    type: 'bar' as any,
    marker: { color: sorted.map(([name]) => getPitchColor(name)), line: { width: 0 } },
    text: sorted.map(([, count]) => `${(count / total * 100).toFixed(1)}%`),
    textposition: 'outside' as any, textfont: { color: COLORS.textLight, size: 10 },
    hovertemplate: '%{x}<br>Usage: %{y:.1f}%<br>Count: %{customdata}<extra></extra>',
    customdata: sorted.map(([, count]) => count),
  }

  const layout = {
    ...BASE_LAYOUT,
    title: { text: 'Pitch Usage', font: { size: 14, color: COLORS.textLight } },
    xaxis: { ...BASE_LAYOUT.xaxis, title: '' },
    yaxis: { ...BASE_LAYOUT.yaxis, title: 'Usage %' },
    height: 400, showlegend: false,
  }

  return <Plot data={[trace]} layout={layout} config={{ displaylogo: false }} />
}
