'use client'

import { useEffect, useRef } from 'react'
import { getPitchColor } from '@/components/chartConfig'

interface MovementPitch {
  hb: number   // horizontal break in inches
  ivb: number  // induced vertical break in inches
  pitch_name: string
}

interface SeasonShape {
  pitch_name: string
  avg_hb: number
  avg_ivb: number
  std_hb: number
  std_ivb: number
}

interface Props {
  props: Record<string, any>
  width: number
  height: number
}

export default function MovementPlotRenderer({ props: p, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Normalize pitches: accept hb/ivb (correct) or pfx_x/pfx_z (Statcast raw, in feet → convert to inches)
  const pitches: MovementPitch[] = (p.pitches || []).map((pt: any) => {
    if (pt.hb !== undefined && pt.ivb !== undefined) return pt as MovementPitch
    // Fallback: pfx_x/pfx_z in feet → multiply by 12 for inches
    const rawHb = pt.pfx_x ?? pt.hb ?? 0
    const rawIvb = pt.pfx_z ?? pt.ivb ?? 0
    const needsConversion = Math.abs(rawHb) < 5 && Math.abs(rawIvb) < 5 // heuristic: feet if values are small
    return {
      hb: needsConversion ? rawHb * 12 : rawHb,
      ivb: needsConversion ? rawIvb * 12 : rawIvb,
      pitch_name: pt.pitch_name || 'Unknown',
    }
  })
  const seasonShapes: SeasonShape[] = p.seasonShapes || []
  const bgColor = p.bgColor || '#09090b'
  const dotSize = p.dotSize || 10
  const dotOpacity = p.dotOpacity ?? 0.85
  const showSeasonShapes = p.showSeasonShapes !== false
  const maxRange = p.maxRange || 24
  const fontSize = p.fontSize || 10

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const pad = 30
    const plotW = width - pad * 2
    const plotH = height - pad * 2

    // Map inches to canvas coords — centered at 0,0
    function toX(hb: number): number {
      return pad + ((hb + maxRange) / (maxRange * 2)) * plotW
    }
    function toY(ivb: number): number {
      // Higher IVB = higher on screen (lower canvas Y)
      return pad + ((maxRange - ivb) / (maxRange * 2)) * plotH
    }

    // Background
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)

    const cx = toX(0)
    const cy = toY(0)

    // Concentric circles at 12" and 24"
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = '#3f3f46'
    ctx.lineWidth = 1
    for (const radius of [12, 24]) {
      const rx = (radius / (maxRange * 2)) * plotW
      const ry = (radius / (maxRange * 2)) * plotH
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Axes through center
    ctx.strokeStyle = '#52525b'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pad, cy)
    ctx.lineTo(width - pad, cy)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx, pad)
    ctx.lineTo(cx, height - pad)
    ctx.stroke()

    // Dynamic font sizing, overridden by explicit fontSize
    const dynFont = Math.max(9, Math.min(16, Math.floor(Math.min(width, height) * 0.035)))
    const effectiveFont = fontSize !== 10 ? fontSize : dynFont

    // Tick marks at 12" and 24" with numeric labels
    ctx.fillStyle = '#71717a'
    ctx.font = `${Math.max(7, effectiveFont - 1)}px Inter, system-ui, sans-serif`
    ctx.strokeStyle = '#52525b'
    // Horizontal axis ticks + labels
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const val of [12, -12]) {
      const tx = toX(val)
      ctx.beginPath()
      ctx.moveTo(tx, cy - 3)
      ctx.lineTo(tx, cy + 3)
      ctx.stroke()
      ctx.fillText(`${val}"`, tx, cy + 5)
    }
    // Vertical axis ticks + labels
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const val of [12, -12]) {
      const ty = toY(val)
      ctx.beginPath()
      ctx.moveTo(cx - 3, ty)
      ctx.lineTo(cx + 3, ty)
      ctx.stroke()
      ctx.fillText(`${val}"`, cx - 6, ty)
    }

    // Axis labels
    ctx.fillStyle = '#71717a'
    ctx.font = `${effectiveFont}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText('Rise', cx, pad - 4)
    ctx.textBaseline = 'top'
    ctx.fillText('Drop', cx, height - pad + 4)
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText('Glove', pad - 4, cy)
    ctx.textAlign = 'left'
    ctx.fillText('Arm', width - pad + 4, cy)

    // Season shapes (ellipses: avg ± 1 stddev)
    if (showSeasonShapes && seasonShapes.length > 0) {
      for (const shape of seasonShapes) {
        const sx = toX(shape.avg_hb)
        const sy = toY(shape.avg_ivb)
        const rx = (shape.std_hb / (maxRange * 2)) * plotW
        const ry = (shape.std_ivb / (maxRange * 2)) * plotH
        const color = getPitchColor(shape.pitch_name)

        ctx.globalAlpha = 0.15
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.ellipse(sx, sy, Math.max(rx, 2), Math.max(ry, 2), 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.globalAlpha = 0.3
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }

    // Pitch dots
    for (const pitch of pitches) {
      const px = toX(pitch.hb)
      const py = toY(pitch.ivb)
      const color = getPitchColor(pitch.pitch_name)

      ctx.globalAlpha = dotOpacity
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(px, py, dotSize / 2, 0, Math.PI * 2)
      ctx.fill()

      ctx.globalAlpha = dotOpacity * 0.4
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.5
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }, [pitches, seasonShapes, width, height, bgColor, dotSize, dotOpacity, showSeasonShapes, maxRange, fontSize])

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block"
    />
  )
}
