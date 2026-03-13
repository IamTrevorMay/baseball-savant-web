'use client'

import { useEffect, useRef } from 'react'
import { getPitchColor } from '@/components/chartConfig'

interface BarDataItem {
  label: string
  value: number
  color?: string
}

interface Props {
  props: Record<string, any>
  width: number
  height: number
}

export default function RCBarChartRenderer({ props: p, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const barData: BarDataItem[] = p.barData || []
  const orientation = p.orientation || 'horizontal'
  const showValues = p.showValues !== false
  const fontSize = p.fontSize || 12
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

    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)

    // Title
    let titleOffset = 0
    if (title) {
      titleOffset = 28
      ctx.fillStyle = '#a1a1aa'
      ctx.font = `600 ${Math.max(10, fontSize)}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(title, width / 2, 8)
    }

    if (barData.length === 0) {
      ctx.fillStyle = '#52525b'
      ctx.font = '12px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('No data — generate to populate', width / 2, height / 2)
      return
    }

    const maxVal = Math.max(...barData.map(d => d.value), 1)
    const pad = { top: 15 + titleOffset, right: 15, bottom: 15, left: 80 }
    const plotW = width - pad.left - pad.right
    const plotH = height - pad.top - pad.bottom

    if (orientation === 'horizontal') {
      const barH = Math.min(30, (plotH - (barData.length - 1) * 6) / barData.length)
      const totalH = barData.length * barH + (barData.length - 1) * 6
      const startY = pad.top + (plotH - totalH) / 2

      for (let i = 0; i < barData.length; i++) {
        const d = barData[i]
        const y = startY + i * (barH + 6)
        const barW = (d.value / maxVal) * plotW
        const color = d.color || getPitchColor(d.label)

        // Label
        ctx.fillStyle = '#a1a1aa'
        ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(d.label, pad.left - 8, y + barH / 2)

        // Bar bg
        ctx.fillStyle = '#27272a'
        ctx.beginPath()
        ctx.roundRect(pad.left, y, plotW, barH, 4)
        ctx.fill()

        // Bar fill
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.roundRect(pad.left, y, Math.max(barW, 4), barH, 4)
        ctx.fill()

        // Value
        if (showValues) {
          ctx.fillStyle = '#e4e4e7'
          ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`
          ctx.textAlign = 'left'
          ctx.fillText(
            typeof d.value === 'number' ? (d.value % 1 ? d.value.toFixed(1) : String(d.value)) : String(d.value),
            pad.left + Math.max(barW, 4) + 6,
            y + barH / 2
          )
        }
      }
    } else {
      // Vertical bars
      const barW = Math.min(40, (plotW - (barData.length - 1) * 8) / barData.length)
      const totalW = barData.length * barW + (barData.length - 1) * 8
      const startX = pad.left + (plotW - totalW) / 2

      for (let i = 0; i < barData.length; i++) {
        const d = barData[i]
        const x = startX + i * (barW + 8)
        const barH = (d.value / maxVal) * plotH
        const color = d.color || getPitchColor(d.label)

        // Bar bg
        ctx.fillStyle = '#27272a'
        ctx.beginPath()
        ctx.roundRect(x, pad.top, barW, plotH, 4)
        ctx.fill()

        // Bar fill
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.roundRect(x, pad.top + plotH - barH, barW, Math.max(barH, 4), 4)
        ctx.fill()

        // Label
        ctx.fillStyle = '#a1a1aa'
        ctx.font = `500 ${Math.max(9, fontSize - 2)}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(d.label, x + barW / 2, pad.top + plotH + 4)

        // Value
        if (showValues) {
          ctx.fillStyle = '#e4e4e7'
          ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`
          ctx.textBaseline = 'bottom'
          ctx.fillText(
            typeof d.value === 'number' ? (d.value % 1 ? d.value.toFixed(1) : String(d.value)) : String(d.value),
            x + barW / 2,
            pad.top + plotH - barH - 4
          )
        }
      }
    }
  }, [barData, width, height, orientation, showValues, fontSize, bgColor, title])

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block"
    />
  )
}
