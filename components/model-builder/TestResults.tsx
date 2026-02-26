'use client'
import Plot from '../PlotWrapper'
import { COLORS } from '../chartConfig'

interface Stats {
  mean?: number | string
  stddev?: number | string
  min?: number | string
  max?: number | string
}

interface Props {
  sampleRows: any[]
  stats: Stats
}

function fmt(v: any): string {
  if (v == null) return '\u2014'
  const n = Number(v)
  return isNaN(n) ? String(v) : n.toFixed(3)
}

export default function TestResults({ sampleRows, stats }: Props) {
  if (!sampleRows.length) return null

  const values = sampleRows.map(r => r.model_value).filter((v: any) => v != null).map(Number)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-800/50">
        <span className="text-sm font-semibold text-white">Test Results</span>
        <span className="text-[11px] text-zinc-500 ml-2">({sampleRows.length} sample rows)</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* Left: Data Table */}
        <div className="border-r border-zinc-800 overflow-auto max-h-[300px]">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="sticky top-0 bg-zinc-800">
                <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">Player</th>
                <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">Pitch</th>
                <th className="px-3 py-1.5 text-left text-zinc-400 font-semibold">Date</th>
                <th className="px-3 py-1.5 text-right text-zinc-400 font-semibold">Velo</th>
                <th className="px-3 py-1.5 text-right text-emerald-400 font-semibold">Model Value</th>
              </tr>
            </thead>
            <tbody>
              {sampleRows.slice(0, 50).map((row: any, i: number) => (
                <tr key={i} className="border-t border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-3 py-1 text-zinc-300 whitespace-nowrap">{row.player_name}</td>
                  <td className="px-3 py-1 text-zinc-400 whitespace-nowrap">{row.pitch_name}</td>
                  <td className="px-3 py-1 text-zinc-500 font-mono whitespace-nowrap">{row.game_date}</td>
                  <td className="px-3 py-1 text-zinc-400 font-mono text-right">{row.release_speed?.toFixed?.(1) ?? '\u2014'}</td>
                  <td className="px-3 py-1 text-emerald-400 font-mono text-right font-semibold">{fmt(row.model_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right: Histogram */}
        <div className="h-[300px] p-2">
          {values.length > 0 ? (
            <Plot
              data={[{
                x: values,
                type: 'histogram',
                nbinsx: 30,
                marker: { color: '#10b981', line: { color: '#059669', width: 1 } },
                hovertemplate: 'Value: %{x:.2f}<br>Count: %{y}<extra></extra>'
              }]}
              layout={{
                paper_bgcolor: 'transparent',
                plot_bgcolor: COLORS.bg,
                font: { color: COLORS.text, size: 10 },
                margin: { t: 10, r: 15, b: 35, l: 40 },
                xaxis: { title: { text: 'Model Value', font: { size: 10 } }, gridcolor: '#27272a', zeroline: false },
                yaxis: { title: { text: 'Count', font: { size: 10 } }, gridcolor: '#27272a', zeroline: false },
                autosize: true,
                bargap: 0.05,
              }}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm">No valid numeric values</div>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-0 border-t border-zinc-800">
        {[
          { label: 'Mean', value: stats.mean },
          { label: 'Std Dev', value: stats.stddev },
          { label: 'Min', value: stats.min },
          { label: 'Max', value: stats.max },
        ].map(s => (
          <div key={s.label} className="px-4 py-2 border-r border-zinc-800 last:border-r-0 text-center">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{s.label}</div>
            <div className="text-sm font-mono text-white font-semibold">{fmt(s.value)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
