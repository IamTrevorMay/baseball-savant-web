'use client'
import { useState, useMemo } from 'react'
import Plot from '../PlotWrapper'
import { BASE_LAYOUT, COLORS, getPitchColor } from '../chartConfig'

interface Props { data: any[] }

type SplitMode = 'all' | 'count' | 'pitch_type' | 'stand' | 'inning' | 'outs'
type VizMode = 'heatmap' | 'scatter' | 'zone_grid'
type MetricMode = 'frequency' | 'ba' | 'slg' | 'woba' | 'xba' | 'xwoba' | 'xslg' | 'ev' | 'la' | 'whiff_pct'

const COUNTS = [
  ['0-0','0-1','0-2'],
  ['1-0','1-1','1-2'],
  ['2-0','2-1','2-2'],
  ['3-0','3-1','3-2'],
]

const METRIC_LABELS: Record<MetricMode, string> = {
  frequency: 'Pitch Frequency',
  ba: 'Batting Average',
  slg: 'Slugging',
  woba: 'wOBA',
  xba: 'xBA',
  xwoba: 'xwOBA',
  xslg: 'xSLG',
  ev: 'Exit Velocity',
  la: 'Launch Angle',
  whiff_pct: 'Whiff %',
}

const ZONE_SHAPES = [
  { type: 'rect' as const, x0: -0.708, x1: 0.708, y0: 1.5, y1: 3.5, line: { color: '#ffffff', width: 2 } },
  { type: 'line' as const, x0: -0.236, x1: -0.236, y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'line' as const, x0: 0.236, x1: 0.236, y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'line' as const, x0: -0.708, x1: 0.708, y0: 2.167, y1: 2.167, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'line' as const, x0: -0.708, x1: 0.708, y0: 2.833, y1: 2.833, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'path' as const, path: 'M -0.708 0.15 L 0 0 L 0.708 0.15', line: { color: 'rgba(255,255,255,0.3)', width: 2 } },
]

// TruMedia-style blue-to-red colorscale
const BLUE_RED_SCALE: [number, string][] = [
  [0,"#2166ac"],[0.1,"#3388b8"],[0.2,"#4ba8c4"],[0.25,"#6cc4a0"],
  [0.35,"#98d478"],[0.45,"#c8e64a"],[0.55,"#f0e830"],[0.65,"#f5c020"],
  [0.75,"#f09015"],[0.85,"#e06010"],[0.95,"#c42a0c"],[1,"#9e0000"],
]

function calcMetric(pitches: any[], metric: MetricMode): number | null {
  if (pitches.length === 0) return null
  switch (metric) {
    case 'frequency': return pitches.length
    case 'ba': {
      const abs = pitches.filter(p => p.events && !['walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf'].includes(p.events))
      const hits = abs.filter(p => ['single','double','triple','home_run'].includes(p.events))
      return abs.length > 0 ? hits.length / abs.length : null
    }
    case 'slg': {
      const abs = pitches.filter(p => p.events && !['walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf'].includes(p.events))
      if (abs.length === 0) return null
      const tb = abs.reduce((sum, p) => {
        if (p.events === 'single') return sum + 1
        if (p.events === 'double') return sum + 2
        if (p.events === 'triple') return sum + 3
        if (p.events === 'home_run') return sum + 4
        return sum
      }, 0)
      return tb / abs.length
    }
    case 'woba': {
      const vals = pitches.map(p => p.woba_value).filter((v: any) => v != null)
      return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null
    }
    case 'xba': {
      const vals = pitches.map(p => p.estimated_ba_using_speedangle).filter((v: any) => v != null)
      return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null
    }
    case 'xwoba': {
      const vals = pitches.map(p => p.estimated_woba_using_speedangle).filter((v: any) => v != null)
      return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null
    }
    case 'xslg': {
      const vals = pitches.map(p => p.estimated_slg_using_speedangle).filter((v: any) => v != null)
      return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null
    }
    case 'ev': {
      const vals = pitches.map(p => p.launch_speed).filter((v: any) => v != null)
      return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null
    }
    case 'la': {
      const vals = pitches.map(p => p.launch_angle).filter((v: any) => v != null)
      return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null
    }
    case 'whiff_pct': {
      const swings = pitches.filter(p => {
        const d = (p.description || '').toLowerCase()
        return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
      })
      const whiffs = pitches.filter(p => (p.description || '').toLowerCase().includes('swinging_strike'))
      return swings.length > 0 ? whiffs.length / swings.length : null
    }
    default: return null
  }
}

