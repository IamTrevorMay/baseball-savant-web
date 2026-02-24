'use client'
import { useEffect, useRef, useMemo, useState, RefObject } from 'react'
import { QualityPreset } from '@/lib/qualityPresets'

interface TemplateProps {
  data: any[]
  playerName: string
  quality: QualityPreset
  containerRef: RefObject<HTMLDivElement>
  onFrameUpdate?: (frame: number, total: number) => void
}

type ColorBy = 'bb_type' | 'events' | 'exit_velo'

const BB_TYPE_COLORS: Record<string, string> = {
  ground_ball: '#f59e0b',
  line_drive: '#10b981',
  fly_ball: '#0ea5e9',
  popup: '#a855f7',
}

const EVENT_COLORS: Record<string, string> = {
  single: '#10b981', double: '#0ea5e9', triple: '#a855f7',
  home_run: '#ef4444', field_out: '#52525b', grounded_into_double_play: '#71717a',
  force_out: '#71717a', sac_fly: '#f59e0b', field_error: '#f97316',
  fielders_choice: '#71717a', double_play: '#71717a', strikeout: '#3f3f46',
}

function evToColor(ev: number): string {
  // Gradient from blue (slow ~60mph) → green → yellow → red (hard ~115mph)
  const t = Math.max(0, Math.min(1, (ev - 60) / 55))
  if (t < 0.33) {
    const s = t / 0.33
    return `rgb(${Math.round(30 + s * 0)},${Math.round(100 + s * 155)},${Math.round(220 - s * 50)})`
  } else if (t < 0.66) {
    const s = (t - 0.33) / 0.33
    return `rgb(${Math.round(30 + s * 220)},${Math.round(255 - s * 35)},${Math.round(170 - s * 130)})`
  } else {
    const s = (t - 0.66) / 0.34
    return `rgb(${Math.round(250 - s * 10)},${Math.round(220 - s * 160)},${Math.round(40 - s * 10)})`
  }
}

// Statcast hc_x/hc_y coordinate system: home plate at approx (125, 200)
// x: 0-250, y: 0-250 (y increases downward in statcast, 0 is deep outfield)
const HOME_X = 125.42
const HOME_Y = 198.27

