'use client'

import { useEffect, useRef } from 'react'
import { getPitchColor } from '@/components/chartConfig'

interface UsageItem {
  label: string
  value: number
  color?: string
}

interface Props {
  props: Record<string, any>
  width: number
  height: number
}

export default function RCDonutChartRenderer({ props: p, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const usageData: UsageItem[] = p.usageData || []
  const innerRadius = p.innerRadius ?? 0.55
  const showLabels = p.showLabels !== false
  const fontSize = p.fontSize || 12
  const bgColor = p.bgColor || '#09090b'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)

    if (usageData.length === 0) {
      ctx.fillStyle = '#52525b'
      ctx.font = '12px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('No data — generate to populate', width / 2, height / 2)
      return
    }

    const total = usageData.reduce((s, d) => s + d.value, 0)
    if (total === 0) return

    const cx = width / 2
    const cy = height / 2
    const outerR = Math.min(width, height) / 2 - 30
    const innerR = outerR * innerRadius

    let angle = -Math.PI / 2

    for (const item of usageData) {
      const sliceAngle = (item.value / total) * Math.PI * 2
      const color = item.color || getPitchColor(item.label)

      ctx.beginPath()
      ctx.arc(cx, cy, outerR, angle, angle + sliceAngle)
      ctx.arc(cx, cy, innerR, angle + sliceAngle, angle, true)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()

      // Separator line
      ctx.strokeStyle = bgColor
      ctx.lineWidth = 2
      ctx.stroke()

      // Label
      if (showLabels && sliceAngle > 0.15) {
        const midAngle = angle + sliceAngle / 2
        const labelR = outerR + 16
        const lx = cx + labelR * Math.cos(midAngle)
        const ly = cy + labelR * Math.sin(midAngle)

        ctx.fillStyle = '#a1a1aa'
        ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`
        ctx.textAlign = midAngle > Math.PI / 2 && midAngle < 3 * Math.PI / 2 ? 'right' : 'left'
        ctx.textBaseline = 'middle'

        const pct = ((item.value / total) * 100).toFixed(0)
        ctx.fillText(`${item.label} ${pct}%`, lx, ly)
      }

      angle += sliceAngle
    }

    // Center circle (for donut hole)
    ctx.beginPath()
    ctx.arc(cx, cy, innerR - 1, 0, Math.PI * 2)
    ctx.fillStyle = bgColor
    ctx.fill()
  }, [usageData, width, height, innerRadius, showLabels, fontSize, bgColor])

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block"
    />
  )
}
