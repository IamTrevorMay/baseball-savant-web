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

interface PitchStats {
  name: string
  color: string
  count: number
  points: { x: number; y: number }[]
  meanX: number
  meanY: number
  stdX: number
  stdY: number
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function generateEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  nPoints = 50
): { x: number[]; y: number[] } {
  const x: number[] = []
  const y: number[] = []
  for (let i = 0; i <= nPoints; i++) {
    const theta = (2 * Math.PI * i) / nPoints
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

export default function ArsenalOverlay({
  data,
  playerName,
  quality,
  containerRef,
}: TemplateProps) {
  const traces = useMemo(() => {
    const sampled = sampleData(
      data.filter(d => d.pfx_x != null && d.pfx_z != null && d.pitch_name),
      quality.maxPitches
    )

    if (!sampled.length) return []

    // Build per-pitch-type stats
    const typeMap = new Map<string, any[]>()
    for (const d of sampled) {
      const key = d.pitch_name as string
      if (!typeMap.has(key)) typeMap.set(key, [])
      typeMap.get(key)!.push(d)
    }

    // Sort by usage descending
    const sorted = [...typeMap.entries()].sort((a, b) => b[1].length - a[1].length)

    const pitchStats: PitchStats[] = sorted.map(([name, pitches]) => {
      const xVals = pitches.map(d => (d.pfx_x as number) * 12)
      const yVals = pitches.map(d => (d.pfx_z as number) * 12)
      const meanX = xVals.reduce((a, b) => a + b, 0) / xVals.length
      const meanY = yVals.reduce((a, b) => a + b, 0) / yVals.length
      return {
        name,
        color: getPitchColor(name),
        count: pitches.length,
        points: xVals.map((x, i) => ({ x, y: yVals[i] })),
        meanX,
        meanY,
        stdX: stdDev(xVals),
        stdY: stdDev(yVals),
      }
    })

    const allTraces: any[] = []

    for (const ps of pitchStats) {
      // Scatter trace for this pitch type
      allTraces.push({
        x: ps.points.map(p => p.x),
        y: ps.points.map(p => p.y),
        customdata: ps.points.map(() => [ps.name, ps.count]),
        type: 'scatter' as any,
        mode: 'markers' as any,
        name: `${ps.name} (${ps.count})`,
        legendgroup: ps.name,
        showlegend: true,
        marker: {
          color: ps.color,
          size: 4,
          opacity: 0.5,
          line: { width: 0 },
        },
        hovertemplate:
          '%{customdata[0]}<br>' +
          'HB: %{x:.1f} in<br>' +
          'IVB: %{y:.1f} in<extra></extra>',
      })

      // Ellipse trace (1-sigma spread)
      if (ps.stdX > 0 && ps.stdY > 0) {
        const ellipse = generateEllipse(ps.meanX, ps.meanY, ps.stdX, ps.stdY, 60)
        allTraces.push({
          x: ellipse.x,
          y: ellipse.y,
          type: 'scatter' as any,
          mode: 'lines' as any,
          name: ps.name,
          legendgroup: ps.name,
          showlegend: false,
          line: {
            color: ps.color,
            width: 1.5,
            dash: 'dash',
          },
          hoverinfo: 'skip' as any,
        })

        // Mean crosshair marker
        allTraces.push({
          x: [ps.meanX],
          y: [ps.meanY],
          type: 'scatter' as any,
          mode: 'markers' as any,
          name: ps.name,
          legendgroup: ps.name,
          showlegend: false,
          marker: {
            color: ps.color,
            size: 8,
            symbol: 'cross',
            opacity: 0.9,
            line: { width: 1.5, color: '#000' },
          },
          customdata: [[ps.name, ps.meanX, ps.meanY, ps.stdX, ps.stdY]],
          hovertemplate:
            '%{customdata[0]} mean<br>' +
            'HB: %{customdata[1]:.1f} in<br>' +
            'IVB: %{customdata[2]:.1f} in<br>' +
            '\u03c3x: %{customdata[3]:.1f}, \u03c3y: %{customdata[4]:.1f}<extra></extra>',
        })
      }
    }

    return allTraces
  }, [data, quality.maxPitches])

  if (!traces.length) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
        No movement data
      </div>
    )
  }

  const layout = {
    ...BASE_LAYOUT,
    title: {
      text: `${playerName} Arsenal Overlay`,
      font: { size: 14, color: COLORS.textLight },
    },
    xaxis: {
      ...BASE_LAYOUT.xaxis,
      title: 'Horizontal Break (in)',
      zeroline: true,
      zerolinecolor: '#52525b',
      zerolinewidth: 1.5,
    },
    yaxis: {
      ...BASE_LAYOUT.yaxis,
      title: 'Induced Vertical Break (in)',
      zeroline: true,
      zerolinecolor: '#52525b',
      zerolinewidth: 1.5,
    },
    legend: {
      ...BASE_LAYOUT.legend,
      x: 1,
      xanchor: 'right' as const,
      y: 1,
      itemsizing: 'constant' as const,
    },
    margin: { t: 45, r: 130, b: 50, l: 60 },
    annotations: [
      {
        x: 0.5,
        y: -0.1,
        xref: 'paper' as const,
        yref: 'paper' as const,
        text: 'Dashed ellipse = 1\u03c3 spread \u2022 Cross = mean',
        font: { size: 9, color: COLORS.text },
        showarrow: false,
      },
    ],
  }

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col" style={{ background: COLORS.bg }}>
      <div className="flex-1 min-h-0">
        <Plot
          data={traces}
          layout={layout}
          config={{
            displaylogo: false,
            modeBarButtonsToRemove: ['lasso2d', 'select2d', 'toImage'],
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
