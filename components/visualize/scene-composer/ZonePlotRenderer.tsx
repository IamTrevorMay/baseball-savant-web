'use client'

import { useEffect, useRef } from 'react'
import { getPitchColor } from '@/components/chartConfig'

interface PitchLocation {
  plate_x: number
  plate_z: number
  pitch_name: string
}

interface Props {
  props: Record<string, any>
  width: number
  height: number
}

// Strike zone in feet
const ZONE_LEFT = -17 / 24   // -0.708 ft
const ZONE_RIGHT = 17 / 24   //  0.708 ft
const ZONE_BOT = 1.5
const ZONE_TOP = 3.5

// View bounds in feet
const VIEW_X_MIN = -2.5
const VIEW_X_MAX = 2.5
const VIEW_Z_MIN = 0
const VIEW_Z_MAX = 5

export default function ZonePlotRenderer({ props: p, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pitches: PitchLocation[] = p.pitches || []
  const showZone = p.showZone !== false
  const dotSize = p.dotSize || 8
  const dotOpacity = p.dotOpacity ?? 0.85
  const bgColor = p.bgColor || '#09090b'
  const showKey = p.showKey !== false
  const zoneColor = p.zoneColor || '#52525b'
  const zoneLineWidth = p.zoneLineWidth || 2
  const title = p.title || ''
  const fontSize = p.fontSize || 12

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    // Dynamic font sizing, overridden by explicit fontSize
    const dynFont = Math.max(11, Math.min(20, Math.floor(Math.min(width, height) * 0.05)))
    const effectiveFont = fontSize !== 12 ? fontSize : dynFont

    let titleOffset = 0
    if (title) {
      titleOffset = effectiveFont + 12
    }

    // Padding for key at bottom
    const keyHeight = showKey ? 50 : 0
    const plotH = height - keyHeight - titleOffset
    const padX = 30
    const padY = 20 + titleOffset
    const plotW = width - padX * 2
    const plotArea = plotH - padY * 2

    // Map coordinates
    function toCanvasX(plateX: number): number {
      return padX + ((plateX - VIEW_X_MIN) / (VIEW_X_MAX - VIEW_X_MIN)) * plotW
    }
    function toCanvasY(plateZ: number): number {
      // Invert: higher z = higher on screen (lower y)
      return padY + ((VIEW_Z_MAX - plateZ) / (VIEW_Z_MAX - VIEW_Z_MIN)) * plotArea
    }

    // Background
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)

    // Title
    if (title) {
      ctx.fillStyle = '#a1a1aa'
      ctx.font = `600 ${effectiveFont}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(title, width / 2, 6)
    }

    // Strike zone
    if (showZone) {
      const zx1 = toCanvasX(ZONE_LEFT)
      const zx2 = toCanvasX(ZONE_RIGHT)
      const zy1 = toCanvasY(ZONE_TOP)
      const zy2 = toCanvasY(ZONE_BOT)

      ctx.strokeStyle = zoneColor
      ctx.lineWidth = zoneLineWidth
      ctx.strokeRect(zx1, zy1, zx2 - zx1, zy2 - zy1)

      // Inner grid (3x3)
      ctx.strokeStyle = zoneColor
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.4
      const zw = (zx2 - zx1) / 3
      const zh = (zy2 - zy1) / 3
      for (let i = 1; i < 3; i++) {
        ctx.beginPath()
        ctx.moveTo(zx1 + zw * i, zy1)
        ctx.lineTo(zx1 + zw * i, zy2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(zx1, zy1 + zh * i)
        ctx.lineTo(zx2, zy1 + zh * i)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Home plate
      const px = toCanvasX(0)
      const py = toCanvasY(0)
      ctx.fillStyle = zoneColor
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.moveTo(px - 8, py)
      ctx.lineTo(px - 4, py + 6)
      ctx.lineTo(px + 4, py + 6)
      ctx.lineTo(px + 8, py)
      ctx.lineTo(px, py - 4)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // Pitch dots
    for (const pitch of pitches) {
      const cx = toCanvasX(pitch.plate_x)
      const cy = toCanvasY(pitch.plate_z)
      const color = getPitchColor(pitch.pitch_name)

      ctx.globalAlpha = dotOpacity
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(cx, cy, dotSize / 2, 0, Math.PI * 2)
      ctx.fill()

      // Subtle border
      ctx.globalAlpha = dotOpacity * 0.4
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.5
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Key/legend
    if (showKey && pitches.length > 0) {
      const uniqueTypes = [...new Set(pitches.map(p => p.pitch_name))].filter(Boolean)
      const keyY = plotH + 10
      const entryW = Math.min(120, (width - 20) / Math.max(uniqueTypes.length, 1))
      const startX = (width - entryW * uniqueTypes.length) / 2

      ctx.font = `${Math.max(9, effectiveFont - 1)}px Inter, system-ui, sans-serif`
      ctx.textBaseline = 'middle'

      for (let i = 0; i < uniqueTypes.length; i++) {
        const type = uniqueTypes[i]
        const ex = startX + i * entryW
        const ey = keyY + 15

        // Color dot
        ctx.fillStyle = getPitchColor(type)
        ctx.beginPath()
        ctx.arc(ex + 6, ey, 5, 0, Math.PI * 2)
        ctx.fill()

        // Label
        ctx.fillStyle = '#a1a1aa'
        ctx.textAlign = 'left'
        ctx.fillText(type, ex + 15, ey)
      }
    }
  }, [pitches, width, height, showZone, dotSize, dotOpacity, bgColor, showKey, zoneColor, zoneLineWidth, title, fontSize])

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block"
    />
  )
}