function fmtMetric(v: number | null, metric: MetricMode): string {
  if (v === null) return '—'
  if (metric === 'frequency') return String(v)
  if (['ba','slg','woba','xba','xwoba','xslg'].includes(metric)) return v.toFixed(3)
  if (metric === 'ev') return v.toFixed(1)
  if (metric === 'la') return v.toFixed(1) + '°'
  if (metric === 'whiff_pct') return (v * 100).toFixed(1) + '%'
  return v.toFixed(2)
}

function MiniHeatmap({ data, title, metric, size = 220 }: { data: any[]; title: string; metric: MetricMode; size?: number }) {
  const f = data.filter(d => d.plate_x != null && d.plate_z != null)

  if (f.length < 5) return (
    <div className="flex flex-col items-center">
      <span className="text-[11px] text-zinc-400 mb-1 font-medium">{title}</span>
      <div style={{ width: size, height: size }} className="bg-zinc-950 rounded border border-zinc-800 flex items-center justify-center">
        <span className="text-[10px] text-zinc-600">{f.length === 0 ? 'No data' : 'Too few pitches'}</span>
      </div>
    </div>
  )

  let trace: any
  if (metric === 'frequency') {
    trace = {
      x: f.map(d => d.plate_x), y: f.map(d => d.plate_z),
      type: 'histogram2dcontour',
      colorscale: BLUE_RED_SCALE,
      reversescale: false,
      ncontours: 20,
      contours: { coloring: 'heatmap' },
      line: { width: 0 },
      showscale: false,
      hovertemplate: '%{z:.0f} pitches<extra></extra>',
    }
  } else {
    // Bin the data and compute metric per bin
    const nbins = 12
    const xRange = [-2.2, 2.2], yRange = [-0.2, 4.5]
    const xStep = (xRange[1] - xRange[0]) / nbins
    const yStep = (yRange[1] - yRange[0]) / nbins
    const bins: any[][][] = Array.from({ length: nbins }, () => Array.from({ length: nbins }, () => []))

    f.forEach(d => {
      const xi = Math.min(Math.floor((d.plate_x - xRange[0]) / xStep), nbins - 1)
      const yi = Math.min(Math.floor((d.plate_z - yRange[0]) / yStep), nbins - 1)
      if (xi >= 0 && yi >= 0) bins[yi][xi].push(d)
    })

    const z = bins.map(row => row.map(cell => calcMetric(cell, metric)))
    const x = Array.from({ length: nbins }, (_, i) => xRange[0] + (i + 0.5) * xStep)
    const y = Array.from({ length: nbins }, (_, i) => yRange[0] + (i + 0.5) * yStep)

    const metricLabel = METRIC_LABELS[metric]
    trace = {
      x, y, z,
      type: 'heatmap',
      colorscale: BLUE_RED_SCALE,
      showscale: false,
      zsmooth: 'best',
      hoverongaps: false,
      hovertemplate: `${metricLabel}: %{z:.3f}<extra></extra>`,
    }
  }

  return (
    <div className="flex flex-col items-center">
      <span className="text-[11px] text-zinc-400 mb-1 font-medium">{title} <span className="text-zinc-600">({f.length})</span></span>
      <Plot
        data={[trace]}
        layout={{
          paper_bgcolor: 'transparent', plot_bgcolor: COLORS.bg,
          font: { ...BASE_LAYOUT.font },
          margin: { t: 5, r: 5, b: 5, l: 5 },
          xaxis: { range: [-2.2, 2.2], showticklabels: false, showgrid: false, zeroline: false, fixedrange: true },
          yaxis: { range: [-0.2, 4.5], showticklabels: false, showgrid: false, zeroline: false, scaleanchor: 'x', fixedrange: true },
          shapes: ZONE_SHAPES,
          width: size, height: size,
        }}
        style={{ width: size, height: size, minHeight: size }}
      />
    </div>
  )
}

