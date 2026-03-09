'use client'

import { useEffect, useRef, useCallback } from 'react'
import { getPitchColor } from '@/components/chartConfig'

const ZONE_LEFT = -17 / 24
const ZONE_RIGHT = 17 / 24
const ZONE_BOT = 1.5
const ZONE_TOP = 3.5
const VIEW_X_MIN = -2.5
const VIEW_X_MAX = 2.5
const VIEW_Z_MIN = 0
const VIEW_Z_MAX = 5

interface InteractiveZoneProps {
  mode: 'target' | 'review' | 'results'
  width: number
  height: number
  target?: { x: number; z: number } | null
  onTargetSet?: (x: number, z: number) => void
  actualPitch?: { plate_x: number; plate_z: number; pitch_name: string }
  allPitches?: Array<{ plate_x: number; plate_z: number; pitch_name: string; score: number }>
  allTargets?: Array<{ x: number; z: number }>
}

function toCanvasX(plateX: number, padX: number, plotW: number): number {
  return padX + ((plateX - VIEW_X_MIN) / (VIEW_X_MAX - VIEW_X_MIN)) * plotW
}

function toCanvasY(plateZ: number, padY: number, plotArea: number): number {
  return padY + ((VIEW_Z_MAX - plateZ) / (VIEW_Z_MAX - VIEW_Z_MIN)) * plotArea
}

function toPlateX(canvasX: number, padX: number, plotW: number): number {
  return VIEW_X_MIN + ((canvasX - padX) / plotW) * (VIEW_X_MAX - VIEW_X_MIN)
}

function toPlateZ(canvasY: number, padY: number, plotArea: number): number {
  return VIEW_Z_MAX - ((canvasY - padY) / plotArea) * (VIEW_Z_MAX - VIEW_Z_MIN)
}

export default function InteractiveZone({
  mode, width, height, target, onTargetSet, actualPitch, allPitches, allTargets
}: InteractiveZoneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const padX = 30
  const padY = 20
  const keyHeight = mode === 'results' ? 50 : 0
  const plotH = height - keyHeight
  const plotW = width - padX * 2
  const plotArea = plotH - padY * 2

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const cx = (x: number) => toCanvasX(x, padX, plotW)
    const cy = (z: number) => toCanvasY(z, padY, plotArea)

    // Background
    ctx.fillStyle = '#09090b'
    ctx.fillRect(0, 0, width, height)

    // Strike zone outline
    const zx1 = cx(ZONE_LEFT)
    const zx2 = cx(ZONE_RIGHT)
    const zy1 = cy(ZONE_TOP)
    const zy2 = cy(ZONE_BOT)

    ctx.strokeStyle = '#52525b'
    ctx.lineWidth = 2
    ctx.strokeRect(zx1, zy1, zx2 - zx1, zy2 - zy1)

    // 3×3 grid
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
    const px = cx(0)
    const py = cy(0)
    ctx.fillStyle = '#52525b'
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

    // ── Mode: target ──
    if (mode === 'target' && target) {
      drawCrosshair(ctx, cx(target.x), cy(target.z), '#f59e0b', 14)
    }

    // ── Mode: review ──
    if (mode === 'review') {
      if (target) {
        drawCrosshair(ctx, cx(target.x), cy(target.z), '#f59e0b', 14)
      }
      if (actualPitch) {
        const ax = cx(actualPitch.plate_x)
        const ay = cy(actualPitch.plate_z)
        const color = getPitchColor(actualPitch.pitch_name)

        // Actual pitch dot
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(ax, ay, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1
        ctx.stroke()

        // Dashed line from target to actual
        if (target) {
          const tx = cx(target.x)
          const ty = cy(target.z)
          ctx.setLineDash([4, 4])
          ctx.strokeStyle = '#a1a1aa'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(tx, ty)
          ctx.lineTo(ax, ay)
          ctx.stroke()
          ctx.setLineDash([])

          // Distance label
          const dx = (actualPitch.plate_x - target.x) * 12
          const dz = (actualPitch.plate_z - target.z) * 12
          const dist = Math.sqrt(dx * dx + dz * dz)
          const midX = (tx + ax) / 2
          const midY = (ty + ay) / 2
          ctx.font = 'bold 12px Inter, system-ui, sans-serif'
          ctx.fillStyle = '#e4e4e7'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.fillText(`${dist.toFixed(1)}"`, midX, midY - 4)
        }
      }
    }

    // ── Mode: results ──
    if (mode === 'results') {
      // Draw targets as amber × marks
      if (allTargets) {
        for (const t of allTargets) {
          const tx = cx(t.x)
          const tz = cy(t.z)
          ctx.strokeStyle = '#f59e0b'
          ctx.lineWidth = 1.5
          ctx.globalAlpha = 0.5
          const s = 4
          ctx.beginPath()
          ctx.moveTo(tx - s, tz - s)
          ctx.lineTo(tx + s, tz + s)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(tx + s, tz - s)
          ctx.lineTo(tx - s, tz + s)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      // Draw all pitches as colored dots
      if (allPitches) {
        for (const p of allPitches) {
          const ax = cx(p.plate_x)
          const ay = cy(p.plate_z)
          const color = getPitchColor(p.pitch_name)
          ctx.globalAlpha = 0.85
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(ax, ay, 4, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 0.5
          ctx.globalAlpha = 0.3
          ctx.stroke()
        }
        ctx.globalAlpha = 1

        // Legend
        const uniqueTypes = [...new Set(allPitches.map(p => p.pitch_name))].filter(Boolean)
        const legendY = plotH + 10
        const entryW = Math.min(120, (width - 20) / Math.max(uniqueTypes.length, 1))
        const startX = (width - entryW * uniqueTypes.length) / 2

        ctx.font = '11px Inter, system-ui, sans-serif'
        ctx.textBaseline = 'middle'

        for (let i = 0; i < uniqueTypes.length; i++) {
          const type = uniqueTypes[i]
          const ex = startX + i * entryW
          const ey = legendY + 15
          ctx.fillStyle = getPitchColor(type)
          ctx.beginPath()
          ctx.arc(ex + 6, ey, 5, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#a1a1aa'
          ctx.textAlign = 'left'
          ctx.fillText(type, ex + 15, ey)
        }
      }
    }
  }, [mode, width, height, target, actualPitch, allPitches, allTargets, padX, padY, plotW, plotArea, plotH, keyHeight])

  useEffect(() => { draw() }, [draw])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'target' || !onTargetSet) return
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const cssX = e.clientX - rect.left
    const cssY = e.clientY - rect.top

    const plateX = toPlateX(cssX, padX, plotW)
    const plateZ = toPlateZ(cssY, padY, plotArea)

    // Clamp to view bounds
    const clampedX = Math.max(VIEW_X_MIN, Math.min(VIEW_X_MAX, plateX))
    const clampedZ = Math.max(VIEW_Z_MIN, Math.min(VIEW_Z_MAX, plateZ))

    onTargetSet(clampedX, clampedZ)
  }, [mode, onTargetSet, padX, padY, plotW, plotArea])

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, cursor: mode === 'target' ? 'crosshair' : 'default' }}
      className="block"
      onClick={handleClick}
    />
  )
}

function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x - size, y)
  ctx.lineTo(x + size, y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x, y - size)
  ctx.lineTo(x, y + size)
  ctx.stroke()

  // Center dot
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, 3, 0, Math.PI * 2)
  ctx.fill()
}
