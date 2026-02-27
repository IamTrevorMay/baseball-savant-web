'use client'

import dynamic from 'next/dynamic'
import { WhoopCycleRow } from '@/lib/compete/whoop-types'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

interface Props {
  cycles: WhoopCycleRow[]
}

export default function RecoveryTrend({ cycles }: Props) {
  if (cycles.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-3">Recovery Trend</h3>
        <p className="text-xs text-zinc-600 text-center py-8">No recovery data to chart</p>
      </div>
    )
  }

  const dates = cycles.map(c => c.cycle_date)
  const scores = cycles.map(c => c.recovery_score)
  const colors = cycles.map(c => {
    if (c.recovery_state === 'green') return '#22c55e'
    if (c.recovery_state === 'yellow') return '#eab308'
    return '#ef4444'
  })

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h3 className="text-sm font-semibold text-white mb-3">Recovery Trend</h3>
      <Plot
        data={[
          {
            x: dates,
            y: scores,
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: '#71717a', width: 1.5 },
            marker: { color: colors, size: 7 },
            hovertemplate: '%{x}<br>Recovery: %{y:.0f}%<extra></extra>',
          },
        ]}
        layout={{
          height: 220,
          margin: { t: 10, r: 20, b: 40, l: 40 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          xaxis: {
            color: '#71717a',
            gridcolor: '#27272a',
            tickfont: { size: 9, color: '#71717a' },
          },
          yaxis: {
            color: '#71717a',
            gridcolor: '#27272a',
            tickfont: { size: 9, color: '#71717a' },
            range: [0, 105],
            dtick: 25,
            title: { text: 'Recovery %', font: { size: 10, color: '#52525b' } },
          },
          shapes: [
            { type: 'line', y0: 67, y1: 67, x0: 0, x1: 1, xref: 'paper', line: { color: '#22c55e', width: 0.5, dash: 'dot' } },
            { type: 'line', y0: 34, y1: 34, x0: 0, x1: 1, xref: 'paper', line: { color: '#ef4444', width: 0.5, dash: 'dot' } },
          ],
        }}
        config={{ displayModeBar: false, responsive: true }}
        className="w-full"
      />
    </div>
  )
}
