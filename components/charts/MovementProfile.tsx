'use client'
import { useMemo, useState } from 'react'
import Plot from '../PlotWrapper'
import { COLORS, getPitchColor } from '../chartConfig'
import { STUFF_ZSCORE_BASELINES } from '@/lib/leagueStats'
import { toPitcherX } from '@/lib/pitcherPerspective'
import ArmAngleGauge from './ArmAngleGauge'

interface Props {
  data: any[]
  seasonAvgArmAngle?: number | null
}

export default function MovementProfile({ data, seasonAvgArmAngle }: Props) {
  const filtered = data.filter(d => d.pfx_x != null && d.pfx_z != null && d.pitch_name)

  // Derive throwing hand from data (p_throws field on every pitch row)
  const throwHand: 'R' | 'L' = useMemo(() => {
    const hand = data.find(d => d.p_throws === 'L' || d.p_throws === 'R')?.p_throws
    return hand === 'L' ? 'L' : 'R'
  }, [data])

  const { traces, arsenal, avgArmAngle } = useMemo(() => {
    if (!filtered.length) return { traces: [], arsenal: [], avgArmAngle: null as number | null }

    const groups: Record<string, any[]> = {}
    filtered.forEach(d => {
      if (!groups[d.pitch_name]) groups[d.pitch_name] = []
      groups[d.pitch_name].push(d)
    })

    const total = filtered.length
    const pitchTypes = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)

    const traces = pitchTypes.map(([pt, pts]) => ({
      x: pts.map(d => toPitcherX(d.pfx_x) * 12),
      y: pts.map(d => d.pfx_z * 12),
      type: 'scatter' as any,
      mode: 'markers' as any,
      name: pt,
      marker: { color: getPitchColor(pt), size: 6, opacity: 0.5 },
      hovertemplate: `${pt}<br>HB: %{x:.1f}"<br>IVB: %{y:.1f}"<extra></extra>`,
    }))

    const arsenal = pitchTypes.map(([name, pts]) => {
      const velos = pts.map(p => p.release_speed).filter(Boolean)
      const avgVelo = velos.length ? velos.reduce((a, b) => a + b, 0) / velos.length : null
      const armAngles = pts.map(p => p.arm_angle).filter((v: any): v is number => v != null)
      const avgArm = armAngles.length ? armAngles.reduce((a: number, b: number) => a + b, 0) / armAngles.length : null
      const bl = STUFF_ZSCORE_BASELINES[name]
      return {
        name,
        color: getPitchColor(name),
        usage: ((pts.length / total) * 100).toFixed(1),
        mph: avgVelo != null ? avgVelo.toFixed(1) : '—',
        lgAvg: bl ? bl.avg_velo.toFixed(1) : '—',
        armAngle: avgArm != null ? avgArm.toFixed(1) : '—',
      }
    })

    // Overall average arm angle
    const allArmAngles = filtered.map(d => d.arm_angle).filter((v: any): v is number => v != null)
    const avgArmAngle = allArmAngles.length ? allArmAngles.reduce((a, b) => a + b, 0) / allArmAngles.length : null

    return { traces, arsenal, avgArmAngle }
  }, [filtered])

  const [gaugeHovered, setGaugeHovered] = useState(false)

  if (!filtered.length) return <div className="text-zinc-500 text-sm text-center py-10">No movement data</div>

  // Concentric circle shapes at 6", 12", 18", 24"
  const circleRadii = [6, 12, 18, 24]
  const circleShapes = circleRadii.map(r => ({
    type: 'circle' as const,
    xref: 'x' as const, yref: 'y' as const,
    x0: -r, y0: -r, x1: r, y1: r,
    line: { color: 'rgba(113,113,122,0.3)', width: 1, dash: 'dot' as const },
  }))

  // Cross-hair lines
  const crossHairs = [
    { type: 'line' as const, xref: 'x' as const, yref: 'y' as const, x0: -30, x1: 30, y0: 0, y1: 0, line: { color: 'rgba(113,113,122,0.4)', width: 1 } },
    { type: 'line' as const, xref: 'x' as const, yref: 'y' as const, x0: 0, x1: 0, y0: -30, y1: 30, line: { color: 'rgba(113,113,122,0.4)', width: 1 } },
  ]

  const layout = {
    paper_bgcolor: COLORS.paper,
    plot_bgcolor: COLORS.bg,
    font: { family: 'Inter, system-ui, sans-serif', color: COLORS.text, size: 11 },
    margin: { t: 10, r: 10, b: 10, l: 10 },
    xaxis: {
      range: [-28, 28], zeroline: false, showgrid: false,
      showticklabels: false, fixedrange: true,
    },
    yaxis: {
      range: [-28, 28], zeroline: false, showgrid: false,
      showticklabels: false, fixedrange: true, scaleanchor: 'x',
    },
    shapes: [...circleShapes, ...crossHairs, ...(() => {
      if (!gaugeHovered || avgArmAngle == null) return []
      const rad = (avgArmAngle * Math.PI) / 180
      const dir = throwHand === 'R' ? 1 : -1
      const dx = dir * Math.cos(rad)
      const dy = Math.sin(rad)
      // Scale to fill chart bounds (±28)
      const tX = Math.abs(dx) > 0.001 ? 28 / Math.abs(dx) : Infinity
      const tY = Math.abs(dy) > 0.001 ? 28 / Math.abs(dy) : Infinity
      const t = Math.min(tX, tY)
      return [{
        type: 'line' as const, xref: 'x' as const, yref: 'y' as const,
        x0: -dx * t, y0: -dy * t, x1: dx * t, y1: dy * t,
        line: { color: 'rgba(228,228,231,0.5)', width: 3 },
      }]
    })()],
    annotations: [
      { x: 0, y: 27, text: 'MORE RISE', showarrow: false, font: { size: 9, color: '#71717a' } },
      { x: 0, y: -27, text: 'MORE DROP', showarrow: false, font: { size: 9, color: '#71717a' } },
      { x: -26, y: 0, text: '← 1B', showarrow: false, font: { size: 9, color: '#71717a' } },
      { x: 26, y: 0, text: '3B →', showarrow: false, font: { size: 9, color: '#71717a' } },
    ],
    showlegend: false,
    height: 340,
    autosize: true,
    hoverlabel: { bgcolor: '#27272a', bordercolor: '#3f3f46', font: { color: '#e4e4e7', size: 11 } },
  }

  return (
    <div>
      <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Movement Profile</h3>
      <div className="relative">
        <Plot data={traces} layout={layout} config={{ displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d', 'zoom2d', 'pan2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d', 'resetScale2d'] }} />
        <div
          className={`absolute bottom-8 z-10 ${throwHand === 'R' ? 'right-2' : 'left-2'}`}
          onMouseEnter={() => setGaugeHovered(true)}
          onMouseLeave={() => setGaugeHovered(false)}
        >
          <ArmAngleGauge angle={avgArmAngle} seasonAngle={seasonAvgArmAngle} throwHand={throwHand} />
        </div>
      </div>

      {/* Arsenal Legend Table */}
      <table className="w-full text-[11px] mt-2">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="text-left py-1 font-medium">Pitch</th>
            <th className="text-right py-1 font-medium">Usage</th>
            <th className="text-right py-1 font-medium">MPH</th>
            <th className="text-right py-1 font-medium">Lg Avg</th>
            <th className="text-right py-1 font-medium">Arm°</th>
          </tr>
        </thead>
        <tbody>
          {arsenal.map(a => (
            <tr key={a.name} className="border-b border-zinc-800/30">
              <td className="py-1 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: a.color }} />
                <span className="text-zinc-200">{a.name}</span>
              </td>
              <td className="text-right text-zinc-400 font-mono py-1">{a.usage}%</td>
              <td className="text-right text-zinc-200 font-mono py-1">{a.mph}</td>
              <td className="text-right text-zinc-500 font-mono py-1">{a.lgAvg}</td>
              <td className="text-right text-zinc-400 font-mono py-1">{a.armAngle}°</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
