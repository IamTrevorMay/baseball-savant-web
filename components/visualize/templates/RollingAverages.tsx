'use client'
import { useMemo, useState, RefObject } from 'react'
import Plot from '@/components/PlotWrapper'
import { BASE_LAYOUT, COLORS, getPitchColor } from '@/components/chartConfig'
import { QualityPreset } from '@/lib/qualityPresets'

interface TemplateProps {
  data: any[]
  playerName: string
  quality: QualityPreset
  containerRef: RefObject<HTMLDivElement>
  onFrameUpdate?: (frame: number, total: number) => void
}

type Metric = 'release_speed' | 'release_spin_rate' | 'pfx_z_in' | 'pfx_x_in' | 'vaa' | 'release_extension'

const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: 'release_speed', label: 'Velocity', unit: 'mph' },
  { id: 'release_spin_rate', label: 'Spin Rate', unit: 'rpm' },
  { id: 'pfx_z_in', label: 'Induced Vertical Break', unit: 'in' },
  { id: 'pfx_x_in', label: 'Horizontal Break (+ → 1B)', unit: 'in' },
  { id: 'vaa', label: 'Vertical Approach Angle', unit: '°' },
  { id: 'release_extension', label: 'Extension', unit: 'ft' },
]

const WINDOWS = [5, 10, 20, 50]

function rollingAvg(values: (number | null)[], window: number): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1)
    const slice = values.slice(start, i + 1).filter(v => v != null) as number[]
    result.push(slice.length >= Math.min(3, window) ? slice.reduce((a, b) => a + b, 0) / slice.length : null)
  }
  return result
}

export default function RollingAverages({ data, playerName, quality }: TemplateProps) {
  const [metric, setMetric] = useState<Metric>('release_speed')
  const [window, setWindow] = useState(20)

  const traces = useMemo(() => {
    // Sort by game_date ascending
    const sorted = [...data].sort((a, b) => {
      const da = a.game_date || ''
      const db = b.game_date || ''
      return da < db ? -1 : da > db ? 1 : 0
    })

    const metricDef = METRICS.find(m => m.id === metric)!

    // Group by pitch type
    const typeMap = new Map<string, any[]>()
    for (const d of sorted) {
      if (!d.pitch_name || d[metric] == null) continue
      const key = d.pitch_name as string
      if (!typeMap.has(key)) typeMap.set(key, [])
      typeMap.get(key)!.push(d)
    }

    // Sort by count descending
    const types = [...typeMap.entries()].sort((a, b) => b[1].length - a[1].length)
    const allTraces: any[] = []

    for (const [name, pitches] of types) {
      if (pitches.length < 3) continue
      const values = pitches.map((d: any) => d[metric] as number | null)
      const dates = pitches.map((d: any) => d.game_date as string)
      const rolling = rollingAvg(values, window)
      const color = getPitchColor(name)

      // Build x-axis as sequential index with date hover
      allTraces.push({
        x: dates,
        y: rolling,
        type: 'scatter' as any,
        mode: 'lines' as any,
        name: `${name} (${pitches.length})`,
        line: { color, width: 2 },
        hovertemplate: `${name}<br>%{x}<br>${metricDef.label}: %{y:.1f} ${metricDef.unit}<extra></extra>`,
        connectgaps: true,
      })
    }

    return allTraces
  }, [data, metric, window])

  const metricDef = METRICS.find(m => m.id === metric)!

  const layout = {
    ...BASE_LAYOUT,
    title: {
      text: `${playerName} — Rolling ${metricDef.label} (${window}-pitch window)`,
      font: { size: 14, color: COLORS.textLight },
    },
    xaxis: {
      ...BASE_LAYOUT.xaxis,
      title: 'Game Date',
      type: 'date' as any,
    },
    yaxis: {
      ...BASE_LAYOUT.yaxis,
      title: `${metricDef.label} (${metricDef.unit})`,
    },
    legend: { ...BASE_LAYOUT.legend, x: 1, xanchor: 'right' as const, y: 1 },
    margin: { t: 50, r: 130, b: 50, l: 60 },
  }

  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: COLORS.bg }}>
      {/* Controls */}
      <div className="flex items-center gap-4 px-4 py-2 shrink-0 border-b border-zinc-800">
        <label className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Metric</span>
          <select
            value={metric}
            onChange={e => setMetric(e.target.value as Metric)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200
              focus:outline-none focus:border-cyan-600/50 transition cursor-pointer"
          >
            {METRICS.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Window</span>
          <div className="flex gap-1">
            {WINDOWS.map(w => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`px-2 py-0.5 rounded text-[11px] border transition ${
                  window === w
                    ? 'bg-cyan-600/20 border-cyan-600/50 text-cyan-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </label>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        {traces.length > 0 ? (
          <Plot data={traces} layout={layout}
            config={{ displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d', 'toImage'] }}
            style={{ width: '100%', height: '100%' }} />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            No data for selected metric
          </div>
        )}
      </div>
    </div>
  )
}
