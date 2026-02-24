'use client'
import { useMemo, useState, RefObject } from 'react'
import Plot from '@/components/PlotWrapper'
import { BASE_LAYOUT, COLORS } from '@/components/chartConfig'
import { QualityPreset } from '@/lib/qualityPresets'

interface TemplateProps {
  data: any[]
  playerName: string
  quality: QualityPreset
  containerRef: RefObject<HTMLDivElement>
  onFrameUpdate?: (frame: number, total: number) => void
}

type MetricKey = 'density' | 'ba' | 'xwoba' | 'ev' | 'whiff' | 'called_strike'

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: 'density',      label: 'Density' },
  { key: 'ba',           label: 'BA' },
  { key: 'xwoba',        label: 'xwOBA' },
  { key: 'ev',           label: 'EV' },
  { key: 'whiff',        label: 'Whiff%' },
  { key: 'called_strike', label: 'Called Strike%' },
]

const ZONE_SHAPES = [
  { type: 'rect' as const, x0: -0.708, x1: 0.708, y0: 1.5, y1: 3.5, line: { color: '#ffffff', width: 2 } },
  { type: 'rect' as const, x0: -0.708, x1: 0.708, y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.1)', width: 1 }, fillcolor: 'rgba(255,255,255,0.03)' },
  { type: 'line' as const, x0: -0.236, x1: -0.236, y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'line' as const, x0: 0.236,  x1: 0.236,  y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'line' as const, x0: -0.708, x1: 0.708, y0: 2.167, y1: 2.167, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'line' as const, x0: -0.708, x1: 0.708, y0: 2.833, y1: 2.833, line: { color: 'rgba(255,255,255,0.15)', width: 1 } },
  { type: 'path' as const, path: 'M -0.708 0.15 L 0 0 L 0.708 0.15', line: { color: 'rgba(255,255,255,0.3)', width: 2 } },
]

const NB = 20
const X_RANGE: [number, number] = [-2.2, 2.2]
const Y_RANGE: [number, number] = [-0.2, 4.5]
const X_STEP = (X_RANGE[1] - X_RANGE[0]) / NB
const Y_STEP = (Y_RANGE[1] - Y_RANGE[0]) / NB

function buildBins(pitches: any[]): any[][][] {
  const bins: any[][][] = Array.from({ length: NB }, () =>
    Array.from({ length: NB }, () => [])
  )
  for (const d of pitches) {
    if (d.plate_x == null || d.plate_z == null) continue
    const xi = Math.min(Math.max(Math.floor((d.plate_x - X_RANGE[0]) / X_STEP), 0), NB - 1)
    const yi = Math.min(Math.max(Math.floor((d.plate_z - Y_RANGE[0]) / Y_STEP), 0), NB - 1)
    bins[yi][xi].push(d)
  }
  return bins
}

function calcBinValue(cell: any[], metric: MetricKey): number | null {
  if (!cell.length) return null
  switch (metric) {
    case 'ba': {
      const ab = cell.filter(p => p.events && !['walk', 'hit_by_pitch', 'sac_fly', 'sac_bunt', 'catcher_interf'].includes(p.events))
      const h  = ab.filter(p => ['single', 'double', 'triple', 'home_run'].includes(p.events))
      return ab.length ? h.length / ab.length : null
    }
    case 'xwoba': {
      const v = cell.map(p => p.estimated_woba_using_speedangle).filter((x: any) => x != null) as number[]
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
    }
    case 'ev': {
      const v = cell.map(p => p.launch_speed).filter((x: any) => x != null) as number[]
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
    }
    case 'whiff': {
      const swings = cell.filter(p => {
        const d = (p.description || '').toLowerCase()
        return d.includes('swinging_strike') || d.includes('foul') || d.includes('hit_into_play') || d.includes('foul_tip')
      })
      const whiffs = cell.filter(p => (p.description || '').toLowerCase().includes('swinging_strike'))
      return swings.length ? whiffs.length / swings.length : null
    }
    case 'called_strike': {
      const takes = cell.filter(p => {
        const d = (p.description || '').toLowerCase()
        return d === 'called_strike' || d === 'ball' || d === 'blocked_ball' || d === 'pitchout'
      })
      const cs = takes.filter(p => (p.description || '').toLowerCase() === 'called_strike')
      return takes.length ? cs.length / takes.length : null
    }
    default:
      return null
  }
}

function neighborFill(z: (number | null)[][]): (number | null)[][] {
  const result = z.map(row => [...row])
  for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r < NB; r++) {
      for (let c = 0; c < NB; c++) {
        if (result[r][c] !== null) continue
        const neighbors: number[] = []
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue
            const nr = r + dr, nc = c + dc
            if (nr >= 0 && nr < NB && nc >= 0 && nc < NB && result[nr][nc] !== null) {
              neighbors.push(result[nr][nc]!)
            }
          }
        }
        if (neighbors.length >= 2) {
          result[r][c] = neighbors.reduce((a, b) => a + b, 0) / neighbors.length
        }
      }
    }
  }
  return result
}

