'use client'

import dynamic from 'next/dynamic'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

interface DataPoint {
  date: string
  value: number | null
}

interface Props {
  data: DataPoint[]
  color: string
  title: string
  unit?: string
  height?: number
  chartType?: 'line' | 'bar'
  markerColors?: string[]
  referenceLines?: { y: number; color: string }[]
}

export default function MetricTrend({
  data,
  color,
  title,
  unit = '',
  height = 160,
  chartType = 'line',
  markerColors,
  referenceLines,
}: Props) {
  const dates = data.map(d => d.date)
  const values = data.map(d => d.value)

  if (data.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex-1 min-w-0">
        <h4 className="text-xs font-medium text-zinc-400 mb-2">{title}</h4>
        <p className="text-[10px] text-zinc-600 text-center py-6">No data</p>
      </div>
    )
  }

  const validValues = values.filter((v): v is number => v !== null)
  const avg = validValues.length > 0
    ? validValues.reduce((a, b) => a + b, 0) / validValues.length
    : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trace: Record<string, any> = chartType === 'bar'
    ? {
        x: dates,
        y: values,
        type: 'bar',
        marker: { color: color, opacity: 0.7 },
        hovertemplate: `%{x}<br>${title}: %{y:.1f}${unit}<extra></extra>`,
      }
    : {
        x: dates,
        y: values,
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: '#52525b', width: 1.5 },
        marker: {
          color: markerColors || color,
          size: 5,
        },
        hovertemplate: `%{x}<br>${title}: %{y:.1f}${unit}<extra></extra>`,
      }

  const shapes = (referenceLines || []).map(rl => ({
    type: 'line' as const,
    y0: rl.y,
    y1: rl.y,
    x0: 0,
    x1: 1,
    xref: 'paper' as const,
    line: { color: rl.color, width: 0.5, dash: 'dot' as const },
  }))

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-1">
        <h4 className="text-xs font-medium text-zinc-400">{title}</h4>
        {avg !== null && (
          <span className="text-[10px] text-zinc-600">
            avg {chartType === 'bar' || unit === '' ? avg.toFixed(1) : Math.round(avg)}{unit}
          </span>
        )}
      </div>
      <Plot
        data={[trace]}
        layout={{
          height,
          margin: { t: 5, r: 10, b: 30, l: 35 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          xaxis: {
            color: '#52525b',
            gridcolor: '#1e1e22',
            tickfont: { size: 8, color: '#52525b' },
            showgrid: false,
          },
          yaxis: {
            color: '#52525b',
            gridcolor: '#1e1e22',
            tickfont: { size: 8, color: '#52525b' },
          },
          shapes,
          bargap: 0.3,
        }}
        config={{ displayModeBar: false, responsive: true }}
        className="w-full"
      />
    </div>
  )
}