function MiniScatter({ data, title, size = 220 }: { data: any[]; title: string; size?: number }) {
  const f = data.filter(d => d.plate_x != null && d.plate_z != null)
  if (f.length === 0) return (
    <div className="flex flex-col items-center">
      <span className="text-[11px] text-zinc-400 mb-1 font-medium">{title}</span>
      <div style={{ width: size, height: size }} className="bg-zinc-950 rounded border border-zinc-800 flex items-center justify-center">
        <span className="text-[10px] text-zinc-600">No data</span>
      </div>
    </div>
  )

  const groups: Record<string, any[]> = {}
  f.forEach(d => { const k = d.pitch_name || 'Unknown'; if (!groups[k]) groups[k] = []; groups[k].push(d) })

  const traces = Object.entries(groups).map(([name, pts]) => ({
    x: pts.map(d => d.plate_x), y: pts.map(d => d.plate_z),
    type: 'scatter' as any, mode: 'markers',
    marker: { size: 3.5, color: getPitchColor(name), opacity: 0.5 },
    name, hovertemplate: `${name}<br>X: %{x:.2f} ft<br>Z: %{y:.2f} ft<extra></extra>`,
  }))

  return (
    <div className="flex flex-col items-center">
      <span className="text-[11px] text-zinc-400 mb-1 font-medium">{title} <span className="text-zinc-600">({f.length})</span></span>
      <Plot
        data={traces}
        layout={{
          paper_bgcolor: 'transparent', plot_bgcolor: COLORS.bg,
          font: { ...BASE_LAYOUT.font },
          margin: { t: 5, r: 5, b: 5, l: 5 },
          xaxis: { range: [-2.2, 2.2], showticklabels: false, showgrid: false, zeroline: false, fixedrange: true },
          yaxis: { range: [-0.2, 4.5], showticklabels: false, showgrid: false, zeroline: false, scaleanchor: 'x', fixedrange: true },
          shapes: ZONE_SHAPES, showlegend: false,
          width: size, height: size,
        }}
        style={{ width: size, height: size, minHeight: size }}
      />
    </div>
  )
}

