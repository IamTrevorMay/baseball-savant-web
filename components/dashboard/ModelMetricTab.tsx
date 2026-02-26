'use client'
import { useMemo } from 'react'
import Plot from '../PlotWrapper'
import { COLORS, getPitchColor } from '../chartConfig'
import type { DeployedModel } from '@/lib/deployedModels'

interface Props {
  data: any[]
  model: DeployedModel
}

export default function ModelMetricTab({ data, model }: Props) {
  const col = model.column_name
  const decimals = model.deploy_config.format?.decimals ?? 2

  const { values, stats, byPitchType } = useMemo(() => {
    const vals = data.map(d => d[col]).filter((v: any) => v != null).map(Number)
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    const stddev = vals.length > 1 ? Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1)) : 0
    const min = vals.length ? Math.min(...vals) : 0
    const max = vals.length ? Math.max(...vals) : 0

    // By pitch type
    const groups: Record<string, number[]> = {}
    data.forEach(d => {
      if (d[col] == null) return
      const pt = d.pitch_name || 'Unknown'
      if (!groups[pt]) groups[pt] = []
      groups[pt].push(Number(d[col]))
    })
    const byPT = Object.entries(groups)
      .map(([name, vals]) => ({
        name,
        count: vals.length,
        mean: vals.reduce((a, b) => a + b, 0) / vals.length,
        min: Math.min(...vals),
        max: Math.max(...vals),
      }))
      .sort((a, b) => b.count - a.count)

    return { values: vals, stats: { mean, stddev, min, max, count: vals.length }, byPitchType: byPT }
  }, [data, col])

  const fmt = (v: number) => v.toFixed(decimals)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white">{model.name}</h2>
        {model.description && <p className="text-sm text-zinc-400 mt-1">{model.description}</p>}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Mean', value: fmt(stats.mean) },
          { label: 'Std Dev', value: fmt(stats.stddev) },
          { label: 'Min', value: fmt(stats.min) },
          { label: 'Max', value: fmt(stats.max) },
          { label: 'Pitches', value: stats.count.toLocaleString() },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-center">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{s.label}</div>
            <div className="text-lg font-mono text-white font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Histogram */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Distribution</h3>
        <div className="h-[300px]">
          {values.length > 0 ? (
            <Plot
              data={[{
                x: values,
                type: 'histogram',
                nbinsx: 40,
                marker: { color: '#10b981', line: { color: '#059669', width: 1 } },
                hovertemplate: 'Value: %{x:.2f}<br>Count: %{y}<extra></extra>'
              }]}
              layout={{
                paper_bgcolor: 'transparent',
                plot_bgcolor: COLORS.bg,
                font: { color: COLORS.text, size: 10 },
                margin: { t: 10, r: 20, b: 40, l: 50 },
                xaxis: { title: { text: model.name, font: { size: 11 } }, gridcolor: '#27272a', zeroline: false },
                yaxis: { title: { text: 'Count', font: { size: 11 } }, gridcolor: '#27272a', zeroline: false },
                autosize: true,
                bargap: 0.05,
              }}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-600">No data for this model</div>
          )}
        </div>
      </div>

      {/* Pitch Type Breakdown */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <h3 className="text-sm font-semibold text-white px-4 py-3 border-b border-zinc-800">By Pitch Type</h3>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-zinc-800">
              <th className="px-4 py-2 text-left text-zinc-400 font-semibold">Pitch</th>
              <th className="px-4 py-2 text-right text-zinc-400 font-semibold">#</th>
              <th className="px-4 py-2 text-right text-zinc-400 font-semibold">Mean</th>
              <th className="px-4 py-2 text-right text-zinc-400 font-semibold">Min</th>
              <th className="px-4 py-2 text-right text-zinc-400 font-semibold">Max</th>
            </tr>
          </thead>
          <tbody>
            {byPitchType.map(pt => (
              <tr key={pt.name} className="border-t border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="px-4 py-1.5 text-white font-medium">{pt.name}</td>
                <td className="px-4 py-1.5 text-zinc-400 font-mono text-right">{pt.count.toLocaleString()}</td>
                <td className="px-4 py-1.5 text-emerald-400 font-mono text-right">{fmt(pt.mean)}</td>
                <td className="px-4 py-1.5 text-zinc-400 font-mono text-right">{fmt(pt.min)}</td>
                <td className="px-4 py-1.5 text-zinc-400 font-mono text-right">{fmt(pt.max)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
