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

type AxisKey =
  | 'release_speed'
  | 'release_spin_rate'
  | 'pfx_x_in'
  | 'pfx_z_in'
  | 'release_extension'
  | 'vaa'
  | 'haa'
  | 'plate_x'
  | 'plate_z'
  | 'spin_axis'
  | 'launch_speed'
  | 'launch_angle'
  | 'arm_angle'

interface AxisOption {
  key: AxisKey
  label: string
  unit?: string
  // raw field to pull from data (if different from key, e.g. pfx_x needs *12)
  field: string
  multiplier?: number
}

const AXIS_OPTIONS: AxisOption[] = [
  { key: 'release_speed',    label: 'Velocity',              unit: 'mph',  field: 'release_speed' },
  { key: 'release_spin_rate',label: 'Spin Rate',             unit: 'rpm',  field: 'release_spin_rate' },
  { key: 'pfx_x_in',        label: 'Horizontal Break (+ → 1B)',      unit: 'in',   field: 'pfx_x', multiplier: 12 },
  { key: 'pfx_z_in',        label: 'Induced Vertical Break', unit: 'in',   field: 'pfx_z', multiplier: 12 },
  { key: 'release_extension',label: 'Extension',             unit: 'ft',   field: 'release_extension' },
  { key: 'vaa',              label: 'VAA',                   unit: '\u00b0', field: 'vaa' },
  { key: 'haa',              label: 'HAA',                   unit: '\u00b0', field: 'haa' },
  { key: 'plate_x',         label: 'Plate X (+ → 1B)',               unit: 'ft',   field: 'plate_x' },
  { key: 'plate_z',         label: 'Plate Z',               unit: 'ft',   field: 'plate_z' },
  { key: 'spin_axis',        label: 'Spin Axis',             unit: '\u00b0', field: 'spin_axis' },
  { key: 'launch_speed',     label: 'Launch Speed',          unit: 'mph',  field: 'launch_speed' },
  { key: 'launch_angle',     label: 'Launch Angle',          unit: '\u00b0', field: 'launch_angle' },
  { key: 'arm_angle',        label: 'Arm Angle',             unit: '\u00b0', field: 'arm_angle' },
]

function getAxisOption(key: AxisKey): AxisOption {
  return AXIS_OPTIONS.find(a => a.key === key)!
}

function getFieldValue(d: any, opt: AxisOption): number | null {
  const raw = d[opt.field]
  if (raw == null) return null
  return opt.multiplier ? raw * opt.multiplier : raw
}

function sampleData(arr: any[], max: number): any[] {
  if (arr.length <= max) return arr
  const step = arr.length / max
  return Array.from({ length: max }, (_, i) => arr[Math.floor(i * step)])
}

export default function PitchCharacteristics({
  data,
  playerName,
  quality,
  containerRef,
}: TemplateProps) {
  const [xKey, setXKey] = useState<AxisKey>('pfx_x_in')
  const [yKey, setYKey] = useState<AxisKey>('pfx_z_in')

  const xOpt = getAxisOption(xKey)
  const yOpt = getAxisOption(yKey)

  const traces = useMemo(() => {
    const sampled = sampleData(data, quality.maxPitches)
    const pitchTypes = [...new Set(sampled.map(d => d.pitch_name).filter(Boolean))].sort() as string[]

    return pitchTypes.map(pt => {
      const pts = sampled.filter(d => d.pitch_name === pt)
      const xVals: number[] = []
      const yVals: number[] = []
      const dates: string[] = []

      for (const d of pts) {
        const xv = getFieldValue(d, xOpt)
        const yv = getFieldValue(d, yOpt)
        if (xv == null || yv == null) continue
        xVals.push(xv)
        yVals.push(yv)
        dates.push(d.game_date || '')
      }

      if (!xVals.length) return null

      return {
        x: xVals,
        y: yVals,
        customdata: dates,
        type: 'scatter' as any,
        mode: 'markers' as any,
        name: pt,
        marker: {
          color: getPitchColor(pt),
          size: 5,
          opacity: 0.6,
          line: { width: 0.5, color: 'rgba(0,0,0,0.2)' },
        },
        hovertemplate:
          `${pt}<br>` +
          `${xOpt.label}: %{x:.2f}${xOpt.unit ? ' ' + xOpt.unit : ''}<br>` +
          `${yOpt.label}: %{y:.2f}${yOpt.unit ? ' ' + yOpt.unit : ''}<br>` +
          `Date: %{customdata}<extra></extra>`,
      }
    }).filter(Boolean) as any[]
  }, [data, quality.maxPitches, xOpt, yOpt])

  const layout = {
    ...BASE_LAYOUT,
    title: {
      text: `${playerName} — Pitch Characteristics`,
      font: { size: 14, color: COLORS.textLight },
    },
    xaxis: {
      ...BASE_LAYOUT.xaxis,
      title: `${xOpt.label}${xOpt.unit ? ` (${xOpt.unit})` : ''}`,
      zeroline: xKey === 'pfx_x_in' || xKey === 'pfx_z_in',
      zerolinecolor: '#52525b',
      zerolinewidth: 1,
    },
    yaxis: {
      ...BASE_LAYOUT.yaxis,
      title: `${yOpt.label}${yOpt.unit ? ` (${yOpt.unit})` : ''}`,
      zeroline: yKey === 'pfx_x_in' || yKey === 'pfx_z_in',
      zerolinecolor: '#52525b',
      zerolinewidth: 1,
    },
    legend: {
      ...BASE_LAYOUT.legend,
      x: 1,
      xanchor: 'right' as const,
      y: 1,
    },
    margin: { t: 45, r: 120, b: 50, l: 60 },
  }

  const hasData = traces.length > 0

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col" style={{ background: COLORS.bg }}>
      {/* Axis selectors */}
      <div className="flex flex-wrap items-center gap-3 px-3 pt-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-400 font-medium">X:</span>
          <select
            value={xKey}
            onChange={e => setXKey(e.target.value as AxisKey)}
            className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
          >
            {AXIS_OPTIONS.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-400 font-medium">Y:</span>
          <select
            value={yKey}
            onChange={e => setYKey(e.target.value as AxisKey)}
            className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
          >
            {AXIS_OPTIONS.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-zinc-500">
          {Math.min(data.length, quality.maxPitches).toLocaleString()} pitches
        </span>
      </div>

      {/* Plot */}
      <div className="flex-1 min-h-0">
        {hasData ? (
          <Plot
            data={traces}
            layout={layout}
            config={{
              displaylogo: false,
              modeBarButtonsToRemove: ['lasso2d', 'select2d', 'toImage'],
            }}
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
            No data for selected metrics
          </div>
        )}
      </div>
    </div>
  )
}
