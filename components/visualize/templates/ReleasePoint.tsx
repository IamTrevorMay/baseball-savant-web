'use client'
import { useMemo, RefObject } from 'react'
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

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function generateEllipse(cx: number, cy: number, rx: number, ry: number, n = 50) {
  const x: number[] = []
  const y: number[] = []
  for (let i = 0; i <= n; i++) {
    const theta = (2 * Math.PI * i) / n
    x.push(cx + rx * Math.cos(theta))
    y.push(cy + ry * Math.sin(theta))
  }
  return { x, y }
}

function sampleData(arr: any[], max: number): any[] {
  if (arr.length <= max) return arr
  const step = arr.length / max
  return Array.from({ length: max }, (_, i) => arr[Math.floor(i * step)])
}

export default function ReleasePoint({ data, playerName, quality }: TemplateProps) {
  const traces = useMemo(() => {
    const valid = data.filter(d => d.release_pos_x != null && d.release_pos_z != null && d.pitch_name)
    const sampled = sampleData(valid, quality.maxPitches)
    if (!sampled.length) return []

    const typeMap = new Map<string, any[]>()
    for (const d of sampled) {
      const key = d.pitch_name as string
      if (!typeMap.has(key)) typeMap.set(key, [])
      typeMap.get(key)!.push(d)
    }

    const sorted = [...typeMap.entries()].sort((a, b) => b[1].length - a[1].length)
    const allTraces: any[] = []

    for (const [name, pitches] of sorted) {
      const xs = pitches.map((d: any) => d.release_pos_x as number)
      const zs = pitches.map((d: any) => d.release_pos_z as number)
      const color = getPitchColor(name)
      const meanX = xs.reduce((a: number, b: number) => a + b, 0) / xs.length
      const meanZ = zs.reduce((a: number, b: number) => a + b, 0) / zs.length
      const sdX = stdDev(xs)
      const sdZ = stdDev(zs)

      // Scatter
      allTraces.push({
        x: xs, y: zs,
        type: 'scatter' as any, mode: 'markers' as any,
        name: `${name} (${pitches.length})`,
        legendgroup: name, showlegend: true,
        marker: { color, size: 4, opacity: 0.45, line: { width: 0 } },
        hovertemplate: `${name}<br>X: %{x:.2f} ft<br>Z: %{y:.2f} ft<extra></extra>`,
      })

      // Ellipse
      if (sdX > 0 && sdZ > 0) {
        const ell = generateEllipse(meanX, meanZ, sdX, sdZ, 60)
        allTraces.push({
          x: ell.x, y: ell.y,
          type: 'scatter' as any, mode: 'lines' as any,
          name, legendgroup: name, showlegend: false,
          line: { color, width: 1.5, dash: 'dash' },
          hoverinfo: 'skip' as any,
        })

        // Mean crosshair
        allTraces.push({
          x: [meanX], y: [meanZ],
          type: 'scatter' as any, mode: 'markers' as any,
          name, legendgroup: name, showlegend: false,
          marker: { color, size: 10, symbol: 'cross', opacity: 0.9, line: { width: 1.5, color: '#000' } },
          customdata: [[name, meanX.toFixed(2), meanZ.toFixed(2), sdX.toFixed(3), sdZ.toFixed(3)]],
          hovertemplate: '%{customdata[0]} mean<br>X: %{customdata[1]} ft<br>Z: %{customdata[2]} ft<br>σx: %{customdata[3]}, σz: %{customdata[4]}<extra></extra>',
        })
      }
    }

    return allTraces
  }, [data, quality.maxPitches])

  if (!traces.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
        No release point data
      </div>
    )
  }

  const layout = {
    ...BASE_LAYOUT,
    title: {
      text: `${playerName} — Release Point Consistency`,
      font: { size: 14, color: COLORS.textLight },
    },
    xaxis: {
      ...BASE_LAYOUT.xaxis,
      title: 'Horizontal Release (ft) — Catcher View',
      zeroline: true, zerolinecolor: '#52525b', zerolinewidth: 1,
    },
    yaxis: {
      ...BASE_LAYOUT.yaxis,
      title: 'Vertical Release (ft)',
      zeroline: true, zerolinecolor: '#52525b', zerolinewidth: 1,
      scaleanchor: 'x' as any,
    },
    legend: { ...BASE_LAYOUT.legend, x: 1, xanchor: 'right' as const, y: 1, itemsizing: 'constant' as const },
    margin: { t: 45, r: 130, b: 50, l: 60 },
    annotations: [{
      x: 0.5, y: -0.1, xref: 'paper' as const, yref: 'paper' as const,
      text: 'Dashed ellipse = 1σ spread • Cross = mean • +x = toward 1B (catcher view)', font: { size: 9, color: COLORS.text }, showarrow: false,
    }],
  }

  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: COLORS.bg }}>
      <div className="flex-1 min-h-0">
        <Plot data={traces} layout={layout}
          config={{ displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d', 'toImage'] }}
          style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}