export default function SprayChartViz({ data, playerName, quality, containerRef }: TemplateProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [colorBy, setColorBy] = useState<ColorBy>('events')

  const battedBalls = useMemo(() => {
    return data.filter(d => d.hc_x != null && d.hc_y != null)
  }, [data])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = quality.resolution
    const cssW = container.clientWidth
    const cssH = container.clientHeight
    if (cssW === 0 || cssH === 0) return

    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Background
    ctx.fillStyle = '#09090b'
    ctx.fillRect(0, 0, cssW, cssH)

    // Scale to fit field in canvas
    // Map statcast coords to canvas: center at home plate
    const fieldSize = Math.min(cssW, cssH) * 0.9
    const scale = fieldSize / 250
    const offsetX = (cssW - 250 * scale) / 2
    const offsetY = cssH * 0.05

    function toCanvas(hcX: number, hcY: number): [number, number] {
      return [offsetX + hcX * scale, offsetY + hcY * scale]
    }

    // Draw field
    ctx.save()

    // Outfield arc (approximate fence)
    const [hx, hy] = toCanvas(HOME_X, HOME_Y)
    const fenceRadius = 160 * scale

    // Grass
    ctx.beginPath()
    ctx.moveTo(...toCanvas(HOME_X, HOME_Y))
    ctx.arc(hx, hy, fenceRadius, -Math.PI * 0.78, -Math.PI * 0.22)
    ctx.closePath()
    ctx.fillStyle = 'rgba(34, 90, 48, 0.15)'
    ctx.fill()

    // Infield dirt
    const infieldRadius = 65 * scale
    ctx.beginPath()
    ctx.arc(hx, hy - 30 * scale, infieldRadius, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(139, 101, 60, 0.08)'
    ctx.fill()

    // Foul lines
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1

    // Left foul line
    ctx.beginPath()
    ctx.moveTo(...toCanvas(HOME_X, HOME_Y))
    ctx.lineTo(...toCanvas(HOME_X - 130, HOME_Y - 130))
    ctx.stroke()

    // Right foul line
    ctx.beginPath()
    ctx.moveTo(...toCanvas(HOME_X, HOME_Y))
    ctx.lineTo(...toCanvas(HOME_X + 130, HOME_Y - 130))
    ctx.stroke()

    // Outfield fence arc
    ctx.beginPath()
    ctx.arc(hx, hy, fenceRadius, -Math.PI * 0.78, -Math.PI * 0.22)
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Home plate
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.beginPath()
    ctx.arc(hx, hy, 3, 0, Math.PI * 2)
    ctx.fill()

    // Base positions (approximate)
    const bases = [
      [HOME_X + 63, HOME_Y - 63],   // 1B
      [HOME_X, HOME_Y - 90],         // 2B
      [HOME_X - 63, HOME_Y - 63],    // 3B
    ]
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    for (const [bx, by] of bases) {
      const [cx, cy] = toCanvas(bx, by)
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(Math.PI / 4)
      ctx.fillRect(-3, -3, 6, 6)
      ctx.restore()
    }

    ctx.restore()

    // Plot batted balls
    const dotSize = quality.id === 'draft' ? 3 : quality.id === 'standard' ? 4 : 5
    for (const d of battedBalls) {
      const [cx, cy] = toCanvas(d.hc_x, d.hc_y)

      let color = '#52525b'
      if (colorBy === 'bb_type') {
        color = BB_TYPE_COLORS[d.bb_type] || '#52525b'
      } else if (colorBy === 'events') {
        color = EVENT_COLORS[d.events] || '#52525b'
      } else if (colorBy === 'exit_velo') {
        color = d.launch_speed != null ? evToColor(d.launch_speed) : '#3f3f46'
      }

      ctx.globalAlpha = 0.7
      ctx.beginPath()
      ctx.arc(cx, cy, dotSize, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Title
    ctx.font = `bold ${Math.max(12, Math.round(cssH * 0.028))}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(`${playerName} — Spray Chart`, 16, 28)

    // Count
    ctx.font = `${Math.max(10, Math.round(cssH * 0.018))}px Inter, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(161,161,170,0.7)'
    ctx.fillText(`${battedBalls.length} batted balls`, 16, cssH - 14)

    // Legend
    const legendItems = colorBy === 'bb_type'
      ? Object.entries(BB_TYPE_COLORS).map(([k, c]) => ({ label: k.replace(/_/g, ' '), color: c }))
      : colorBy === 'events'
        ? Object.entries(EVENT_COLORS).filter(([k]) => battedBalls.some(d => d.events === k)).map(([k, c]) => ({ label: k.replace(/_/g, ' '), color: c }))
        : [
            { label: '60 mph', color: evToColor(60) },
            { label: '85 mph', color: evToColor(85) },
            { label: '100 mph', color: evToColor(100) },
            { label: '115 mph', color: evToColor(115) },
          ]

    const legendX = cssW - 120
    let legendY = 20
    ctx.font = `${Math.max(9, Math.round(cssH * 0.015))}px Inter, system-ui, sans-serif`
    for (const item of legendItems) {
      ctx.fillStyle = item.color
      ctx.beginPath()
      ctx.arc(legendX, legendY + 4, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(228,228,231,0.7)'
      ctx.fillText(item.label, legendX + 10, legendY + 8)
      legendY += 16
    }
  }, [battedBalls, playerName, quality, colorBy, containerRef])

  // Observe container resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const canvas = canvasRef.current
    if (!canvas) return

    const obs = new ResizeObserver(() => {
      // Trigger re-render by updating state indirectly
      const event = new Event('resize')
      window.dispatchEvent(event)
    })
    obs.observe(container)
    return () => obs.disconnect()
  }, [containerRef])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#09090b' }}>
      {/* Color-by selector */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Color by</span>
        {(['events', 'bb_type', 'exit_velo'] as ColorBy[]).map(opt => (
          <button
            key={opt}
            onClick={() => setColorBy(opt)}
            className={`px-2 py-0.5 rounded text-[10px] border transition ${
              colorBy === opt
                ? 'bg-cyan-600/20 border-cyan-600/50 text-cyan-300'
                : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:text-white'
            }`}
          >
            {opt === 'bb_type' ? 'Type' : opt === 'exit_velo' ? 'Exit Velo' : 'Events'}
          </button>
        ))}
      </div>

      <canvas ref={canvasRef} style={{ display: 'block' }} aria-label="Spray chart visualization" />
    </div>
  )
}
