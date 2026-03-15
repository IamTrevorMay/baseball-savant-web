'use client'

import { useEffect, useRef } from 'react'

interface Props {
  props: Record<string, any>
  width: number
  height: number
}

// Strike zone in feet
const ZONE_LEFT = -17 / 24
const ZONE_RIGHT = 17 / 24
const ZONE_BOT = 1.5
const ZONE_TOP = 3.5

const VIEW_X_MIN = -2.0
const VIEW_X_MAX = 2.0
const VIEW_Z_MIN = 0.5
const VIEW_Z_MAX = 4.5

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)]
}

function interpolateColor(low: string, high: string, t: number): string {
  const [lr, lg, lb] = hexToRgb(low)
  const [hr, hg, hb] = hexToRgb(high)
  const r = Math.round(lr + (hr - lr) * t)
  const g = Math.round(lg + (hg - lg) * t)
  const b = Math.round(lb + (hb - lb) * t)
  return `rgb(${r},${g},${b})`
}

export default function RCHeatmapRenderer({ props: p, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const locations: { plate_x: number; plate_z: number; pitch_name: string }[] = p.locations || []
  const binsX = p.binsX || 5
  const binsY = p.binsY || 5
  const colorLow = p.colorLow || '#18181b'
  const colorHigh = p.colorHigh || '#ef4444'
  const showZone = p.showZone !== false
  const bgColor = p.bgColor || '#09090b'
  const title = p.title || ''

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    // Dynamic font sizing based on container
    const dynFont = Math.max(12, Math.min(20, Math.floor(Math.min(width, height) * 0.055)))

    let titleOffset = 0
    if (title) {
      titleOffset = dynFont + 12
    }
    const pad = 25
    const plotW = width - pad * 2
    const plotH = height - pad * 2 - titleOffset

    function toX(plateX: number): number {
      return pad + ((plateX - VIEW_X_MIN) / (VIEW_X_MAX - VIEW_X_MIN)) * plotW
    }
    function toY(plateZ: number): number {
      return pad + titleOffset + ((VIEW_Z_MAX - plateZ) / (VIEW_Z_MAX - VIEW_Z_MIN)) * plotH
    }

    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)

    if (title) {
      ctx.fillStyle = '#a1a1aa'
      ctx.font = `600 ${dynFont}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(title, width / 2, 6)
    }

    // Bin the pitches
    const bins: number[][] = Array.from({ length: binsY }, () => Array(binsX).fill(0))
    let maxCount = 0

    for (const loc of locations) {
      const bx = Math.floor(((loc.plate_x - VIEW_X_MIN) / (VIEW_X_MAX - VIEW_X_MIN)) * binsX)
      const by = Math.floor(((VIEW_Z_MAX - loc.plate_z) / (VIEW_Z_MAX - VIEW_Z_MIN)) * binsY)
      if (bx >= 0 && bx < binsX && by >= 0 && by < binsY) {
        bins[by][bx]++
        if (bins[by][bx] > maxCount) maxCount = bins[by][bx]
      }
    }

    // Draw heatmap cells
    const cellW = plotW / binsX
    const cellH = plotH / binsY

    for (let row = 0; row < binsY; row++) {
      for (let col = 0; col < binsX; col++) {
        const count = bins[row][col]
        const t = maxCount > 0 ? count / maxCount : 0
        ctx.fillStyle = interpolateColor(colorLow, colorHigh, t)
        ctx.globalAlpha = Math.max(0.3, t)
        ctx.fillRect(pad + col * cellW, pad + titleOffset + row * cellH, cellW, cellH)

        // Count label
        if (count > 0) {
          ctx.globalAlpha = 0.9
          ctx.fillStyle = t > 0.5 ? '#ffffff' : '#a1a1aa'
          const cellFont = Math.max(10, Math.min(18, Math.floor(Math.min(cellW, cellH) * 0.4)))
          ctx.font = `${cellFont}px Inter, system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(count), pad + col * cellW + cellW / 2, pad + titleOffset + row * cellH + cellH / 2)
        }
      }
    }
    ctx.globalAlpha = 1

    // Strike zone overlay
    if (showZone) {
      const zx1 = toX(ZONE_LEFT)
      const zx2 = toX(ZONE_RIGHT)
      const zy1 = toY(ZONE_TOP)
      const zy2 = toY(ZONE_BOT)

      ctx.strokeStyle = '#71717a'
      ctx.lineWidth = 2
      ctx.strokeRect(zx1, zy1, zx2 - zx1, zy2 - zy1)
    }
  }, [locations, width, height, binsX, binsY, colorLow, colorHigh, showZone, bgColor, title])

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block"
    />
  )
}