function getColorscale(metric: MetricKey): string | [number, string][] {
  if (metric === 'density' || metric === 'ev') return 'YlOrRd'
  if (metric === 'ba' || metric === 'xwoba') {
    // RdYlGn reversed: low = green (good for pitcher), high = red (bad for pitcher)
    return [
      [0, '#1a9850'], [0.25, '#91cf60'], [0.5, '#ffffbf'],
      [0.75, '#fc8d59'], [1, '#d73027'],
    ]
  }
  // Viridis-like for whiff / called strike
  return 'Viridis'
}

function formatMetricValue(v: number, metric: MetricKey): string {
  if (metric === 'density') return String(Math.round(v))
  if (metric === 'ev') return v.toFixed(1) + ' mph'
  if (metric === 'ba' || metric === 'xwoba') return v.toFixed(3)
  return (v * 100).toFixed(1) + '%'
}

export default function StrikeZoneHeatmapViz({
  data,
  playerName,
  quality,
  containerRef,
}: TemplateProps) {
  const [metric, setMetric] = useState<MetricKey>('density')

  const filtered = useMemo(
    () => data.filter(d => d.plate_x != null && d.plate_z != null),
    [data]
  )

  const { trace, zMin, zMax } = useMemo(() => {
    if (!filtered.length) return { trace: null, zMin: 0, zMax: 1 }

    if (metric === 'density') {
      const t = {
        x: filtered.map(d => d.plate_x),
        y: filtered.map(d => d.plate_z),
        type: 'histogram2d' as any,
        colorscale: 'YlOrRd',
        reversescale: false,
        nbinsx: NB,
        nbinsy: NB,
        colorbar: {
          tickfont: { color: COLORS.text, size: 9 },
          len: 0.8,
          thickness: 12,
        },
        hovertemplate: 'Count: %{z}<extra></extra>',
      }
      return { trace: t, zMin: 0, zMax: 1 }
    }

    const bins = buildBins(filtered)
    const rawZ: (number | null)[][] = bins.map(row => row.map(cell => calcBinValue(cell, metric)))
    const z = neighborFill(rawZ)

    const flatVals = z.flat().filter((v): v is number => v !== null)
    const zMinVal = flatVals.length ? Math.min(...flatVals) : 0
    const zMaxVal = flatVals.length ? Math.max(...flatVals) : 1

    const xCenters = Array.from({ length: NB }, (_, i) => X_RANGE[0] + (i + 0.5) * X_STEP)
    const yCenters = Array.from({ length: NB }, (_, i) => Y_RANGE[0] + (i + 0.5) * Y_STEP)

    const hoverZ = z.map(row =>
      row.map(v => (v !== null ? formatMetricValue(v, metric) : 'n/a'))
    )

    const t = {
      x: xCenters,
      y: yCenters,
      z,
      customdata: hoverZ,
      type: 'heatmap' as any,
      colorscale: getColorscale(metric),
      zmin: zMinVal,
      zmax: zMaxVal,
      zsmooth: 'best',
      connectgaps: true,
      hoverongaps: false,
      colorbar: {
        tickfont: { color: COLORS.text, size: 9 },
        len: 0.8,
        thickness: 12,
      },
      hovertemplate: `${METRIC_OPTIONS.find(m => m.key === metric)?.label}: %{customdata}<extra></extra>`,
    }

    return { trace: t, zMin: zMinVal, zMax: zMaxVal }
  }, [filtered, metric])

  if (!filtered.length) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
        No location data
      </div>
    )
  }

  const layout = {
    ...BASE_LAYOUT,
    title: {
      text: `${playerName} — ${METRIC_OPTIONS.find(m => m.key === metric)?.label} by Zone`,
      font: { size: 14, color: COLORS.textLight },
    },
    xaxis: {
      ...BASE_LAYOUT.xaxis,
      title: 'Horizontal (ft)',
      range: X_RANGE,
      scaleanchor: 'y',
      showgrid: false,
      zeroline: false,
    },
    yaxis: {
      ...BASE_LAYOUT.yaxis,
      title: 'Vertical (ft)',
      range: Y_RANGE,
      showgrid: false,
      zeroline: false,
    },
    shapes: ZONE_SHAPES,
    margin: { t: 45, r: 70, b: 45, l: 55 },
  }

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col" style={{ background: COLORS.bg }}>
      {/* Metric selector */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <span className="text-xs text-zinc-400 font-medium">Metric:</span>
        <select
          value={metric}
          onChange={e => setMetric(e.target.value as MetricKey)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
        >
          {METRIC_OPTIONS.map(opt => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
        <span className="text-xs text-zinc-500 ml-2">
          {filtered.length.toLocaleString()} pitches
        </span>
      </div>

      {/* Plot */}
      <div className="flex-1 min-h-0">
        {trace && (
          <Plot
            data={[trace]}
            layout={layout}
            config={{
              displaylogo: false,
              modeBarButtonsToRemove: ['lasso2d', 'select2d', 'toImage'],
            }}
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </div>
    </div>
  )
}
