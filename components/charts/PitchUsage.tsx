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
    labels: sorted.map(([name]) => name),
    values: sorted.map(([, count]) => count),
    type: 'pie' as any,
    hole: 0.4,
    marker: { colors: sorted.map(([name]) => getPitchColor(name)), line: { color: COLORS.bg, width: 2 } },
    textinfo: 'label+percent',
    textposition: 'outside' as any,
    textfont: { color: COLORS.textLight, size: 11 },
    hovertemplate: '%{label}<br>Usage: %{percent}<br>Count: %{value}<extra></extra>',
    sort: false,
  }

  const layout = {
    ...BASE_LAYOUT,
    title: { text: 'Pitch Usage', font: { size: 14, color: COLORS.textLight } },
    height: 400,
    showlegend: false,
    margin: { t: 40, r: 30, b: 30, l: 30 },
  }

  return <Plot data={[trace]} layout={layout} config={{ displaylogo: false }} />
}