function ZoneGrid({ data, title, metric }: { data: any[]; title: string; metric: MetricMode }) {
  const f = data.filter(d => d.zone != null && d.zone >= 1 && d.zone <= 14)
  const total = f.length || 1

  const zones: Record<number, any[]> = {}
  f.forEach(d => { if (!zones[d.zone]) zones[d.zone] = []; zones[d.zone].push(d) })

  const zoneVal = (z: number) => {
    const p = zones[z] || []
    return { val: calcMetric(p, metric), count: p.length }
  }

  // Get all zone values for color scaling
  const allVals = Array.from({ length: 14 }, (_, i) => zoneVal(i + 1).val).filter((v): v is number => v !== null)
  const minVal = allVals.length ? Math.min(...allVals) : 0
  const maxVal = allVals.length ? Math.max(...allVals) : 1
  const range = maxVal - minVal || 1

  const cellColor = (val: number | null) => {
    if (val === null) return "rgba(39,39,42,0.5)"
    const pct = Math.max(0, Math.min(1, (val - minVal) / range))
    const stops = [
      [0,"#2166ac"],[0.2,"#4ba8c4"],[0.35,"#6cc4a0"],[0.45,"#98d478"],
      [0.55,"#c8e64a"],[0.65,"#f0e830"],[0.75,"#f5c020"],[0.85,"#f09015"],
      [0.95,"#e06010"],[1,"#9e0000"]
    ] as [number, string][]
    let lo = stops[0], hi = stops[stops.length - 1]
    for (let i = 0; i < stops.length - 1; i++) {
      if (pct >= stops[i][0] && pct <= stops[i+1][0]) { lo = stops[i]; hi = stops[i+1]; break }
    }
    const t = (pct - lo[0]) / (hi[0] - lo[0] || 1)
    const parse = (hex: string) => [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)]
    const [r1,g1,b1] = parse(lo[1]), [r2,g2,b2] = parse(hi[1])
    const r = Math.round(r1 + t * (r2 - r1)), g = Math.round(g1 + t * (g2 - g1)), b = Math.round(b1 + t * (b2 - b1))
    return `rgba(${r},${g},${b},0.8)`
  }

  const grid = [[1,2,3],[4,5,6],[7,8,9]]

  return (
    <div className="flex flex-col items-center">
      <span className="text-[11px] text-zinc-400 mb-2 font-medium">{title} <span className="text-zinc-600">({f.length})</span></span>
      <div className="grid grid-cols-3 gap-px bg-zinc-800 rounded overflow-hidden" style={{ width: 210 }}>
        {grid.flat().map(z => {
          const { val, count } = zoneVal(z)
          return (
            <div key={z} className="p-2 text-center" style={{ backgroundColor: cellColor(val) }}>
              <div className="text-[11px] font-mono text-white font-bold">{fmtMetric(val, metric)}</div>
              <div className="text-[9px] text-zinc-300 opacity-70">{count} p</div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-px mt-px" style={{ width: 210 }}>
        {[11,12,13,14].map(z => {
          const { val, count } = zoneVal(z)
          return (
            <div key={z} className="p-1.5 text-center flex-1" style={{ backgroundColor: cellColor(val) }}>
              <div className="text-[10px] font-mono text-zinc-200">{fmtMetric(val, metric)}</div>
              <div className="text-[8px] text-zinc-400">{count}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const VizComponent = ({ data, title, mode, metric, size }: {
  data: any[]; title: string; mode: VizMode; metric: MetricMode; size?: number
}) => {
  if (mode === 'heatmap') return <MiniHeatmap data={data} title={title} metric={metric} size={size} />
  if (mode === 'scatter') return <MiniScatter data={data} title={title} size={size} />
  return <ZoneGrid data={data} title={title} metric={metric} />
}

export default function LocationTab({ data }: Props) {
  const [split, setSplit] = useState<SplitMode>('count')
  const [viz, setViz] = useState<VizMode>('heatmap')
  const [metric, setMetric] = useState<MetricMode>('frequency')

  const pitchTypes = useMemo(() => [...new Set(data.map(d => d.pitch_name).filter(Boolean))].sort(), [data])
  const f = useMemo(() => data.filter(d => d.plate_x != null && d.plate_z != null), [data])

  const metricRange = useMemo(() => {
    if (metric === "frequency") {
      return { min: "0", max: f.length.toLocaleString() }
    }
    const nbins = 12
    const xR = [-2.2, 2.2], yR = [-0.2, 4.5]
    const xS = (xR[1]-xR[0])/nbins, yS = (yR[1]-yR[0])/nbins
    const bins: any[][][] = Array.from({length:nbins}, () => Array.from({length:nbins}, () => []))
    f.forEach(d => {
      const xi = Math.min(Math.floor((d.plate_x-xR[0])/xS), nbins-1)
      const yi = Math.min(Math.floor((d.plate_z-yR[0])/yS), nbins-1)
      if (xi >= 0 && yi >= 0) bins[yi][xi].push(d)
    })
    const vals = bins.flat().map(cell => calcMetric(cell, metric)).filter((v): v is number => v !== null)
    if (vals.length === 0) return { min: "—", max: "—" }
    const mn = Math.min(...vals), mx = Math.max(...vals)
    return { min: fmtMetric(mn, metric), max: fmtMetric(mx, metric) }
  }, [f, metric])

  function filterByCount(balls: number, strikes: number) {
    return f.filter(d => d.balls === balls && d.strikes === strikes)
  }

  const splitOptions: [SplitMode, string][] = [
    ['all', 'All Pitches'], ['count', 'Count'], ['pitch_type', 'Pitch Type'],
    ['stand', 'Batter Side'], ['inning', 'Inning'], ['outs', 'Outs'],
  ]
  const vizOptions: [VizMode, string][] = [
    ['heatmap', 'Heatmap'], ['scatter', 'Scatter'], ['zone_grid', 'Zone Grid'],
  ]
  const metricOptions: [MetricMode, string][] = [
    ['frequency', 'Frequency'], ['ba', 'BA'], ['slg', 'SLG'], ['woba', 'wOBA'],
    ['xba', 'xBA'], ['xwoba', 'xwOBA'], ['xslg', 'xSLG'],
    ['ev', 'Exit Velo'], ['la', 'Launch Angle'], ['whiff_pct', 'Whiff %'],
  ]

  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-3 space-y-3">
        <div className="flex items-center gap-6 flex-wrap">
          {/* Split By */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Split By</span>
            <div className="flex gap-1">
              {splitOptions.map(([k, l]) => (
                <button key={k} onClick={() => setSplit(k)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                    split === k ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          {/* Display Mode */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Display</span>
            <div className="flex gap-1">
              {vizOptions.map(([k, l]) => (
                <button key={k} onClick={() => setViz(k)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                    viz === k ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}>{l}</button>
              ))}
            </div>
          </div>
          {/* Metric */}
          {viz !== 'scatter' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">Metric</span>
              <select value={metric} onChange={e => setMetric(e.target.value as MetricMode)}
                className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-white focus:border-emerald-600 focus:outline-none">
                {metricOptions.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          )}
          <span className="text-[11px] text-zinc-600 ml-auto">{f.length.toLocaleString()} pitches</span>
        </div>
      </div>

      {/* Spectrum Legend */}
      {viz !== "scatter" && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-2 flex items-center gap-3">
          <span className="text-[11px] text-white font-mono font-medium">{metricRange.min}</span>
          <div className="flex-1 h-3 rounded-full" style={{
            background: "linear-gradient(to right, #2166ac, #4ba8c4, #6cc4a0, #98d478, #c8e64a, #f0e830, #f5c020, #f09015, #e06010, #c42a0c, #9e0000)"
          }} />
          <span className="text-[11px] text-white font-mono font-medium">{metricRange.max}</span>
          <span className="text-[11px] text-zinc-600 ml-2">{METRIC_LABELS[metric]}</span>
        </div>
      )}

      {/* Visualization Grid */}
      {split === 'all' && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 flex justify-center">
          <VizComponent data={f} title="All Pitches" mode={viz} metric={metric} size={400} />
        </div>
      )}

      {split === 'count' && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 justify-items-center">
            {COUNTS.flat().map(c => {
              const [b, s] = c.split('-').map(Number)
              return <VizComponent key={c} data={filterByCount(b, s)} title={c} mode={viz} metric={metric} />
            })}
          </div>
        </div>
      )}

      {split === 'pitch_type' && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 justify-items-center">
            {pitchTypes.map(pt => (
              <VizComponent key={pt} data={f.filter(d => d.pitch_name === pt)} title={pt} mode={viz} metric={metric} />
            ))}
          </div>
        </div>
      )}

      {split === 'stand' && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 justify-items-center">
            <VizComponent data={f.filter(d => d.stand === 'L')} title="vs LHH" mode={viz} metric={metric} size={320} />
            <VizComponent data={f.filter(d => d.stand === 'R')} title="vs RHH" mode={viz} metric={metric} size={320} />
          </div>
        </div>
      )}

      {split === 'inning' && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 justify-items-center">
            {Array.from({ length: 9 }, (_, i) => i + 1).map(inn => {
              const innData = f.filter(d => d.inning === inn)
              if (innData.length === 0) return null
              return <VizComponent key={inn} data={innData} title={`Inning ${inn}`} mode={viz} metric={metric} />
            })}
          </div>
        </div>
      )}

      {split === 'outs' && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 justify-items-center">
            {[0, 1, 2].map(o => (
              <VizComponent key={o} data={f.filter(d => d.outs_when_up === o)} title={`${o} Outs`} mode={viz} metric={metric} size={280} />
            ))}
          </div>
        </div>
      )}

      {viz === 'scatter' && (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-2 flex flex-wrap gap-3">
          {pitchTypes.map(pt => (
            <div key={pt} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getPitchColor(pt) }} />
              <span className="text-[11px] text-zinc-400">{pt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
