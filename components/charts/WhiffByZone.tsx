'use client'
import Plot from '../PlotWrapper'
import { BASE_LAYOUT, COLORS } from '../chartConfig'

export default function WhiffByZone({ data }: { data: any[] }) {
  const f = data.filter(d => d.zone != null && d.description)
  if (!f.length) return <div className="text-zinc-500 text-sm text-center py-10">No zone data</div>

  const zones: Record<number, { swings: number; whiffs: number }> = {}
  f.forEach(d => {
    const z = Math.round(d.zone)
    if (z < 1 || z > 14) return
    if (!zones[z]) zones[z] = { swings: 0, whiffs: 0 }
    const desc = (d.description || '').toLowerCase()
    if (desc.includes('swing') || desc.includes('foul') || desc.includes('in play')) {
      zones[z].swings++
      if (desc.includes('swinging_strike') || desc.includes('missed')) zones[z].whiffs++
    }
  })

  const zonePos: Record<number, [number, number]> = {
    1:[-0.472,3.167],2:[0,3.167],3:[0.472,3.167],
    4:[-0.472,2.5],5:[0,2.5],6:[0.472,2.5],
    7:[-0.472,1.833],8:[0,1.833],9:[0.472,1.833],
    11:[-0.472,3.8],12:[0.472,3.8],
    13:[-0.472,1.1],14:[0.472,1.1],
  }

  const zX: number[] = [], zY: number[] = [], zColors: number[] = [], zText: string[] = []
  Object.entries(zones).forEach(([z, v]) => {
    const pos = zonePos[Number(z)]
    if (!pos || v.swings < 5) return
    const rate = v.whiffs / v.swings * 100
    zX.push(pos[0]); zY.push(pos[1]); zColors.push(rate)
    zText.push(rate.toFixed(1) + '%')
  })

  const trace = {
    x: zX, y: zY, text: zText,
    type: 'scatter' as any, mode: 'markers+text' as any,
    marker: {
      size: 50, color: zColors,
      colorscale: [[0,'#10b981'],[0.5,'#f59e0b'],[1,'#ef4444']],
      showscale: true,
      colorbar: { title: { text: 'Whiff%', font: { size: 10, color: COLORS.text } }, tickfont: { size: 9 }, len: 0.8 },
      line: { color: '#27272a', width: 1 },
    },
    textfont: { size: 10, color: '#fff' },
    textposition: 'middle center' as any,
    showlegend: false,
  }

  const layout = {
    ...BASE_LAYOUT,
    title: { text: 'Whiff Rate by Zone', font: { size: 14, color: COLORS.textLight } },
    xaxis: { ...BASE_LAYOUT.xaxis, title: '', range: [-1.5, 1.5], showgrid: false },
    yaxis: { ...BASE_LAYOUT.yaxis, title: '', range: [0.5, 4.5], showgrid: false },
    height: 500, width: 450,
    shapes: [
      { type: 'rect', x0: -0.708, x1: 0.708, y0: 1.5, y1: 3.5, line: { color: 'rgba(255,255,255,0.3)', width: 2 } },
    ],
  }

  return <Plot data={[trace]} layout={layout} config={{ displaylogo: false }} />
}
